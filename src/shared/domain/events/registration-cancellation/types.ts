import { PaymentStatus } from "@/shared/lib/validations/enums/prisma-types";
import {
  CANCELLED_BY,
  type CancelledByType,
} from "@/shared/lib/validations/enums/helpers";
import type { RefundPolicyResolution } from "@/shared/domain/refund/policy";
import type { WaitlistPromotionOutcome } from "@/shared/domain/events/registration-cancel-core";

export type EventCancelChannel =
  "admin" | "customer-mypage" | "customer-token" | "system";

export interface EventCancellationSideEffectInput {
  registrationId: string;
  /** どこから / 誰がキャンセルしたか。AuditLog metadata と通知タイトル分岐に使う。 */
  channel: EventCancelChannel;
  /** AuditLog.userId に書く。会員セルフキャンセルでは値あり、ゲスト/管理者では null。 */
  actorUserId: string | null;
  /** リクエスト由来のコンテキスト（監査・フォレンジック用）。 */
  request: {
    ip: string | null;
    userAgent: string | null;
    /** ステートレストークン経路でのみ意味を持つ。SHA-256 の先頭 16 文字。 */
    tokenFingerprint?: string | null;
  };
  /**
   * `applyEventRegistrationCancellation` の戻り値 `promoted` をそのまま渡す。
   * CONFIRMED または WAITLISTED_OFFERED 由来のキャンセルで空いた枠に FIFO
   * 先頭の WAITLISTED が昇格した場合のみ非 null。呼び出し側（3 つの cancel
   * 経路すべて）はドメインコマンドの戻り値を素通しするだけでよい（このヘルパー
   * 内部で「昇格していたら繰り上げ当選メールを送る」判断まで完結させる SSoT）。
   */
  promoted: WaitlistPromotionOutcome;
  /**
   * MYPAGE-EVENT-02: 呼出側が `Settings.refundPolicy` を事前に取得済ならその snapshot を
   * 渡す（`reservations/cancellation-side-effects.ts` の同名フィールドと同型契約）。
   *
   * - 省略 (undefined) → 従前どおり per-call で `Settings.findUnique` を実行
   * - `RefundPolicyResolution` → その snapshot を使用
   */
  refundPolicySnapshot?: RefundPolicyResolution;
}

/** 単一副作用の実行結果。予約側と同型（reservations/cancellation-side-effects.ts）。 */
export type EventCancellationEffectOutcome = {
  status: "ok" | "skipped" | "error";
  reason?: string;
  detail?: Record<string, string | number | boolean | null>;
};

/** 全副作用の outcome を並べた集約構造。AuditLog metadata.sideEffects に格納される。 */
export type EventCancellationSideEffectOutcomes = {
  refund: EventCancellationEffectOutcome;
  checkoutSessionExpire: EventCancellationEffectOutcome;
  customerEmail: EventCancellationEffectOutcome;
  adminEmail: EventCancellationEffectOutcome;
  notification: EventCancellationEffectOutcome;
  waitlistOffer: EventCancellationEffectOutcome;
};

export const CHANNEL_TO_CANCELLED_BY: Record<
  EventCancelChannel,
  CancelledByType
> = {
  admin: CANCELLED_BY.ADMIN,
  "customer-mypage": CANCELLED_BY.CUSTOMER_MYPAGE,
  "customer-token": CANCELLED_BY.CUSTOMER_TOKEN,
  system: CANCELLED_BY.SYSTEM,
};

export interface SideEffectRegistration {
  id: string;
  eventId: string;
  name: string;
  email: string | null;
  quantity: number;
  icsSequence: number;
  paymentStatus: PaymentStatus;
  stripePaymentIntentId: string | null;
  stripeCheckoutSessionId: string | null;
  paidAmount: number | null;
  event: { title: string };
  slot: { startAt: Date };
}
