import type { PaymentStatus } from "@/shared/lib/validations/enums/prisma-types";

/**
 * 銀行振込先を顧客に表示するか（SSoT）。
 *
 * payment feature ON 時は Checkout 主導線のため非表示。
 * payment OFF かつ UNPAID/FAILED かつ active 口座が 1 件以上のときのみ表示。
 */
export function shouldShowTransferAccounts(input: {
  paymentFeatureEnabled: boolean;
  paymentStatus: PaymentStatus;
  activeAccountCount: number;
}): boolean {
  if (input.paymentFeatureEnabled) {
    return false;
  }
  if (input.activeAccountCount <= 0) {
    return false;
  }
  return input.paymentStatus === "UNPAID" || input.paymentStatus === "FAILED";
}
