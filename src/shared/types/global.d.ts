/**
 * グローバル型定義
 *
 * グローバル変数の型を定義。
 * NOTE:
 * - `prisma` シングルトンは実体所有者である `@/shared/db/prisma` 内で
 *   `declare global { var prisma: PrismaClient | undefined }` を持つ
 *   （gateway 経由で PrismaClient 型を引き込まないため）
 * - `auth` は型推論のために `auth.ts` 内で declare global を使用
 */

/** gtag() の第1引数コマンド型 */
type GtagCommand = "config" | "event" | "get" | "set" | "consent" | "js";

/** gtag() のパラメータ型 */
type GtagParams = Record<string, string | number | boolean | null | undefined>;

declare global {
  // Google Analytics gtag（@next/third-parties が注入）
  var gtag:
    | ((command: GtagCommand, target: string, params?: GtagParams) => void)
    | undefined;
}

export {};
