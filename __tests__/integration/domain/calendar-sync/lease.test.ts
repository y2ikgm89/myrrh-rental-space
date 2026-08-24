/**
 * calendar-sync の row lease の実 DB 回帰テスト（監査 A-66）。
 *
 * 旧実装は `pg_try_advisory_lock` の **session（接続）レベル**ロックだった。
 * Prisma は 1 クエリごとに pg.Pool から接続を借りるので、acquire と release が
 * 別接続に載ると release が黙って no-op になり、取得側接続が idle 回収されるまで
 * ロックが残る。**正常終了でも起こる**。
 *
 * row lease はその欠陥を構造的に消すが、代わりに 3 つの性質が要る。
 * ここはその 3 つを実 DB で固定する。
 *
 * 1. 有効なリースがある間は取れない（`UPDATE ... WHERE` の原子性）
 * 2. TTL 切れなら奪える（プロセス死からの自己回復）
 * 3. release は**自分のリースだけ**を消す（TTL 自己回復後に古い `finally` が
 *    走っても、新しい保持者のリースを消さない）
 *
 * 3 が無いと、リース方式は session lock より悪くなる — 期限切れで奪われたあとの
 * 古い処理が新しい保持者を追い出し、二重実行が定常化する。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行。`bun run test:integration` が
 * docker-compose の test-db 既定値を注入する。
 */

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type LocksModule = typeof import("@/shared/domain/calendar-sync/locks");

let prisma: PrismaModule["prisma"];
let tryAcquireCalendarSyncLease: LocksModule["tryAcquireCalendarSyncLease"];
let releaseCalendarSyncLease: LocksModule["releaseCalendarSyncLease"];

async function readLeasedUntil(): Promise<Date | null> {
  const row = await prisma.settingsGoogleCalendar.findUnique({
    where: { id: "singleton" },
    select: { googleCalendarSyncLeasedUntil: true },
  });
  return row?.googleCalendarSyncLeasedUntil ?? null;
}

describeMaybe("calendar-sync の row lease", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ tryAcquireCalendarSyncLease, releaseCalendarSyncLease } =
      await import("@/shared/domain/calendar-sync/locks"));
    // singleton 行が無い環境（空 DB）でも走るようにする。
    await prisma.settingsGoogleCalendar.upsert({
      where: { id: "singleton" },
      create: { id: "singleton" },
      update: {},
    });
  });

  afterEach(async () => {
    await prisma.settingsGoogleCalendar.update({
      where: { id: "singleton" },
      data: { googleCalendarSyncLeasedUntil: null },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("空いていれば取れて、列に leasedUntil が入る", async () => {
    const leasedUntil = await tryAcquireCalendarSyncLease();

    expect(leasedUntil).not.toBeNull();
    expect(await readLeasedUntil()).toEqual(leasedUntil);
  });

  test("有効なリースがある間は取れない", async () => {
    const first = await tryAcquireCalendarSyncLease();
    expect(first).not.toBeNull();

    expect(await tryAcquireCalendarSyncLease()).toBeNull();
    // 2 回目が列を書き換えていないこと（後勝ちで奪えてしまわない）。
    expect(await readLeasedUntil()).toEqual(first);
  });

  test("release すれば次が取れる", async () => {
    const first = await tryAcquireCalendarSyncLease();
    expect(first).not.toBeNull();
    if (first === null) return;

    await releaseCalendarSyncLease(first);
    expect(await readLeasedUntil()).toBeNull();

    expect(await tryAcquireCalendarSyncLease()).not.toBeNull();
  });

  test("TTL 切れなら奪える（プロセス死からの自己回復）", async () => {
    // TTL より十分に古い時刻で取ると、その leasedUntil は既に過去。
    const staleBase = new Date(Date.now() - 60 * 60 * 1000);
    const stale = await tryAcquireCalendarSyncLease(staleBase);
    expect(stale).not.toBeNull();
    if (stale === null) return;
    expect(stale.getTime()).toBeLessThan(Date.now());

    const fresh = await tryAcquireCalendarSyncLease();
    expect(fresh).not.toBeNull();
    expect(await readLeasedUntil()).toEqual(fresh);
  });

  test("古い finally は新しい保持者のリースを消さない", async () => {
    const staleBase = new Date(Date.now() - 60 * 60 * 1000);
    const stale = await tryAcquireCalendarSyncLease(staleBase);
    expect(stale).not.toBeNull();
    if (stale === null) return;

    // TTL 切れで別プロセスが取り直す。
    const fresh = await tryAcquireCalendarSyncLease();
    expect(fresh).not.toBeNull();

    // ここで古い処理の finally がようやく走る。
    await releaseCalendarSyncLease(stale);

    // 新しい保持者のリースが生き残っていること。
    expect(await readLeasedUntil()).toEqual(fresh);
    expect(await tryAcquireCalendarSyncLease()).toBeNull();
  });
});
