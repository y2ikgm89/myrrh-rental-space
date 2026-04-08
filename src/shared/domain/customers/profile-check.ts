import { CUSTOMER_PLACEHOLDER_NAME } from "./link";

/**
 * 顧客プロフィールが予約・問い合わせに必要な最低限の情報を持っているか判定。
 *
 * - lastName が仮名（"未設定"）でないこと
 * - firstName が空でないこと
 * - email が存在すること
 */
export function isCustomerProfileComplete(customer: {
  lastName: string;
  firstName: string;
  email: string;
}): boolean {
  return (
    customer.lastName !== CUSTOMER_PLACEHOLDER_NAME &&
    customer.firstName.length > 0 &&
    customer.email.length > 0
  );
}
