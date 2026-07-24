import { z } from "zod";
import { isAppRoute } from "@/shared/lib/typed-routes";

/**
 * 公開サイトの管理者が編集できる href 用の許可スキーム。
 * Lexical / sanitize-html と揃え、javascript: / data: を拒否する。
 */
export const PUBLIC_HREF_ALLOWED_SCHEMES = [
  "http",
  "https",
  "mailto",
  "tel",
] as const;

export type PublicHrefAllowedScheme =
  (typeof PUBLIC_HREF_ALLOWED_SCHEMES)[number];

function getUrlScheme(url: string): string | null {
  try {
    return new URL(url).protocol.replace(/:$/, "").toLowerCase();
  } catch {
    return null;
  }
}

function isAllowedPublicHrefScheme(
  scheme: string,
): scheme is PublicHrefAllowedScheme {
  for (const allowed of PUBLIC_HREF_ALLOWED_SCHEMES) {
    if (allowed === scheme) return true;
  }
  return false;
}

/**
 * 内部 app route（`/` 始まり、`//` 除外）または許可スキーム付き絶対 URL か。
 * protocol-relative (`//evil`) や `javascript:` は false。
 */
export function isSafePublicHref(url: string): boolean {
  if (!url || url.trim() !== url) return false;
  // `isAppRoute` は type predicate のため、true 分岐後の url は Route に narrow され
  // 後続の `startsWith("//")` が never 扱いになる。protocol-relative を先に弾く。
  if (url.startsWith("//")) return false;
  if (isAppRoute(url)) return true;
  const scheme = getUrlScheme(url);
  if (scheme === null) return false;
  return isAllowedPublicHrefScheme(scheme);
}

/**
 * 内部リンク（ナビの isExternal=false）として保存可能な URL か。
 */
export function isInternalNavHref(url: string): boolean {
  return isAppRoute(url);
}

/**
 * 外部リンク（ナビ isExternal / SNS / sidebar custom 外部）として保存可能な URL か。
 * 相対 path は不可。http(s)/mailto/tel のみ。
 */
export function isExternalPublicHref(url: string): boolean {
  if (!url || url.startsWith("/") || url.startsWith("//")) return false;
  const scheme = getUrlScheme(url);
  if (scheme === null) return false;
  return isAllowedPublicHrefScheme(scheme);
}

/**
 * 描画時フォールバック: 安全ならそのまま、不安全なら null。
 */
export function toSafePublicHref(
  url: string | null | undefined,
): string | null {
  if (url == null || url === "") return null;
  return isSafePublicHref(url) ? url : null;
}

export const internalNavHrefSchema = z
  .string()
  .min(1, { error: "URLは必須です" })
  .max(500)
  .refine(isInternalNavHref, {
    error: "内部リンクは / から始まるパスを指定してください",
  });

export const externalPublicHrefSchema = z
  .string()
  .min(1, { error: "URLは必須です" })
  .max(500)
  .refine(isExternalPublicHref, {
    error:
      "外部リンクは http(s) / mailto / tel の URL を指定してください（javascript: 等は不可）",
  });

/**
 * ナビ URL: isExternal に応じて内部 / 外部ルールを切替。
 */
export function navigationHrefSchema(isExternal: boolean) {
  return isExternal ? externalPublicHrefSchema : internalNavHrefSchema;
}

/**
 * サイドバー custom 等: 空 / null / undefined は許可、値があれば内部 or 許可外部。
 */
export const optionalSafePublicHrefSchema = z.preprocess(
  (value) => (value === null || value === "" ? undefined : value),
  z
    .string()
    .max(500)
    .optional()
    .refine((value) => value === undefined || isSafePublicHref(value), {
      error:
        "リンクは / から始まるパス、または http(s) / mailto / tel の URL を指定してください",
    }),
);
