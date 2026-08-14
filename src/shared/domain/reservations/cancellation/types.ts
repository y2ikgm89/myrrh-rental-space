import { PaymentStatus } from "@/shared/lib/validations/enums/prisma-types";
import {
  CANCELLED_BY,
  type CancelledByType,
} from "@/shared/lib/validations/enums/helpers";
import type { RefundPolicyResolution } from "@/shared/domain/refund/policy";

export type CancelChannel =
  "admin" | "customer-mypage" | "customer-token" | "system";

/** リクエスト由来のコンテキスト（監査・フォレンジック用）。単発/bulk 両経路で共有する。 */
export interface CancelRequestContext {
  ip: string | null;
  userAgent: string | null;
  /** ステートレストークン経路でのみ意味を持つ。SHA-256 の先頭 16 文字。 */
  tokenFingerprint?: string | null;
}

/**
 * Phase B.2: bulk cancel 経路で per-instance の副作用を抑止するフラグ。
 *
 * `applyBulkCancellationSideEffects` が各 instance に対して `true` を渡すことで、
 * 個別メール（2N 通スパム）・個別 GCal delete を止め、series 単位の集約副作用
 * （1 回のみ）に一本化する（Codex fix 3599414659 / spec §4.5）。未指定
 * （`suppress` キー自体が無い）なら全フラグ falsy 相当となり、既存の単発
 * キャンセル経路は挙動変化なし。
 */
export type SideEffectSuppressFlags = {
  customerEmail?: boolean;
  adminEmail?: boolean;
  gcalDelete?: boolean;
  inAppNotification?: boolean;
};

export interface CancellationSideEffectInput {
  reservationId: string;
  /** 既に DB に書き込まれた cancellation reason。in-app 通知 / 監査 metadata に流す。 */
  cancellationReason: string | null;
  /** どこから / 誰がキャンセルしたか。AuditLog metadata と通知タイトル分岐に使う。 */
  channel: CancelChannel;
  /** AuditLog.userId に書く。会員セルフキャンセル/管理者キャンセルでは値あり、ゲストでは null。 */
  actorUserId: string | null;
  /** リクエスト由来のコンテキスト（監査・フォレンジック用）。 */
  request: CancelRequestContext;
  /** Phase B.2: bulk cancel 経路で per-instance の副作用を抑止する（既存 caller は未指定=従前挙動）。 */
  suppress?: SideEffectSuppressFlags;
  /**
   * PERF-02: 呼出側が `Settings.refundPolicy` を事前に取得済ならその snapshot を渡す。
   * bulk cancel 経路 (`applyBulkCancellationSideEffects`) が per-instance の
   * Settings.findUnique N+1 を避けるために hoist して渡す。
   *
   * - 省略 (undefined) → 従前どおり per-call で Settings.findUnique を実行
   * - `RefundPolicyResolution` → その snapshot を使用 (bulk 経路の hoist 値)
   */
  refundPolicySnapshot?: RefundPolicyResolution;
  /**
   * cron 等で副作用完了を待ってから HTTP を返す必要がある経路向け。
   * true のとき fireAndForget せず await する（デフォルト false = 既存 UX 維持）。
   */
  awaitCompletion?: boolean;
}

/** 単一副作用の実行結果。AuditLog metadata と in-code のフロー分岐に共通で使う。 */
export type CancellationEffectOutcome = {
  /**
   * - `"ok"` — 副作用が実際に外部へ反映された（メール送信受理 / GCal 削除 / DB 書込成功）
   * - `"skipped"` — 意図的に発火しなかった（対象データ無し / suppress flag / feature 無効 /
   *   Resend suppression list / policy=0% など）
   * - `"error"` — 発火したが失敗した（外部 API エラー / DB エラー / 予期せぬ throw）
   */
  status: "ok" | "skipped" | "error";
  /** skipped / error の場合の理由（machine-readable enum-like 文字列を優先）。 */
  reason?: string;
  /** amount / messageId / durationMs 等の副次情報（AuditLog に直接乗せる）。 */
  detail?: Record<string, string | number | boolean | null>;
};

/** 全副作用の outcome を並べた集約構造。AuditLog metadata.sideEffects に格納される。 */
export type CancellationSideEffectOutcomes = {
  refund: CancellationEffectOutcome;
  checkoutSessionExpire: CancellationEffectOutcome;
  gcal: CancellationEffectOutcome;
  customerEmail: CancellationEffectOutcome;
  adminEmail: CancellationEffectOutcome;
  notification: CancellationEffectOutcome;
  smartLock: CancellationEffectOutcome;
};

export const CHANNEL_TO_CANCELLED_BY: Record<CancelChannel, CancelledByType> = {
  admin: CANCELLED_BY.ADMIN,
  "customer-mypage": CANCELLED_BY.CUSTOMER_MYPAGE,
  "customer-token": CANCELLED_BY.CUSTOMER_TOKEN,
  system: CANCELLED_BY.SYSTEM,
};

export interface SideEffectReservation {
  id: string;
  startTime: Date;
  endTime: Date;
  totalPrice: number | null;
  totalPriceWithTax: number | null;
  /** 未失効の Refund 行（返金ポリシーの取り分から差し引く用。監査 F-43）。 */
  refunds: { amount: number }[];
  notes: string | null;
  icsSequence: number;
  paymentStatus: PaymentStatus;
  stripePaymentIntentId: string | null;
  stripeCheckoutSessionId: string | null;
  googleCalendarEventId: string | null;
  guestLastName: string | null;
  guestFirstName: string | null;
  guestEmail: string | null;
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
}
