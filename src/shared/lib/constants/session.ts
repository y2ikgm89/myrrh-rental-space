/**
 * セッション設定
 *
 * Better Auth のセッション有効期限などを一元管理
 */

export const SESSION_CONFIG = {
  /** セッション有効期限（秒） - 30日 */
  expiresIn: 60 * 60 * 24 * 30,

  /** セッション更新間隔（秒） - 1日 */
  updateAge: 60 * 60 * 24,

  /** Cookie キャッシュ有効期限（秒） - 5分 */
  cookieCacheMaxAge: 60 * 5,
} as const;
