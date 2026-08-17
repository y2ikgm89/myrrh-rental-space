/**
 * **プール枯渇の alert が拾う文字列は、実際に投げられる文字列でなければならない。**
 *
 * ## なぜ
 *
 * `terraform/monitoring.tf` の `google_logging_metric.prisma_pool_timeout` は当初
 * （YAML 時代の `infra/monitoring/log-metrics/prisma-pool-timeout.yaml` を含む）
 * `"Timed out fetching a new connection from the connection pool"` と
 * `P2024` / `P2028` を見ていた。これは Prisma の **Rust query engine** が持つ
 * プールのエラーで、この app の構成（Prisma 7 + `@prisma/adapter-pg`）では
 * 一度も出ない — プールは node-postgres の `pg.Pool` だからである。
 * 結果、4 分岐すべてが何にも当たらず、`prisma-pool-timeout` alert は
 * **発火しようがない状態**だった。`docs/observability/alerting.md` は同じ signal を
 * 「負荷で最初に落ちる崖」と書いていたので、監視しているつもりで穴が空いていた。
 *
 * 転写では気づけない。**実際に枯渇させて、出た文字列を読む。**
 *
 * ## DB は要らない
 *
 * 接続を受け付けるが Postgres の handshake を返さない socket を立てると、
 * 1 本目が `max: 1` の唯一のスロットを掴んだまま進まない。そこへ 2 本目を
 * 流すと acquire deadline に落ちる。DB プロセスは要らない。
 *
 * ## 何を見るか
 *
 * 観測したメッセージが、log metric の filter のいずれかの分岐に**実際に**
 * 一致すること。文字列を test 側に書き写すのではなく、YAML から読んで突き合わせる
 * （書き写すと、この gate 自身が次の drift の発生源になる）。
 */

import { createServer, type Server } from "node:net";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { PrismaClient } from "@generated/prisma/client";

const METRIC_PATH = join(process.cwd(), "terraform", "monitoring.tf");

/** `prisma_pool_timeout` の filter heredoc から `"..."` を全部拾う。 */
export function readFilterMatchStrings(metricHcl: string): string[] {
  const block =
    /resource\s+"google_logging_metric"\s+"prisma_pool_timeout"\s+\{[\s\S]*?filter\s*=\s*<<-EOT\n([\s\S]*?)\n\s*EOT/u.exec(
      metricHcl,
    )?.[1] ?? "";
  return [...block.matchAll(/"([^"]+)"/gu)].map((match) => match[1] ?? "");
}

let server: Server;
let port = 0;

beforeAll(async () => {
  server = createServer(() => {
    // 接続は受けるが何も返さない。handshake が終わらないので接続は解放されない。
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  port = typeof address === "object" && address !== null ? address.port : 0;
});

afterAll(() => {
  server.close();
});

/** プールを枯渇させ、2 本目のクエリが受け取ったエラーメッセージを返す。 */
async function observeAcquireTimeoutMessage(): Promise<string> {
  const adapter = new PrismaPg({
    connectionString: `postgresql://probe:probe@127.0.0.1:${port}/probe`,
    max: 1,
    connectionTimeoutMillis: 400,
  });
  const prisma = new PrismaClient({ adapter });
  const [, second] = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    new Promise((resolve) => setTimeout(resolve, 150)).then(() => {
      return prisma.$queryRaw`SELECT 2`;
    }),
  ]);
  if (second?.status !== "rejected") {
    throw new Error("2 本目が失敗しなかった（プールが枯渇していない）");
  }
  const reason: unknown = second.reason;
  return reason instanceof Error ? reason.message : String(reason);
}

describe("プール枯渇の signal は log metric の filter に一致する", () => {
  test("filter から一致対象の文字列が読めている（gate が空振りしていない）", () => {
    const strings = readFilterMatchStrings(readFileSync(METRIC_PATH, "utf8"));
    expect(strings).toContain("cloud_run_revision");
    expect(strings.length).toBeGreaterThan(3);
  });

  test("acquire timeout の実メッセージが filter のどれかに当たる", async () => {
    const message = await observeAcquireTimeoutMessage();
    const strings = readFilterMatchStrings(readFileSync(METRIC_PATH, "utf8"));

    expect({
      message,
      matched: strings.some((candidate) => message.includes(candidate)),
      hint: "pg / Prisma の更新で文言が変わったら、log metric の filter を実測値へ直す（テスト側に書き写さない）",
    }).toEqual({
      message,
      matched: true,
      hint: "pg / Prisma の更新で文言が変わったら、log metric の filter を実測値へ直す（テスト側に書き写さない）",
    });
  });

  test("Rust query engine 由来のプールエラーは出ない（driver adapter 構成）", async () => {
    const message = await observeAcquireTimeoutMessage();
    // この 3 つを filter に戻すと、また何にも当たらない分岐が生える。
    expect(message).not.toContain(
      "Timed out fetching a new connection from the connection pool",
    );
    expect(message).not.toContain("P2024");
    expect(message).not.toContain("P2028");
  });
});
