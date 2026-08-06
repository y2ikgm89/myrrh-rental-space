/**
 * 顧客メール配信状態の文字列欄の上限。**列長と slice の両方がここを見る。**
 *
 * `customers.email_delivery_reason` は Resend webhook の bounce/complaint 理由を
 * 切り詰めて保存する。別々に書いていると、片方だけ動いたときに DB 22001 になる。
 */

/** `Customer.emailDeliveryReason` / `@db.VarChar(500)` に対応する上限。 */
export const CUSTOMER_EMAIL_DELIVERY_REASON_MAX_LENGTH = 500;
