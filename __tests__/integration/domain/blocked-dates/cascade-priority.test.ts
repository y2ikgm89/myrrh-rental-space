/**
 * 臨時休業の 3 階層 cascade で **GLOBAL → LOCATION → SPACE の順に理由が採られる**ことを
 * 実 DB に対して確かめる。
 *
 * ## なぜ実 DB でなければならないのか
 *
 * この優先順位を決めているのは `availability.ts` の
 * `orderBy: { scope: "asc" }` **1 行だけ**で、実際に並べ替えるのは PostgreSQL。
 * つまり**アプリのコードを読んでも順序は分からない**。決めているのは
 *
 *   - `scope` が VARCHAR なら → **辞書順**（GLOBAL < LOCATION < SPACE）
 *   - `scope` が enum なら → **宣言順**
 *
 * のどちらかで、いずれも DB 側の性質。
 *
 * ## 何が守られていなかったか
 *
 * 既存の unit テスト（`blocked-availability.test.ts`）は `orderBy: { scope: "asc" }`
 * という**引数リテラル**を固定している。`"asc"` を `"desc"` に変えれば落ちる
 * （実測で確認した）。守られているのはそこまで。
 *
 * **誰も「DB がどう並べるか」を検査していない。** `"asc"` が
 * GLOBAL → LOCATION → SPACE を意味するのは
 *
 *   - VARCHAR なら**辞書順**でたまたまその並びになるから
 *   - enum なら**宣言順**がその並びだから
 *
 * であって、どちらも DB 側の性質。したがって次のどちらをやっても
 * **リテラルは `"asc"` のまま、テストは緑のまま、cascade だけが逆転する**:
 *
 *   - enum を SPACE, LOCATION, GLOBAL の順で宣言する
 *   - `GLOBAL` を辞書順で LOCATION より後ろに来る名前へ変える
 *
 * テスト名が約束していた「scope 優先」は、この 2 つを覆って初めて成立する。
 *
 * 逆転すると顧客に何が起きるか: 全社休業日（GLOBAL）を設定しても、その日に
 * スペース単位の休業（SPACE）が別の理由で入っていると**そちらの理由が表示される**。
 * さらに悪いのは、優先順位の前提で書かれた将来の変更（「GLOBAL があれば早期 return」等）
 * が静かに壊れること。KGI は「空き枠が正しく見え、二重予約が起きない」。
 *
 * このテストは実際に 3 階層の行を入れて、返る理由で順序を確かめる。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行（runner 経由なら自動注入）。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type TransactionClient = Parameters<
  Parameters<PrismaModule["prisma"]["$transaction"]>[0]
>[0];

let prisma: PrismaModule["prisma"];
let isDateBlocked: (typeof import("@/shared/domain/reservations/availability"))["isDateBlocked"];

/** tx を必ず巻き戻すための番兵。 */
const ROLLBACK = "__blocked_date_cascade_rollback__";

/** JST カレンダー日付を UTC 深夜で保持する規約に合わせた固定日。 */
const TARGET_DATE = "2099-03-15";

type Fixture = {
  readonly spaceId: string;
  readonly locationId: string;
  readonly userId: string;
};

/**
 * 休業日を入れるのに必要な行を tx 内で揃える。
 * **seed に依存しない** — CI の test DB は migrate 済みだが seed されていない。
 */
async function createFixture(tx: TransactionClient): Promise<Fixture> {
  const suffix = crypto.randomUUID();
  const user = await tx.user.create({
    data: {
      name: `Cascade Probe ${suffix}`,
      email: `cascade-${suffix}@example.test`,
      emailVerified: false,
      role: "ADMIN",
    },
    select: { id: true },
  });
  const location = await tx.location.create({
    data: {
      slug: `cascade-loc-${suffix}`,
      name: `Cascade Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.test/loc.jpg",
      sortOrder: 0,
      // `locations_active_sort_order_key` は isActive: true の行だけの partial unique。
      isActive: false,
    },
    select: { id: true },
  });
  const space = await tx.space.create({
    data: {
      slug: `cascade-space-${suffix}`,
      name: `Cascade Space ${suffix}`,
      descriptionJson: {},
      descriptionHtml: "<p>test</p>",
      descriptionPlainText: "test",
      capacity: 10,
      hourlyPrice: 1000,
      mainImageUrl: "https://example.test/space.jpg",
      locationId: location.id,
    },
    select: { id: true },
  });
  return { spaceId: space.id, locationId: location.id, userId: user.id };
}

type Scope = "GLOBAL" | "LOCATION" | "SPACE";

async function insertBlockedDate(
  tx: TransactionClient,
  fixture: Fixture,
  scope: Scope,
  reason: string,
): Promise<void> {
  const target = new Date(`${TARGET_DATE}T00:00:00.000Z`);
  await tx.blockedDate.create({
    data: {
      scope,
      // `blocked_dates_scope_target_check` が scope ごとの必須/禁止を強制する。
      spaceId: scope === "SPACE" ? fixture.spaceId : null,
      locationId: scope === "LOCATION" ? fixture.locationId : null,
      startDate: target,
      endDate: target,
      reason,
      type: "OTHER",
      createdBy: fixture.userId,
    },
  });
}

/** 指定した scope の休業日をすべて入れたうえで、採られた理由を返す。 */
async function reasonWhenBlockedBy(
  scopes: readonly Scope[],
): Promise<string | null | undefined> {
  const observed: { reason: string | null | undefined } = { reason: undefined };
  try {
    await prisma.$transaction(async (tx) => {
      const fixture = await createFixture(tx);
      // **入れる順序を優先順位と逆にする。** 挿入順で決まっていたら気づけない。
      for (const scope of [...scopes].reverse()) {
        await insertBlockedDate(tx, fixture, scope, `reason:${scope}`);
      }
      const result = await isDateBlocked(
        fixture.spaceId,
        fixture.locationId,
        TARGET_DATE,
        tx,
      );
      // `DateBlockedResult` は判別可能 union。narrowing してから reason を読む
      // （blocked: false 側に reason は無い）。
      expect(result.blocked).toBe(true);
      if (result.blocked) observed.reason = result.reason;
      throw new Error(ROLLBACK);
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== ROLLBACK) throw error;
  }
  return observed.reason;
}

describeMaybe("臨時休業 cascade の優先順位（実 DB）", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ isDateBlocked } =
      await import("@/shared/domain/reservations/availability"));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("GLOBAL と SPACE が重なったら GLOBAL の理由が採られる", async () => {
    expect(await reasonWhenBlockedBy(["GLOBAL", "SPACE"])).toBe(
      "reason:GLOBAL",
    );
  }, 30_000);

  test("GLOBAL と LOCATION が重なったら GLOBAL の理由が採られる", async () => {
    expect(await reasonWhenBlockedBy(["GLOBAL", "LOCATION"])).toBe(
      "reason:GLOBAL",
    );
  }, 30_000);

  test("LOCATION と SPACE が重なったら LOCATION の理由が採られる", async () => {
    expect(await reasonWhenBlockedBy(["LOCATION", "SPACE"])).toBe(
      "reason:LOCATION",
    );
  }, 30_000);

  test("3 階層すべてが重なったら GLOBAL の理由が採られる", async () => {
    expect(await reasonWhenBlockedBy(["GLOBAL", "LOCATION", "SPACE"])).toBe(
      "reason:GLOBAL",
    );
  }, 30_000);

  test("単独の SPACE 休業は SPACE の理由が採られる（cascade が全部 GLOBAL を返していない）", async () => {
    // 上の 4 件だけだと「常に GLOBAL を返す実装」でも緑になる。
    expect(await reasonWhenBlockedBy(["SPACE"])).toBe("reason:SPACE");
  }, 30_000);
});
