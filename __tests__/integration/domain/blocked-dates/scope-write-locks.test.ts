/**
 * 休業日の 3 スコープすべてが**実際に書けること**を実 DB で確かめる統合テスト。
 *
 * ## なぜ要るのか
 *
 * `acquireBlockedDateWriteLocks`（`src/shared/domain/blocked-dates/locks.ts`）は
 * GLOBAL / LOCATION スコープで「影響する Space を列挙して id 昇順に advisory lock を
 * 取る」。この列挙が `space.findMany({ where: { deletedAt: null } })` になっていた。
 * **`Space` に `deletedAt` は無い**（soft delete を持たず `isActive` / `isPublished`
 * しか無い）。結果、GLOBAL / LOCATION スコープの休業日は作成も更新も削除も
 * `PrismaClientValidationError` で落ち、管理画面から全社休業日も拠点休業日も
 * 設定できなかった。顧客側では「休業日として塞げなかった日に予約が入り続け、
 * 当日スペースが閉まっている」になる。
 *
 * 型検査も lint も緑だったのは、tx の最小構造型が `findMany(args: object)` と
 * 宣言しており Prisma の Input 型検査を丸ごと無効化していたため。その構造は
 * `__tests__/unit/architecture/prisma-delegate-arg-types.test.ts` が 0 件強制する。
 *
 * ここが見るのはその先で、**列名が実在すること**は実際に PostgreSQL へ流さないと
 * 分からない（静的ゲートは「Prisma の型を使っているか」までしか見られない）。
 * SPACE スコープも一緒に通す — GLOBAL / LOCATION だけ直して SPACE を壊す変更を
 * 検出するため。
 *
 * == 実行条件 ==
 * `bun run test:integration` は docker-compose の test-db 既定値を注入する。直接
 * `bun test` でこのファイルを実行し `TEST_DATABASE_URL` が未設定の場合のみ
 * describe ごと skip する（dev DB 誤汚染防止）。gateway は import 時の
 * `process.env.DATABASE_URL` を読むため動的 import より前に上書きする。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type CommandsModule = typeof import("@/shared/domain/blocked-dates/commands");

let prisma: PrismaModule["prisma"];
let commands: CommandsModule;

/** このファイルが作った行だけを消すための目印。 */
const MARKER = `scope-write-locks-${crypto.randomUUID()}`;

let locationId = "";
let spaceId = "";
let actorId = "";

describeMaybe("休業日の 3 スコープが実 DB へ書ける", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    commands = await import("@/shared/domain/blocked-dates/commands");

    const suffix = crypto.randomUUID();
    const location = await prisma.location.create({
      data: {
        slug: `blocked-scope-loc-${suffix}`,
        name: `Blocked Scope Loc ${suffix}`,
        address: "東京都テスト区1-2-3",
        imageUrl: "https://example.com/location.jpg",
        // isActive の partial unique(sortOrder) と衝突しないよう非アクティブにする。
        isActive: false,
      },
      select: { id: true },
    });
    locationId = location.id;

    const space = await prisma.space.create({
      data: {
        slug: `blocked-scope-space-${suffix}`,
        name: `Blocked Scope Space ${suffix}`,
        descriptionJson: { type: "doc" },
        descriptionHtml: "<p>test</p>",
        descriptionPlainText: "test",
        capacity: 4,
        hourlyPrice: 1000,
        mainImageUrl: "https://example.com/space.jpg",
        locationId,
        isPublished: false,
        isActive: false,
      },
      select: { id: true },
    });
    spaceId = space.id;

    const actor = await prisma.user.create({
      data: {
        email: `blocked-scope-${suffix}@example.com`,
        name: `Blocked Scope Actor ${suffix}`,
      },
      select: { id: true },
    });
    actorId = actor.id;
  });

  afterAll(async () => {
    await prisma.blockedDate.deleteMany({ where: { reason: MARKER } });
    await prisma.space.deleteMany({ where: { id: spaceId } });
    await prisma.location.deleteMany({ where: { id: locationId } });
    await prisma.user.deleteMany({ where: { id: actorId } });
    await prisma.$disconnect();
  });

  test("GLOBAL スコープの休業日を作成・更新・削除できる", async () => {
    const created = await commands.createBlockedDateCommand(
      {
        scope: "GLOBAL",
        spaceId: null,
        locationId: null,
        startDate: "2099-01-10",
        endDate: "2099-01-10",
        reason: MARKER,
        type: "HOLIDAY",
      },
      { id: actorId },
    );
    expect(created.id).toBeTruthy();

    await commands.updateBlockedDateCommand(created.id, {
      scope: "GLOBAL",
      spaceId: null,
      locationId: null,
      startDate: "2099-01-10",
      endDate: "2099-01-11",
      reason: MARKER,
      type: "HOLIDAY",
    });

    const updated = await prisma.blockedDate.findUniqueOrThrow({
      where: { id: created.id },
      select: { endDate: true },
    });
    expect(updated.endDate).not.toBeNull();

    await commands.deleteBlockedDateCommand(created.id);
    expect(
      await prisma.blockedDate.findUnique({
        where: { id: created.id },
        select: { id: true },
      }),
    ).toBeNull();
  });

  test("LOCATION スコープの休業日を作成・削除できる", async () => {
    const created = await commands.createBlockedDateCommand(
      {
        scope: "LOCATION",
        spaceId: null,
        locationId,
        startDate: "2099-02-10",
        endDate: "2099-02-10",
        reason: MARKER,
        type: "HOLIDAY",
      },
      { id: actorId },
    );
    expect(created.id).toBeTruthy();

    await commands.deleteBlockedDateCommand(created.id);
  });

  test("SPACE スコープの休業日を作成・削除できる", async () => {
    const created = await commands.createBlockedDateCommand(
      {
        scope: "SPACE",
        spaceId,
        locationId: null,
        startDate: "2099-03-10",
        endDate: "2099-03-10",
        reason: MARKER,
        type: "HOLIDAY",
      },
      { id: actorId },
    );
    expect(created.id).toBeTruthy();

    await commands.deleteBlockedDateCommand(created.id);
  });
});
