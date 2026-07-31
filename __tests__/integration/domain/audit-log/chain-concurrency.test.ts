/**
 * 監査ログ hash chain の並行書込直列化（実 Postgres 必須）。
 *
 * `createAuditLogRecord` は 1 トランザクション内で
 * 「`pg_advisory_xact_lock(AUDIT_LOG_CHAIN_LOCK_KEY)` → 直前行の `max(sequence)` を
 * 読む → `sequence + 1` で INSERT」という read-before-write を行う。`sequence` は
 * `@unique`（DB 側 `audit_logs_sequence_key`）なので、直列化が壊れると 2 つの writer が
 * 同じ採番を計算して一意制約違反になる。
 *
 * ## なぜ実 DB でしか検証できないか
 *
 * `__tests__/unit/domain/audit-log/commands.test.ts` は `$transaction` ごと mock
 * しているため、「advisory lock の SQL が渡された」ことしか見ていない。
 * **スナップショットとロック取得の順序**は実 Postgres でしか再現できない。
 *
 * ## 検証する不変条件
 *
 * 監査ログは業務操作の証跡であり、書込失敗は
 * `src/shared/domain/admin-auth/audit.ts` の `writeAdminAuthAudit` が catch して
 * `logError` するだけ（業務操作自体は成功する）。つまり **欠落は無言**で起きる。
 * よって「N 並行で呼んだら N 件が連番で残る」ことを直接検査する。
 *
 * ## 後始末をしない理由
 *
 * `audit_logs` は append-only で、UPDATE / DELETE は DB trigger
 * `prevent_audit_logs_mutation` が拒否する（bypass は seed 専用）。テストが
 * `set_config` で bypass を張るのは規約の抜け道を作ることになるため、行は残す。
 * 判定は毎回ユニークな `resource` で自分の行だけに絞る。
 *
 * == 実行条件 ==
 * `bun run test:integration` は docker-compose の test-db 既定値を注入する。
 * `TEST_DATABASE_URL` 未設定時は describe ごと silent skip。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { AuditAction } from "@generated/prisma/enums";

// グローバル preload (__tests__/setup.ts) は DATABASE_URL をダミー値に固定する。
// gateway を動的 import する前に実テスト DB へ向け直す。
const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type AuditLogCommandsModule =
  typeof import("@/shared/domain/audit-log/commands");

let prisma: PrismaModule["prisma"];
let createAuditLogRecord: AuditLogCommandsModule["createAuditLogRecord"];

/**
 * 同時 writer 数。
 *
 * `MAX_AUDIT_LOG_CHAIN_RETRIES`（=3）より大きくする。リトライで吸収できる範囲だと
 * 「直列化が壊れていてもリトライで隠れる」状態を通してしまう。実際に管理画面の
 * 一括操作（series bulk-cancel 等）は 1 リクエストで数件の監査ログを並行に書く。
 */
const CONCURRENCY = 6;

/** 失敗理由を Prisma のエラーコード付きで読める文字列にする */
function describeFailure(reason: unknown): string {
  if (typeof reason === "object" && reason !== null) {
    const record: Record<string, unknown> = { ...reason };
    const code = record["code"];
    const message = reason instanceof Error ? reason.message : String(reason);
    return `${typeof code === "string" ? code : "NO_CODE"}: ${message.split("\n")[0] ?? ""}`;
  }
  return String(reason);
}

describeMaybe("監査ログ hash chain の並行書込", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ createAuditLogRecord } =
      await import("@/shared/domain/audit-log/commands"));

    // コールドスタートは接続確立の待ち時間で並行クエリをずらし、競合を偶発的に
    // 直列化して隠す。プールを暖めてから本番の並行バーストを撃つ。
    await prisma.$queryRaw`SELECT 1`;
    await Promise.all(
      Array.from({ length: CONCURRENCY }, () => prisma.$queryRaw`SELECT 1`),
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test(`${String(CONCURRENCY)} 並行の監査ログ書込が 1 件も欠落せず連番で残る`, async () => {
    const resource = `audit-chain-concurrency-${crypto.randomUUID()}`;

    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENCY }, (_, index) =>
        createAuditLogRecord({
          action: AuditAction.CREATE,
          resource,
          resourceId: `entry-${String(index)}`,
        }),
      ),
    );

    const failures = results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map((r) => describeFailure(r.reason));

    // 監査ログの欠落は業務操作を止めずに起きる（呼出側が catch + logError する）。
    // ここで落ちるなら本番では「証跡だけが消える」ことを意味する。
    expect(failures).toEqual([]);

    const rows = await prisma.auditLog.findMany({
      where: { resource },
      orderBy: { sequence: "asc" },
      select: {
        sequence: true,
        previousHash: true,
        entryHash: true,
        resourceId: true,
      },
    });

    expect(rows.length).toBe(CONCURRENCY);

    // 採番は欠番なしの連番。飛びがあれば直列化が壊れている。
    const firstSequence = rows[0]?.sequence;
    expect(firstSequence).toBeDefined();
    if (firstSequence === undefined) return;

    expect(rows.map((row) => row.sequence)).toEqual(
      Array.from(
        { length: CONCURRENCY },
        (_, index) => firstSequence + BigInt(index),
      ),
    );

    // 全 writer の入力が残っている（1 件だけ勝って他が消えていない）。
    expect(new Set(rows.map((row) => row.resourceId)).size).toBe(CONCURRENCY);

    // hash chain が実際に連結している（previousHash = 直前行の entryHash）。
    const brokenLinks = rows
      .slice(1)
      .map((row, index) => ({ row, previous: rows[index] }))
      .filter(({ row, previous }) => row.previousHash !== previous?.entryHash)
      .map(
        ({ row }) =>
          `sequence=${row.sequence.toString()} の previousHash が直前行の entryHash と一致しない`,
      );

    expect(brokenLinks).toEqual([]);
  }, 30_000);
});
