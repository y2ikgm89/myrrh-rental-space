/**
 * dev-login 専用テスト顧客の credentials（client + server 両方で参照）。
 * 本番環境では ensureDevUserAction が早期 return するため実際には使用されない。
 */
export const DEV_CUSTOMER_CREDENTIALS = {
  email: "dev-customer@example.com",
  password: "dev-password-12345",
  name: "開発テスト",
} as const;
