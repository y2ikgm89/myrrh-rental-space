/**
 * 手動入金後の領収書発行が部分失敗したときの管理者向けメッセージ SSoT。
 *
 * PAID claim は成功済みのため mutation 自体は成功とし、`receiptWarning` として
 * 透過する（予約・イベント共通）。
 */

/** VALIDATION スキップ（業務上発行しない）時 */
export const MANUAL_PAYMENT_RECEIPT_SKIPPED_WARNING =
  "入金は記録しましたが、領収書の発行条件を満たさないためスキップしました。必要に応じて後から発行できます。";

/** 予期せぬ発行失敗時（PAID 維持・backfill 救済） */
export const MANUAL_PAYMENT_RECEIPT_DEFERRED_WARNING =
  "入金は記録しました。領収書の発行に失敗したため、後ほど自動発行されます。";
