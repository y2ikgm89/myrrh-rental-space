/**
 * `ReservationSeries` + N 件の instance を用意する E2E fixture の共通実装。
 *
 * ## 冪等にする（使い捨てスペースを作らない）
 *
 * series を消費する spec（3 択キャンセル / bulk-cancel 返金）は fixture を
 * **破壊的に消費する**ので、共有 seed 行では retry も再実行もできない。以前は
 * 「実行のたびに Location / Space / Customer ごと新規作成する」形で回避していたが、
 * 後始末が無いため行が際限なく溜まっていた（実測: ローカル test DB に
 * `e2e-recurring-space-*` が数百行）。
 *
 * 代わりに **seed が用意した専有スペース**（`spaceFixtures.recurringSeriesSpaceSlug` /
 * `seriesRefundSpaceSlug`、`prisma/seed.ts` の `E2E_FIXTURE_SPACES`）の中身だけを
 * 毎回 purge → 再作成する。行数は有界になり、専有なので
 * EXCLUDE 制約 `reservations_no_active_time_overlap_excl` とも無縁になる。
 * **1 fixture 1 スペース**を守ること — 相乗りさせると purge が相手の fixture ごと
 * 消す（両 spec は同じ `chromium-admin` project で並走しうる）。
 *
 * ## jsonb 列の形状は DB が強制する
 *
 * `reservation_series.agreement_snapshot` には
 * `jsonb_typeof(agreement_snapshot) = 'array'` の CHECK がある
 * （`reservation_series_agreement_snapshot_array_check`）。ここに
 * `{ agreements: [] }` のようなオブジェクトを入れると **insert ごと拒否される**。
 * 実測: WP18-23 でこの CHECK が入った後、fixture が追随せず nightly が
 * 7 連続で赤になった（2026-08-01〜08-07）。同じ drift を PR 時点で捕まえるため、
 * `buildReservationSeriesFixtureData` の出力を実 DB に流す統合テスト
 * （`__tests__/integration/e2e/reservation-series-fixture-shape.test.ts`）を置いてある。
 *
 * @module e2e/helpers/reservation-series-fixture
 */

import { getE2EPrismaClient } from "./e2e-prisma";

/**
 * この fixture が専有する**ゲスト顧客**（`userId` なし）。
 *
 * **dev customer（`dev-customer@example.com`）に付けてはいけない。** マイページの
 * 予約一覧は `getCustomerReservations` が `startTime desc` で返し、
 * `reservation-test-helpers.ts` はステータス正規表現の**先頭一致**を掴む
 * （`confirmedUnpaid` は calendar-download / reservation-flow / stripe-payment /
 * stripe-3ds の 5 spec が使う）。この fixture の instance は CONFIRMED / UNPAID で
 * **2027〜2028 年**なので、dev customer に付けると必ず一覧の先頭に来て、
 * 顧客側 spec が「ミーティングルーム A」の代わりに E2E 専有スペースの予約を開く。
 * `chromium-admin` と `chromium-customer` は依存関係が無く 2 workers で**並走する**
 * ので、その予約が admin 側のキャンセルで消える競合まで乗る。
 *
 * ゲスト（`userId: null`）にすればマイページには構造的に出ない。行は email で
 * 1 件に固定されるので増えない（Space と違い EXCLUDE 制約にも無関係）。
 * 削除した `create-recurring-series-fixture.ts` も実行ごとに専用 Customer を
 * 作っていた — 共有 customer へ寄せたのは #2057 での退行だった。
 */
const SERIES_FIXTURE_CUSTOMER_EMAIL = "e2e-series-fixture@example.com";

/** 支払い状態。返金経路を通す spec だけ PAID + Stripe payment intent を要求する。 */
export type SeriesFixturePayment =
  | { readonly kind: "UNPAID" }
  | {
      readonly kind: "PAID";
      /** instance ごとに index を付けて一意化する prefix。 */
      readonly paymentIntentPrefix: string;
      readonly paidAt: Date;
    };

export interface SeriesFixtureSpec {
  /** seed が用意した**専有**スペースの slug（`spaceFixtures` 経由で渡す）。 */
  readonly spaceSlug: string;
  readonly rrule: string;
  /** instance の開始時刻。先頭が `dtstart` になる。 */
  readonly startTimes: readonly Date[];
  readonly durationMinutes: number;
  readonly totalPrice: number;
  readonly taxRate: number;
  /** `Reservation.notes` の接頭辞（人が DB を見たときの由来表示）。 */
  readonly notePrefix: string;
  readonly payment: SeriesFixturePayment;
}

export interface ReservationSeriesFixture {
  readonly seriesId: string;
  /** `startTime` 昇順の instance id。 */
  readonly instanceIds: readonly string[];
}

/**
 * Prisma に渡す `create` payload を組み立てる（**純粋関数**）。
 *
 * DB へ書く形をここ 1 か所に閉じ込め、統合テストが同じ関数の出力を実 DB に流して
 * CHECK 制約との整合を毎 PR 検証する。
 */
export function buildReservationSeriesFixtureData(
  spec: SeriesFixtureSpec & { spaceId: string; customerId: string },
) {
  const taxAmount = Math.round((spec.totalPrice * spec.taxRate) / 100);

  // rate plan resolver を経由しない直接 insert 用の空 breakdown スナップショット。
  // `reservations_rate_breakdown_object_check` があるのでオブジェクトであること。
  const rateBreakdownJson = {
    schemaVersion: 1,
    segments: [],
    totalHours: 0,
    totalBasePrice: 0,
    holidayFlags: {},
  };

  // `reservations_tax_amount_derivation_check` / `_tax_total_derivation_check` が
  // 端数計算まで検証するので、instance と series で同じ値を使う。
  const pricing = {
    basePrice: spec.totalPrice,
    totalPrice: spec.totalPrice,
    taxRateType: "STANDARD" as const,
    taxRate: spec.taxRate,
    taxAmount,
    totalPriceWithTax: spec.totalPrice + taxAmount,
    rateBreakdownJson,
  };

  const dtstart = spec.startTimes[0];
  if (!dtstart) {
    throw new Error("startTimes が空です（dtstart を決められません）");
  }

  return {
    series: {
      spaceId: spec.spaceId,
      customerId: spec.customerId,
      rrule: spec.rrule,
      dtstart,
      duration: spec.durationMinutes,
      instanceCount: spec.startTimes.length,
      // `reservation_series_template_data_object_check`（object）
      templateData: {
        ...pricing,
        durationDiscountAmount: 0,
        spaceDiscountAmount: 0,
      },
      // `reservation_series_agreement_snapshot_array_check`（**array**）。
      // 管理者代行作成（`skipCustomerTerms`）では本番も空配列を書く
      // （`createReservationSeriesCommand`）。
      agreementSnapshot: [],
    },
    instances: spec.startTimes.map((startTime, index) => ({
      spaceId: spec.spaceId,
      customerId: spec.customerId,
      recurrenceInstanceIndex: index,
      startTime,
      endTime: new Date(startTime.getTime() + spec.durationMinutes * 60 * 1000),
      status: "CONFIRMED" as const,
      notes: `${spec.notePrefix} ${String(index + 1)}/${String(spec.startTimes.length)}`,
      ...pricing,
      ...(spec.payment.kind === "PAID"
        ? {
            paymentStatus: "PAID" as const,
            stripePaymentIntentId: `${spec.payment.paymentIntentPrefix}${String(index)}`,
            paidAt: spec.payment.paidAt,
          }
        : { paymentStatus: "UNPAID" as const }),
    })),
  };
}

/** 専有スペースの id を引く（seed 済みであることが前提）。 */
async function resolveFixtureSpaceId(spaceSlug: string): Promise<string> {
  const client = getE2EPrismaClient();
  const space = await client.space.findFirst({
    where: { slug: spaceSlug, isActive: true },
    select: { id: true },
  });
  if (!space) {
    throw new Error(
      `専有スペース ${spaceSlug} が seed されていません。webServer の seed 実行と prisma/seed.ts の E2E_FIXTURE_SPACES を確認してください。`,
    );
  }
  return space.id;
}

/**
 * 専有ゲスト顧客の id を返す（無ければ作る）。
 *
 * `Customer.email` は unique ではない（seed は同じメールで会員行とゲスト行を作る）
 * ので `upsert` は使えない。email で 1 件に固定するので行は増えない。
 */
async function resolveFixtureCustomerId(): Promise<string> {
  const client = getE2EPrismaClient();
  const existing = await client.customer.findFirst({
    where: { email: SERIES_FIXTURE_CUSTOMER_EMAIL },
    select: { id: true, userId: true },
  });
  if (existing) {
    // **ゲストであること**が「マイページに出ない」の実体。会員に紐づけ直されたら
    // 顧客側 spec の一覧汚染が復活するので、静かに続けず落とす。
    if (existing.userId !== null) {
      throw new Error(
        `${SERIES_FIXTURE_CUSTOMER_EMAIL} が User に紐づいている。この fixture の予約はマイページ一覧に出てはいけない（顧客側 spec の先頭一致を奪う）。`,
      );
    }
    return existing.id;
  }

  const created = await client.customer.create({
    data: {
      email: SERIES_FIXTURE_CUSTOMER_EMAIL,
      emailCanonical: SERIES_FIXTURE_CUSTOMER_EMAIL,
      lastName: "定期予約E2E",
      firstName: "太郎",
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * 専有スペースにある fixture の残骸を消す。
 *
 * スペースが 1 fixture 専有なので「そのスペースの series を全部消す」で足りる
 * （marker を jsonb に埋める必要がない ＝ `agreement_snapshot` の array 制約とも
 * 衝突しない）。
 */
export async function purgeReservationSeriesFixture(
  spaceSlug: string,
): Promise<void> {
  const client = getE2EPrismaClient();
  const spaceId = await resolveFixtureSpaceId(spaceSlug);

  // series を先に消すと instance の FK が迷子になるため、instance → series の順。
  await client.reservation.deleteMany({ where: { spaceId } });
  await client.reservationSeries.deleteMany({ where: { spaceId } });
}

/**
 * 専有スペースを purge してから series + instance を作り直す。
 *
 * retry でも再実行でも同じ状態になる（初回失敗が永続失敗に化けない）。
 */
export async function createReservationSeriesFixture(
  spec: SeriesFixtureSpec,
): Promise<ReservationSeriesFixture> {
  const client = getE2EPrismaClient();

  await purgeReservationSeriesFixture(spec.spaceSlug);

  const spaceId = await resolveFixtureSpaceId(spec.spaceSlug);
  const customerId = await resolveFixtureCustomerId();

  const data = buildReservationSeriesFixtureData({
    ...spec,
    spaceId,
    customerId,
  });

  const series = await client.reservationSeries.create({
    data: data.series,
    select: { id: true },
  });
  await client.reservation.createMany({
    data: data.instances.map((instance) => ({
      ...instance,
      seriesId: series.id,
    })),
  });

  const instances = await client.reservation.findMany({
    where: { seriesId: series.id },
    orderBy: { startTime: "asc" },
    select: { id: true },
  });

  return {
    seriesId: series.id,
    instanceIds: instances.map((instance) => instance.id),
  };
}
