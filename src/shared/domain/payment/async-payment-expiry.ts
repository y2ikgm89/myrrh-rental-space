/**
 * 非同期決済（konbini / customer_balance）が確定しないまま滞留した行を、
 * fail-safe cron が最終的に回収するまでの日数。
 *
 * ## これは「支払期限」ではない
 *
 * 支払期限を持っているのは Stripe 側で、konbini の払込票は
 * `payment_method_options.konbini.expires_after_days` に従って
 * 23:59:59 JST に失効する（このリポジトリは同オプションを設定していないので
 * Stripe の既定が適用される）。正常系では失効時に
 * `checkout.session.async_payment_failed` が届き、`claim*AsFailed` が
 * paymentStatus を FAILED に落とし、各 cron の FAILED 分岐が枠を解放する。
 *
 * この定数が効くのは、**その webhook が届かなかったとき**だけ。
 * fail-safe cron の存在理由が「webhook 未設定 / ネットワーク断 / Stripe 側障害でも
 * 在庫を解放する」ことなので、webhook が書き込む列
 * (`stripePaymentIntentId`) を根拠に無条件で除外すると、fail-safe が
 * fail-safe でなくなる。除外は必ず有限時間で終わらせる。
 *
 * ## 値の根拠
 *
 * 通常の決済確定より確実に長く、かつ在庫を握り続ける期間としては十分短い値。
 * konbini の払込票は既定で数日、銀行振込 (customer_balance) は着金までに
 * 数営業日かかりうるので、それらを確実に上回る 14 日を採る。
 * 「Stripe の支払期限と一致させる」ためのものではないので、Stripe 側の設定を
 * 変えてもこの値を追随させる必要はない（常に長いほうであればよい）。
 */
export const ASYNC_PAYMENT_FAILSAFE_EXPIRY_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 非同期決済の滞留行に適用する cutoff（通常の cutoff より必ず過去）。 */
export function asyncPaymentFailsafeCutoff(now: Date): Date {
  return new Date(
    now.getTime() - ASYNC_PAYMENT_FAILSAFE_EXPIRY_DAYS * MS_PER_DAY,
  );
}
