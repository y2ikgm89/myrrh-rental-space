/**
 * 公開 chrome（ヘッダー / モバイルナビ）向けの認証導線 kind。
 *
 * - `mypage`: CUSTOMER / USER → マイページ導線
 * - `login`: 未認証 → ログイン導線
 * - `null`: 管理ロール等 → 公開 chrome では認証導線を出さない
 *
 * HTML に埋め込まず `/api/customer/auth-kind`（private, no-store）経由で
 * client hydrate 後に解決する。CDN の blanket public キャッシュと Cookie vary
 * 不在による cross-user auth UI 漏洩を防ぐ。
 */

import { Role } from "@/shared/lib/validations/enums/prisma-types";

export type PublicAuthKind = "mypage" | "login" | null;

export function resolvePublicAuthKind(
  user: { readonly role: Role } | null,
): PublicAuthKind {
  if (!user) return "login";
  if (user.role === Role.CUSTOMER || user.role === Role.USER) return "mypage";
  return null;
}

export function isPublicAuthKind(value: unknown): value is PublicAuthKind {
  return value === "mypage" || value === "login" || value === null;
}
