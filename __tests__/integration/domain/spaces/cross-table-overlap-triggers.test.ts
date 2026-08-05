/**
 * Reservation ⇔ Event の cross-table overlap 防衛線として DB 層に存在する
 * 3 つの `CONSTRAINT TRIGGER` が、実際に本番相当の PostgreSQL に存在することを
 * 生きた `pg_trigger` システムカタログへのライブクエリで検証する統合テスト。
 *
 * == 対象の 3 トリガー（アプリ層 checkSpaceOverlap の DB-level 最終防衛線） ==
 *
 * 1. `reservations_no_event_slot_overlap_check`（reservations テーブル）
 *    Reservation の INSERT/UPDATE 時に EventTimeSlot との重複を検査。
 * 2. `event_time_slots_no_reservation_overlap_check`（event_time_slots テーブル）
 *    EventTimeSlot の INSERT/UPDATE 時に Reservation との重複を検査。
 * 3. `events_no_reservation_overlap_check`（events テーブル）
 *    Event 親行の spaceId/status/deletedAt 変更時に、紐づく子 slot 全件を
 *    Reservation と再検査。
 *
 * 3 本とも現行定義の SSoT は `prisma/baseline/invariants.sql`
 * （`readDatabaseInvariants()` で読む）。
 *
 * これらは Prisma DSL では表現できない手書き SQL 不変条件のため、
 * `prisma db pull` や migration の DROP+CREATE 再定義で静かに欠落しても
 * 型チェック・ESLint・migration ファイルの文字列一致テストだけでは検知できない
 * （`__tests__/unit/architecture/event-schedule-db-invariants.test.ts` は
 * baseline migration 内の別の 2 トリガーのみを文字列一致で確認しており、この
 * 3 つの cross-table トリガーはカバーしていない）。本テストは migration
 * ファイルではなく実際に適用された DB の `pg_trigger` を直接クエリすることで、
 * 「migration ファイルには書いてあるが実際には効いていない」regression
 * （DROP 後の再 CREATE 漏れ・環境差異等）を検知する。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行。`bun run test:integration` が
 * docker-compose の test-db 既定値を注入する。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");

let prisma: PrismaModule["prisma"];

type TriggerRow = {
  tgname: string;
  table_name: string;
  tgisinternal: boolean;
  tgdeferrable: boolean;
  tginitdeferred: boolean;
};

/** tgname 昇順（クエリの ORDER BY と一致させる）。 */
const EXPECTED_TRIGGER_TABLES: readonly {
  tgname: string;
  table_name: string;
}[] = [
  {
    tgname: "event_time_slots_no_reservation_overlap_check",
    table_name: "event_time_slots",
  },
  { tgname: "events_no_reservation_overlap_check", table_name: "events" },
  {
    tgname: "reservations_no_event_slot_overlap_check",
    table_name: "reservations",
  },
];

async function queryCrossTableOverlapTriggers(): Promise<TriggerRow[]> {
  return prisma.$queryRaw<TriggerRow[]>`
    SELECT
      tgname::text AS tgname,
      tgrelid::regclass::text AS table_name,
      tgisinternal,
      tgdeferrable,
      tginitdeferred
    FROM pg_trigger
    WHERE tgname IN (
      'reservations_no_event_slot_overlap_check',
      'event_time_slots_no_reservation_overlap_check',
      'events_no_reservation_overlap_check'
    )
    AND NOT tgisinternal
    ORDER BY tgname
  `;
}

describeMaybe(
  "Reservation ⇔ Event cross-table overlap CONSTRAINT TRIGGER の DB 不変条件",
  () => {
    beforeAll(async () => {
      ({ prisma } = await import("@/shared/db/prisma"));
      await prisma.$queryRaw`SELECT 1`;
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    test("3 件の cross-table overlap CONSTRAINT TRIGGER が pg_trigger に存在し、期待するテーブルに付与されている", async () => {
      const rows = await queryCrossTableOverlapTriggers();

      expect(
        rows.map((row) => ({ tgname: row.tgname, table_name: row.table_name })),
      ).toEqual([...EXPECTED_TRIGGER_TABLES]);
    });

    test("3 件とも DEFERRABLE INITIALLY DEFERRED である（tx 内の advisory lock 取得後・commit 直前検査という契約）", async () => {
      const rows = await queryCrossTableOverlapTriggers();

      expect(rows.length).toBe(3);
      for (const row of rows) {
        expect(row.tgdeferrable).toBe(true);
        expect(row.tginitdeferred).toBe(true);
      }
    });
  },
);
