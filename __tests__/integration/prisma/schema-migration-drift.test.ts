/**
 * schema.prisma と migration 履歴の drift ゲート（実 DB 必須）。
 *
 * **このテストが守る不変条件**:
 *   「migration 履歴だけを適用した DB」と「schema.prisma」が構造的に一致すること。
 *
 * 一致していないと `prisma migrate dev` が次に生成する migration に、意図しない
 * DDL（典型は手書き索引の `DROP INDEX`）が混入する。実際に
 * `reservation_series_space_dtstart_active_unique`（soft-delete 済み系列が
 * (spaceId, dtstart) を恒久占有しないための partial UNIQUE）は raw SQL でだけ
 * 存在し schema.prisma に宣言が無かったため、生成のたびに DROP が提案され、
 * 20260730115734 / 20260731135410 の 2 本では作者が手作業でその行を削って
 * いた（両 migration 冒頭の NOTE コメントが証跡）。**1 度削り忘れれば本番の
 * 一意性不変条件が無言で消える。**
 *
 * drift は type-check でも lint でも build でも検出できない。Prisma 自身に
 * 差分を計算させるのが唯一の確実な検査であり、それには DB が要る。
 *
 * == 実行条件 ==
 *   ローカル: bun run test:integration（test-db を自動起動 + migrate deploy）
 *   CI: unit-tests job が postgres service + prisma migrate deploy 済みのため自動実行。
 */

import { describe, expect, test } from "bun:test";
import { resolveTestDatabaseUrl } from "../../../scripts/test-db-url";

/**
 * `prisma migrate diff --exit-code` の終了コード。
 * Prisma 公式: Empty=0 / Error=1 / Not empty=2。
 */
const DIFF_EMPTY = 0;
const DIFF_NOT_EMPTY = 2;

describe("prisma schema ↔ migration drift", () => {
  test("migrate deploy 済み DB と schema.prisma の差分が空", () => {
    const { url } = resolveTestDatabaseUrl(process.env["TEST_DATABASE_URL"]);

    const proc = Bun.spawnSync(
      [
        "bunx",
        "--bun",
        "prisma",
        "migrate",
        "diff",
        // prisma.config.ts の datasource（= 下の env で test DB を指す）を from に取る
        "--from-config-datasource",
        "--to-schema",
        "prisma/schema.prisma",
        "--script",
        "--exit-code",
      ],
      {
        env: {
          ...process.env,
          DATABASE_URL: url,
          // prisma.config.ts は DIRECT_URL を優先して読む
          DIRECT_URL: url,
        },
      },
    );

    const stdout = proc.stdout.toString();
    const stderr = proc.stderr.toString();

    // 失敗時に「何がずれているか」を SQL のまま出す。exit code だけを assert すると
    // 「drift がある」ことしか分からず、調査のために手元で再実行する羽目になる。
    const diagnosis =
      proc.exitCode === DIFF_NOT_EMPTY
        ? `schema.prisma と migration 履歴がずれています。` +
          `以下は Prisma が「履歴 → schema」を埋めるために生成した SQL です。` +
          `この DDL が意図したものなら新規 migration を追加し、意図しないもの` +
          `（手書き索引/制約の DROP 等）なら schema.prisma 側に宣言を足してください。\n\n${stdout}`
        : proc.exitCode === DIFF_EMPTY
          ? ""
          : `prisma migrate diff の実行に失敗しました（DB 未到達など）。\n${stderr}`;

    expect({ exitCode: proc.exitCode, diagnosis }).toEqual({
      exitCode: DIFF_EMPTY,
      diagnosis: "",
    });
    expect(stdout).toContain("This is an empty migration.");
  });
});
