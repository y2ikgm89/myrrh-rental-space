import "server-only";

import { prisma } from "@/shared/db/prisma";
import { CouponType } from "@/shared/lib/validations/enums/prisma-types";
import { DomainError } from "@/shared/domain/domain-error";
import { checkSpaceOverlap } from "@/shared/domain/spaces/overlap";
import { formatSpaceLineAddress } from "@/shared/domain/spaces/format-space-line-address";
import { getValidDiscountCombinationMode } from "@/shared/lib/validations/enums/helpers";
import { DEFAULT_TAX_SETTINGS } from "@/shared/lib/pricing/tax";
import type { ReservationPricingInput } from "@/shared/lib/pricing/calculate-reservation-pricing";
import type { Prisma } from "@generated/prisma/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ValidatedCoupon = {
  id: string;
  code: string;
  name: string;
  type: CouponType;
  discountValue: number;
  maxDiscountAmount: number | null;
  canCombineWithDurationDiscount: boolean;
} | null;

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** create / edit 共通の定員 gate 文言。numberOfGuests 未指定時は検査しない (create と同契約)。 */
export function guestCountCapacityError(
  numberOfGuests: number | undefined,
  capacity: number,
): string | null {
  if (numberOfGuests !== undefined && numberOfGuests > capacity) {
    return `利用人数がスペースの定員（${String(capacity)}名）を超えています`;
  }
  return null;
}

export type ReservationPayload = {
  reservationId: string;
  customerEmail: string;
  customerName: string;
  companyName?: string | null;
  guestName?: string;
  spaceName: string;
  startTime: Date;
  endTime: Date;
  totalPrice: number | null;
  /**
   * 税込合計 (Stripe charge / refund 上限 / 領収書 / **メール本文** の SSoT)。
   *
   * **省略可にしない**（監査 F-74）。optional だとメール側が税抜の `totalPrice` に
   * fallback でき、同じ予約の金額が経路ごとに食い違う。値が無いときは `null` を
   * 明示して「未設定」と出す。
   */
  totalPriceWithTax: number | null;
  notes?: string | undefined;
  location?: string | undefined;
  icsSequence: number;
  /** 会員予約なら User.id、ゲスト予約なら null/undefined。メール送信時のマイページ動線出し分けに使う。 */
  userId?: string | null;
};

// ---------------------------------------------------------------------------
// Selects
// ---------------------------------------------------------------------------

export const CUSTOMER_SELECT = {
  firstName: true,
  lastName: true,
  companyName: true,
  email: true,
} as const satisfies Prisma.CustomerSelect;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export async function getReservationSettings() {
  return prisma.settingsCommerce.findUnique({
    where: { id: "singleton" },
    select: {
      durationDiscountEnabled: true,
      durationDiscountRules: true,
      discountCombinationMode: true,
      taxStandardRate: true,
      taxReducedRate: true,
      taxDisplayModePublic: true,
      showOriginalPrice: true,
    },
  });
}

/**
 * Phase B.2 task 21: 繰返し予約 (ReservationSeries) 上限を form validation で
 * 早期 reject するための単発 read。`createReservationSeriesCommand` 側でも
 * validateRruleForSeries が上限を強制するため defense-in-depth。
 */
export async function getMaxRecurrenceInstances(): Promise<number> {
  const settings = await prisma.settingsReservation.findUniqueOrThrow({
    where: { id: "singleton" },
    select: { maxRecurrenceInstances: true },
  });
  return settings.maxRecurrenceInstances;
}

/**
 * Phase B.2 task 25: 顧客 mypage で「定期予約すべてキャンセル」ボタンを表示するか。
 * Task 26 で顧客マイページ (`page.tsx`) の gate 判定に使う。
 */
export async function getCustomerCanCancelSeriesInFull(): Promise<boolean> {
  const settings = await prisma.settingsReservation.findUniqueOrThrow({
    where: { id: "singleton" },
    select: { customerCanCancelSeriesInFull: true },
  });
  return settings.customerCanCancelSeriesInFull;
}

/**
 * `getReservationSettings()` の結果を `calculateReservationPricing` が要求する
 * `reservationSettings` shape に変換する。Settings singleton 行が存在しない防御的
 * ケース（`findUnique` が null を返す場合）は `tax.ts` の `DEFAULT_TAX_SETTINGS` /
 * 各フィールドの Prisma `@default` 相当の値にフォールバックする。
 *
 * 3 つの予約コマンド経路（public/admin/customer-commands.ts）すべてで同一の
 * マッピングが必要なため、ここに集約する（重複実装を防ぐ）。
 */
export function buildPricingSettings(
  settings: Awaited<ReturnType<typeof getReservationSettings>>,
): ReservationPricingInput["reservationSettings"] {
  return {
    taxStandardRate:
      settings?.taxStandardRate ?? DEFAULT_TAX_SETTINGS.standardRate,
    taxReducedRate:
      settings?.taxReducedRate ?? DEFAULT_TAX_SETTINGS.reducedRate,
    taxDisplayModePublic:
      settings?.taxDisplayModePublic ?? DEFAULT_TAX_SETTINGS.displayModePublic,
    durationDiscountEnabled: settings?.durationDiscountEnabled ?? false,
    durationDiscountRules: settings?.durationDiscountRules,
    discountCombinationMode: getValidDiscountCombinationMode(
      settings?.discountCombinationMode ?? undefined,
    ),
    showOriginalPrice: settings?.showOriginalPrice ?? true,
  };
}

export async function validateCoupon(
  code: string | null | undefined,
  basePrice: number,
  tx?: Tx,
): Promise<ValidatedCoupon> {
  if (!code || !code.trim()) {
    return null;
  }

  const normalizedCode = code.toUpperCase().trim();
  if (normalizedCode.length < 4 || !/^[A-Z0-9]+$/.test(normalizedCode)) {
    throw new DomainError("無効なクーポンコードです", "VALIDATION");
  }

  const coupon = await (tx ?? prisma).coupon.findUnique({
    where: { code: normalizedCode },
  });
  const now = new Date();

  if (!coupon || !coupon.isActive) {
    throw new DomainError("無効なクーポンコードです", "VALIDATION");
  }

  if (
    coupon.validFrom > now ||
    (coupon.validUntil && coupon.validUntil < now)
  ) {
    throw new DomainError("無効なクーポンコードです", "VALIDATION");
  }

  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    throw new DomainError("無効なクーポンコードです", "VALIDATION");
  }

  if (
    coupon.minReservationAmount !== null &&
    basePrice < coupon.minReservationAmount
  ) {
    throw new DomainError(
      `このクーポンは¥${coupon.minReservationAmount.toLocaleString()}以上のご利用で適用できます`,
      "VALIDATION",
    );
  }

  return {
    id: coupon.id,
    code: coupon.code,
    name: coupon.name,
    type: coupon.type,
    discountValue: coupon.discountValue,
    maxDiscountAmount: coupon.maxDiscountAmount,
    canCombineWithDurationDiscount: coupon.canCombineWithDurationDiscount,
  };
}

/**
 * **既にこの予約へ適用済み**のクーポンを、利用可否の再検証なしで解決する。
 *
 * `validateCoupon` が見る有効期限・利用上限・`isActive` は「これから新しく使えるか」の
 * 条件であって、「既に使った予約を編集してよいか」の条件ではない。編集のたびに
 * 再検証すると、**クーポンを配り切った瞬間・有効期限が来た瞬間に、そのクーポンを
 * 使った全予約が管理画面から編集不能になる**（監査 F-58）。しかもエラー文言は
 * 「無効なクーポンコードです」で、管理者が触ってすらいない項目を指す。
 *
 * 割引額そのものは呼び出し側が新しい料金に対して計算し直す。金額を据え置くと、
 * 日時変更で base が下がったときに割引が総額を超えうるため。
 *
 * @returns 該当行が無ければ null（クーポンが物理削除された等）
 */
export async function resolveAppliedCoupon(
  couponId: string,
  tx?: Tx,
): Promise<ValidatedCoupon> {
  const coupon = await (tx ?? prisma).coupon.findUnique({
    where: { id: couponId },
  });
  if (!coupon) return null;

  return {
    id: coupon.id,
    code: coupon.code,
    name: coupon.name,
    type: coupon.type,
    discountValue: coupon.discountValue,
    maxDiscountAmount: coupon.maxDiscountAmount,
    canCombineWithDurationDiscount: coupon.canCombineWithDurationDiscount,
  };
}

/**
 * Coupon.usageCount の atomic claim。
 *
 * pre-tx の `validateCoupon` 通過後でも、tx 内で isActive / usageLimit /
 * validFrom / validUntil / minReservationAmount を同一 UPDATE の WHERE で
 * 再強制する。claim count=0 は fail-closed（DomainError CONFLICT、予約は
 * rollback）。Prisma updateMany では column-to-column 比較不可のため
 * `$executeRaw` を使う。
 */
/** Interactive tx client または prisma gateway（$executeRaw のみ使用）。 */
type CouponClaimClient = Pick<Tx, "$executeRaw">;

export async function claimCouponUsage(
  tx: CouponClaimClient,
  args: {
    couponId: string;
    /** rate plan 適用後の basePrice（minReservationAmount 判定用） */
    basePrice: number;
    now?: Date;
    conflictMessage?: string;
  },
): Promise<void> {
  const now = args.now ?? new Date();
  const claimed = await tx.$executeRaw`
    UPDATE "coupons"
    SET usage_count = usage_count + 1
    WHERE "id" = ${args.couponId}::uuid
      AND is_active = true
      AND (usage_limit IS NULL OR usage_count < usage_limit)
      AND valid_from <= ${now}
      AND (valid_until IS NULL OR valid_until >= ${now})
      AND (
        min_reservation_amount IS NULL
        OR min_reservation_amount <= ${args.basePrice}
      )
  `;
  // driver によっては BigInt で返るため Number で正規化する。
  if (Number(claimed) === 0) {
    throw new DomainError(
      args.conflictMessage ??
        "クーポンが利用できません（利用上限に達したか、有効期限・最低利用額を満たさない可能性があります）",
      "CONFLICT",
    );
  }
}

/** Interactive tx client または prisma gateway（coupon.updateMany のみ使用）。 */
type CouponReleaseClient = {
  readonly coupon: Pick<Tx["coupon"], "updateMany">;
};

/**
 * 予約キャンセル / 期限切れ / クーポン差し替えで usageCount を 1 戻す。
 * `gt: 0` を同一 UPDATE の WHERE に置き、0 件更新は no-op（負数にしない）。
 */
export async function releaseCouponUsage(
  tx: CouponReleaseClient,
  args: { couponId: string },
): Promise<void> {
  await tx.coupon.updateMany({
    where: { id: args.couponId, usageCount: { gt: 0 } },
    data: { usageCount: { decrement: 1 } },
  });
}

export async function ensureNoOverlap(
  params: {
    spaceId: string;
    startTime: Date;
    endTime: Date;
    excludeReservationId?: string;
  },
  tx?: Tx,
): Promise<void> {
  // Reservation ↔ Event cross-table overlap を SSoT で検査 (Priority-10 audit #4)。
  // 旧 checkReservationOverlap は Reservation-only だったため、Event 側書込が同一 Space
  // に生きたスロットを持っていても Reservation 側は素通りする race を放置していた。
  // 現在は `checkSpaceOverlap` に一本化し、tx 経由呼出時は lockSpaceForTransaction で
  // 直列化された空間で Reservation ↔ EventTimeSlot 両方を判定する。
  const result = await checkSpaceOverlap(params, tx);
  if (result.hasOverlap) {
    const message =
      result.type === "event"
        ? "選択された時間帯は既にイベントで予約されています。別の時間帯をお選びください。"
        : "選択された時間帯は既に予約されています。別の時間帯をお選びください。";
    throw new DomainError(message, "CONFLICT");
  }
}

export async function incrementCustomerReservationStats(
  tx: Tx,
  customerId: string,
): Promise<void> {
  const customer = await tx.customer.findUniqueOrThrow({
    where: { id: customerId },
    select: { firstReservationAt: true },
  });
  const now = new Date();
  await tx.customer.update({
    where: { id: customerId },
    data: {
      totalReservations: { increment: 1 },
      lastReservationAt: now,
      ...(customer.firstReservationAt === null
        ? { firstReservationAt: now }
        : {}),
    },
  });
}

/**
 * Customer の予約統計 (`totalReservations` / `totalSpent` / `firstReservationAt` /
 * `lastReservationAt`) を Reservation テーブル実履歴から再計算する。
 *
 * ## いつ使うか
 *
 * increment/decrement で維持している stat が **customerId の変更 or merge で
 * 追随できない場合**の再構築経路として使う。具体的には:
 *
 * - `mergeCustomerCommand` — source の全 relation を target に移管したあと、target の
 *   stat を実履歴で確定する
 * - `updateAdminReservationCommand` — 予約再割当時に旧 customer / 新 customer 両方の
 *   stat を再計算する (Codex data-retention レビュー中に silently 発生することが発覚)
 *
 * ## 集計仕様
 *
 * - `deletedAt: null` の予約のみを対象 (soft-delete は「無かった」扱い)
 * - `totalReservations` = COUNT
 * - `totalSpent` = SUM(COALESCE(totalPriceWithTax, totalPrice, 0)) — 0 円 / 0 件は
 *   null に折りたたむ (Customer.totalSpent の列 semantics と一致)。COALESCE fallback は
 *   admin 経路の予約が totalPriceWithTax を populate しない (customer-commands.ts の
 *   customer self-service update だけが setter) ため必須。fallback なしでは admin
 *   作成予約が SUM から silently drop し、totalSpent が本番で恒常 null になる
 *   (Codex #3564968552)。
 * - `firstReservationAt` = MIN(createdAt)、`lastReservationAt` = MAX(createdAt)
 *   (`incrementCustomerReservationStats` の `now` semantics と揃える — 予約の実施
 *   時刻ではなく作成時刻。0 件なら null)
 *
 * ## 実装
 *
 * Prisma の `_sum` は SQL COALESCE を直接受けられないため、単一 `$queryRaw` で
 * COUNT / SUM(COALESCE) / MIN / MAX を一度に取る。float8 cast で JS 数値として
 * 受ける (Customer.totalSpent は Decimal(10,2) だが小売レンジで float 精度で十分。
 * 既存 `mergeCustomerCommand` の `Number(stats._sum.totalPriceWithTax)` cast と
 * 同じ trade-off)。
 */
export async function recomputeCustomerReservationStats(
  tx: Tx,
  customerId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<
    Array<{
      count: bigint;
      sum: number | null;
      first_created: Date | null;
      last_created: Date | null;
    }>
  >`
    SELECT
      COUNT(*)::bigint AS count,
      SUM(COALESCE(total_price_with_tax, total_price))::float8 AS sum,
      MIN(created_at) AS first_created,
      MAX(created_at) AS last_created
    FROM "reservations"
    WHERE customer_id = ${customerId} AND deleted_at IS NULL
  `;
  const stats = rows[0];

  await tx.customer.update({
    where: { id: customerId },
    data: {
      totalReservations: stats ? Number(stats.count) : 0,
      totalSpent: stats?.sum ? Number(stats.sum) : null,
      firstReservationAt: stats?.first_created ?? null,
      lastReservationAt: stats?.last_created ?? null,
    },
  });
}

export function buildPayload(params: {
  reservationId: string;
  customer: {
    lastName: string;
    firstName: string;
    companyName: string | null;
    email: string;
  };
  space: {
    name: string;
    addressDetail: string | null;
    location: { address: string };
  };
  startTime: Date;
  endTime: Date;
  totalPrice: number | null;
  totalPriceWithTax?: number | null;
  notes?: string | null | undefined;
  guestName?: string | null;
  icsSequence: number;
  userId?: string | null;
}): ReservationPayload {
  return {
    reservationId: params.reservationId,
    customerEmail: params.customer.email,
    customerName: `${params.customer.lastName} ${params.customer.firstName}`,
    companyName: params.customer.companyName,
    ...(params.guestName && { guestName: params.guestName }),
    spaceName: params.space.name,
    startTime: params.startTime,
    endTime: params.endTime,
    totalPrice: params.totalPrice,
    totalPriceWithTax: params.totalPriceWithTax ?? null,
    notes: params.notes ?? undefined,
    location: formatSpaceLineAddress(
      params.space.location.address,
      params.space.addressDetail,
    ),
    icsSequence: params.icsSequence,
    userId: params.userId ?? null,
  };
}

/**
 * 予約 ID からメール送信用ペイロードを再取得する。
 *
 * `updateCustomerReservation`（顧客セルフ変更）のように更新コマンドが最小限の
 * payload しか返さない経路で、更新後のメール送信に必要な最新状態を組み立てるために使う。
 */
export async function fetchReservationEmailData(
  reservationId: string,
): Promise<ReservationPayload | null> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      totalPrice: true,
      totalPriceWithTax: true,
      notes: true,
      icsSequence: true,
      userId: true,
      guestLastName: true,
      guestFirstName: true,
      customer: { select: CUSTOMER_SELECT },
      space: {
        select: {
          name: true,
          addressDetail: true,
          location: { select: { address: true } },
        },
      },
    },
  });
  if (!reservation) return null;

  const guestFull =
    `${reservation.guestLastName ?? ""} ${reservation.guestFirstName ?? ""}`.trim();
  const customerFull =
    `${reservation.customer.lastName} ${reservation.customer.firstName}`.trim();
  const guestNameDiff =
    guestFull && guestFull !== customerFull ? guestFull : null;

  return buildPayload({
    reservationId: reservation.id,
    customer: reservation.customer,
    space: reservation.space,
    startTime: reservation.startTime,
    endTime: reservation.endTime,
    totalPrice: reservation.totalPrice,
    totalPriceWithTax: reservation.totalPriceWithTax,
    notes: reservation.notes,
    guestName: guestNameDiff,
    icsSequence: reservation.icsSequence,
    userId: reservation.userId,
  });
}
