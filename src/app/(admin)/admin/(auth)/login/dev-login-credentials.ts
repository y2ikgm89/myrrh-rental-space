import "server-only";

/**
 * dev-login 用の管理者 credentials（server 専用）。
 *
 * `server-only` でクライアントバンドルへの混入を構造的に禁止する
 * （Next.js 公式推奨）。利用は `dev-login-action.ts` のサーバーアクション内のみ。
 * seed.ts の SUPER_ADMIN credentials と一致させる必要がある
 * （`--production` seed では作成されないため本番 DB には存在しない）。
 */
export const DEV_ADMIN_CREDENTIALS = {
  email: "superadmin@example.com",
  password: "superadmin123",
} as const;
