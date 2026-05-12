/**
 * dev-login 用の管理者 credentials（client + server 両方で参照）。
 * seed.ts の SUPER_ADMIN credentials と一致させる必要がある。
 * 本番環境では `dev-login-button.tsx` がレンダリングされないため実際には使用されない。
 */
export const DEV_ADMIN_CREDENTIALS = {
  email: "superadmin@example.com",
  password: "superadmin123",
} as const;
