import type { PaymentStatus } from "@/shared/lib/validations/enums/prisma-types";

/**
 * 銀行振込先を顧客に表示するか（SSoT）。
 *
 * オンライン決済が**実際に使える**とき（feature ON かつ Stripe credentials 設定済み）は
 * Checkout 主導線のため非表示。それ以外で UNPAID/FAILED かつ active 口座が 1 件以上の
 * ときだけ表示する。
 *
 * 入力を「feature が ON か」にしてはいけない（監査 F-133）。feature ON なのに
 * credentials が未設定・鍵ローテーション直後で欠損している状態では、決済ボタンは
 * `isOnlinePaymentAvailable()` が false になって消えるのに、振込先もこの gate で
 * 消えるため、**UNPAID の予約に支払手段が 1 つも出なくなる**。メールでも同じ。
 * 運用者からは「payment は ON なのだから Checkout で払えるはず」に見えるので気づけない。
 */
export function shouldShowTransferAccounts(input: {
  /** `isOnlinePaymentAvailable()` の結果（業務層 ∧ 技術層）。 */
  onlinePaymentAvailable: boolean;
  paymentStatus: PaymentStatus;
  activeAccountCount: number;
}): boolean {
  if (input.onlinePaymentAvailable) {
    return false;
  }
  if (input.activeAccountCount <= 0) {
    return false;
  }
  return input.paymentStatus === "UNPAID" || input.paymentStatus === "FAILED";
}
