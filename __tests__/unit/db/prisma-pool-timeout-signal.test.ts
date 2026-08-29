/**
 * **`prisma_pool_timeout` は「満杯のプールで acquire を待って諦めた」だけを数える。**
 *
 * ## なぜ（1）: 文言が実測とずれると発火しようがない
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
 * ## なぜ（2）: 性質の違う事象を混ぜると、alert の題が誤診を誘導する
 *
 * `pg.Pool` は `connectionTimeoutMillis` を **2 か所**で使う
 * （`node_modules/pg-pool/index.js`）。出る文言が違い、直し方も違う。
 *
 * - `connect()` の待ち行列 … `timeout exceeded when trying to connect`。
 *   満杯のプールで空きを待って期限切れ。見るのは `DATABASE_POOL_MAX` と長トランザクション。
 * - `newClient()` … `Connection terminated due to connection timeout`。
 *   **新規接続の確立**が期限切れ。プールに空きがあるからこそ通る経路で、
 *   プールの大きさとは無関係。見るのは接続先（Neon）に届くかどうか。
 *
 * さらに `logPoolError`（`context.operation="prismaPool"`）は
 * **クエリが乗っていないアイドル接続**が切れた記録で、失敗ですらない。
 *
 * 本番 30 日で metric に当たった 638 件の内訳（`gcloud logging read` で確認）:
 *
 * - **573 件** アイドル接続の切断（`operation="prismaPool"`。ほぼ全部
 *   `Connection terminated unexpectedly` = Neon のアイドル切断）
 * - **63 件** 接続確立の期限切れ（Neon cold start。#2778 で予算 5s→10s）
 * - **2 件** 本物の acquire timeout（1 事象。structured log と Prisma の
 *   `prisma:error` textPayload で 2 行になる）
 *
 * 閾値 5 件 / 5 分を **33 窓**が超えていた。つまり「Prisma pool acquire timeout」と
 * 題して開くインシデントの中身が、ほぼ全部プールと無関係だった。混ざったままだと
 * runbook を書き足しても、alert の題そのものが誤診を誘導する。
 *
 * ## DB は要らない
 *
 * 接続を受け付けるが Postgres の handshake を返さない socket を立てると、
 * 1 本目が `max: 1` の唯一のスロットを掴んだまま進まない。1 本目は
 * `newClient()` の期限で、2 本目は acquire の期限で落ちるので、
 * **1 回のプローブで両方の実文言が採れる**。DB プロセスは要らない。
 *
 * ## 何を見るか
 *
 * 1. acquire timeout の実メッセージが filter のどれかに当たる（空振り検出）
 * 2. 接続確立失敗の実メッセージは filter に**当たらない**（混入検出）
 * 3. プールエラー listener の operation 名を filter が拾っていない（混入検出）
 *
 * 文字列は test 側に書き写さず、2 つとも実際に起こして読む（書き写すと、この gate
 * 自身が次の drift の発生源になる）。3 の operation 名も `src/shared/db/prisma.ts`
 * から読む。
 *
 * ## 直し方
 *
 * pg / Prisma の更新で acquire の文言が変わったら、log metric の filter を実測値へ
 * 直す。接続確立の失敗を検知したくなったときも、この metric には足さない —
 * cron 経路は `cron_job_failure`（endpoint 単位）、定期の到達性は
 * `db_health_probe_failure` が既に見ている（`docs/observability/alerting.md`）。
 */

import { createServer, type Server } from "node:net";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { PrismaClient } from "@generated/prisma/client";

const ROOT = process.cwd();
const METRIC_PATH = join(ROOT, "terraform", "monitoring.tf");
const PRISMA_PATH = join(ROOT, "src", "shared", "db", "prisma.ts");

/** `prisma_pool_timeout` の filter heredoc 本文。 */
function readFilterBlock(metricHcl: string): string {
  return (
    /resource\s+"google_logging_metric"\s+"prisma_pool_timeout"\s+\{[\s\S]*?filter\s*=\s*<<-EOT\n([\s\S]*?)\n\s*EOT/u.exec(
      metricHcl,
    )?.[1] ?? ""
  );
}

/** `prisma_pool_timeout` の filter heredoc から `"..."` を全部拾う。 */
export function readFilterMatchStrings(metricHcl: string): string[] {
  return [...readFilterBlock(metricHcl).matchAll(/"([^"]+)"/gu)].map(
    (match) => match[1] ?? "",
  );
}

/** `logPoolError` がプールエラーに付ける operation 名。 */
function readPoolErrorOperation(prismaSource: string): string {
  const operation =
    /context:\s*\{\s*operation:\s*"([^"]+)",\s*source\s*\}/u.exec(
      prismaSource,
    )?.[1];
  if (!operation) {
    throw new Error("logPoolError の operation 名が prisma.ts から読めない");
  }
  return operation;
}

let server: Server;
let port = 0;
let acquireMessage = "";
let connectMessage = "";

/**
 * プールを枯渇させ、2 本のクエリが受け取ったエラーメッセージを返す。
 *
 * `max: 1` なので 1 本目は `newClient()`（＝新規接続の確立）で、2 本目は
 * 満杯のプールの待ち行列（＝acquire）で期限切れになる。
 */
async function observePoolTimeoutMessages(): Promise<{
  acquire: string;
  connect: string;
}> {
  const adapter = new PrismaPg({
    connectionString: `postgresql://probe:probe@127.0.0.1:${port}/probe`,
    max: 1,
    connectionTimeoutMillis: 400,
  });
  const prisma = new PrismaClient({ adapter });
  const [first, second] = await Promise.allSettled([
    prisma.$queryRaw`SELECT 1`,
    new Promise((resolve) => setTimeout(resolve, 150)).then(() => {
      return prisma.$queryRaw`SELECT 2`;
    }),
  ]);
  if (first?.status !== "rejected" || second?.status !== "rejected") {
    throw new Error("2 本とも失敗しなかった（プールが枯渇していない）");
  }
  const messageOf = (reason: unknown): string =>
    reason instanceof Error ? reason.message : String(reason);
  return {
    acquire: messageOf(second.reason),
    connect: messageOf(first.reason),
  };
}

beforeAll(async () => {
  server = createServer(() => {
    // 接続は受けるが何も返さない。handshake が終わらないので接続は解放されない。
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  port = typeof address === "object" && address !== null ? address.port : 0;

  const observed = await observePoolTimeoutMessages();
  acquireMessage = observed.acquire;
  connectMessage = observed.connect;
});

afterAll(() => {
  server.close();
});

describe("プール枯渇の signal は log metric の filter に一致する", () => {
  test("filter から一致対象の文字列が読めている（gate が空振りしていない）", () => {
    const strings = readFilterMatchStrings(readFileSync(METRIC_PATH, "utf8"));
    expect(strings).toContain("cloud_run_revision");
    expect(strings.length).toBeGreaterThan(3);
  });

  test("acquire timeout の実メッセージが filter のどれかに当たる", () => {
    const strings = readFilterMatchStrings(readFileSync(METRIC_PATH, "utf8"));
    const hint =
      "pg / Prisma の更新で文言が変わったら、log metric の filter を実測値へ直す（テスト側に書き写さない）";

    expect({
      message: acquireMessage,
      matched: strings.some((candidate) => acquireMessage.includes(candidate)),
      hint,
    }).toEqual({ message: acquireMessage, matched: true, hint });
  });

  test("Rust query engine 由来のプールエラーは出ない（driver adapter 構成）", () => {
    // この 3 つを filter に戻すと、また何にも当たらない分岐が生える。
    expect(acquireMessage).not.toContain(
      "Timed out fetching a new connection from the connection pool",
    );
    expect(acquireMessage).not.toContain("P2024");
    expect(acquireMessage).not.toContain("P2028");
  });
});

describe("接続確立の失敗を prisma_pool_timeout に混ぜない", () => {
  test("2 本のプローブが別々の経路で落ちている（見分けが成立している）", () => {
    // 同じ文言なら、以下の 2 本は「混ざっていない」ことを何も証明しない。
    expect(acquireMessage).not.toBe(connectMessage);
  });

  test("接続確立失敗の実メッセージは filter に当たらない", () => {
    const strings = readFilterMatchStrings(readFileSync(METRIC_PATH, "utf8"));
    const hint =
      "接続確立の失敗はプールの大きさと無関係。cron 経路は cron_job_failure、定期の到達性は db_health_probe_failure が見る";

    expect({
      message: connectMessage,
      matched: strings.some((candidate) => connectMessage.includes(candidate)),
      hint,
    }).toEqual({ message: connectMessage, matched: false, hint });
  });

  test("アイドル接続のプールエラーを filter が拾っていない", () => {
    const operation = readPoolErrorOperation(readFileSync(PRISMA_PATH, "utf8"));
    const filter = readFilterBlock(readFileSync(METRIC_PATH, "utf8"));
    const hint =
      "クエリが乗っていない接続が切れた記録であって、acquire の失敗ではない";

    expect({
      operation,
      selectedByFilter: filter.includes(operation),
      hint,
    }).toEqual({ operation, selectedByFilter: false, hint });
  });
});
