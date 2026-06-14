import "server-only";

/**
 * dev-login 専用テスト顧客の credentials（server 専用）。
 *
 * `server-only` でクライアントバンドルへの混入を構造的に禁止する
 * （Next.js 公式推奨。dev 専用値・秘匿値をクライアント JS に出さない）。
 * 利用は `dev-login-action.ts` のサーバーアクション内のみ。
 */
export const DEV_CUSTOMER_CREDENTIALS = {
  email: "dev-customer@example.com",
  password: "dev-password-12345",
  name: "開発テスト",
} as const;
