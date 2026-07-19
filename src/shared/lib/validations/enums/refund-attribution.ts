// =============================================================================
// Refund Actor Type（`refunds.refundedByType` の VARCHAR 値 — Prisma enum ではない）
//
// DB 側の CHECK 制約 `refunds_refundedByType_check` と application 側の enum を
// 二重防御する。返金の起点 (誰が発火したか) を AuditLog metadata と併用する。
//
// 独立モジュールで宣言する理由: `helpers.ts` は `./guards` 経由で Prisma 生成
// enums (SocialPlatform 含む多数) を transitive に load する。webhook / refund
// 系のコードは type guard のためだけに value import が必要で、helpers 経由だと
// 消費側の test mock が `@generated/prisma/enums` を差し替えたときに不足 export
// で SyntaxError を起こす。attribution 4 items のみを持つ最小モジュールに
// 切り出すことで、消費側の transitive dep を Prisma enums から完全に切り離す
// (feedback: stale-branch-name-reuse-and-mock-module-coverage 相当の再発防止)。
// =============================================================================

export const REFUNDED_BY_TYPE = {
  /** 管理者が admin UI から明示的に返金 */
  ADMIN: "ADMIN",
  /** キャンセル副作用 (`cancellation-side-effects.ts`) で自動発火した返金 */
  AUTO_ON_CANCEL: "AUTO_ON_CANCEL",
  /** Stripe Dashboard 経由の手動返金 (webhook 経由で back-fill) */
  STRIPE_DASHBOARD: "STRIPE_DASHBOARD",
} as const;

export type RefundedByType =
  (typeof REFUNDED_BY_TYPE)[keyof typeof REFUNDED_BY_TYPE];

export const REFUNDED_BY_TYPE_LABELS: Record<RefundedByType, string> = {
  [REFUNDED_BY_TYPE.ADMIN]: "管理者",
  [REFUNDED_BY_TYPE.AUTO_ON_CANCEL]: "自動（キャンセル）",
  [REFUNDED_BY_TYPE.STRIPE_DASHBOARD]: "Stripe Dashboard",
};

/**
 * Stripe refund object の `metadata.initiator` 値が既知の RefundedByType かを判定する。
 * webhook (`applyChargeRefundIdempotent`) が Stripe から受け取った refund の attribution
 * を Refund.refundedByType に書き戻すときの narrow に使う。
 *
 * app 側 refund (`refundReservation/EventRegistrationPaymentCommand`) は Stripe API 呼び出し
 * 時に metadata.initiator = actorType を仕込むため、webhook がその refund を先に受信して
 * Refund 行を作るときも正しい attribution が復元できる (hardcode "STRIPE_DASHBOARD" 時代の
 * race-mislabel を防ぐ)。metadata が空 / 未知値なら真の Stripe Dashboard 発行として fallback。
 */
export function isValidRefundedByType(v: unknown): v is RefundedByType {
  if (typeof v !== "string") return false;
  return Object.values(REFUNDED_BY_TYPE).some((t) => t === v);
}
