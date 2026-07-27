/**
 * 予約キャンセル後の副作用を統一的に実行する。
 *
 * 会員（マイページ）/ ゲスト（メールリンク）/ 管理者（管理画面）の全キャンセル経路が
 * 同じ副作用チェーンを通ることを保証する SSoT。
 *
 * 実装は `cancellation/` 配下の concern 別モジュールに分割し、本ファイルは
 * 公開 API の re-export のみを担う。
 *
 * @module shared/domain/reservations/cancellation-side-effects
 */

export { applyCancellationSideEffects } from "@/shared/domain/reservations/cancellation/apply-instance-side-effects";
export { applyBulkCancellationSideEffects } from "@/shared/domain/reservations/cancellation/apply-bulk-side-effects";
export type {
  BulkCancellationScope,
  BulkCancellationSideEffectInput,
} from "@/shared/domain/reservations/cancellation/bulk-types";
export type {
  CancelChannel,
  CancelRequestContext,
  CancellationEffectOutcome,
  CancellationSideEffectInput,
  CancellationSideEffectOutcomes,
  SideEffectSuppressFlags,
} from "@/shared/domain/reservations/cancellation/types";
