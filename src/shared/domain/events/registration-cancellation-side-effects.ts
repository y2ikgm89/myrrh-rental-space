/**
 * イベント参加申込キャンセル後の副作用を統一的に実行する。
 *
 * 会員（マイページ）/ ゲスト（メールリンク）/ 管理者（管理画面）の全キャンセル経路が
 * 同じ副作用チェーンを通ることを保証する SSoT。
 * 設計は `reservations/cancellation-side-effects.ts` と同型
 * （GCal 同期削除は EventRegistration にカレンダー同期フィールドが無いため対象外）。
 *
 * 実装は `registration-cancellation/` 配下の concern 別モジュールに分割し、
 * 本ファイルは公開 API の re-export のみを担う。
 *
 * @module shared/domain/events/registration-cancellation-side-effects
 */

export { applyEventRegistrationCancellationSideEffects } from "@/shared/domain/events/registration-cancellation/apply-side-effects";
export type {
  EventCancelChannel,
  EventCancellationEffectOutcome,
  EventCancellationSideEffectInput,
  EventCancellationSideEffectOutcomes,
} from "@/shared/domain/events/registration-cancellation/types";
