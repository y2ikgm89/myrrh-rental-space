/**
 * `createWaitlistOfferCheckoutSessionCommand` が投げる `VALIDATION` のうち、
 * waitlist checkout route が振り分けるメッセージの SSoT。
 * `DomainError` は細分コードを持たないため、分類はこれらの定数との
 * 文字列一致になる。payment-commands からも同じ定数を export する。
 */

export const WAITLIST_OFFER_NOT_ACTIVE_MESSAGE =
  "この繰り上げ当選は確定待ちの状態ではありません";

export const WAITLIST_OFFER_EXPIRED_MESSAGE =
  "この繰り上げ当選は既に期限切れです";

export const WAITLIST_OFFER_TOO_LATE_MESSAGE =
  "確定期限までの残り時間が短いため、決済を開始できません。期限切れ後に次の待機者へ繰り上がります。";
