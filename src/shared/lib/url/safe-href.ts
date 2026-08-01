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
 * Cookie 同意バナーの「詳細」リンク用: 内部 path または http(s) のみ（mailto/tel 不可）。
 */
export function isHttpOrInternalPublicHref(url: string): boolean {
  if (isInternalNavHref(url)) return true;
  if (!url || url.startsWith("//")) return false;
  const scheme = getUrlScheme(url);
  return scheme === "http" || scheme === "https";
}

/**
 * 任意の http(s) / 内部 path。空欄は undefined（Server Action で null 化）。
 */
export const optionalHttpOrInternalHrefSchema = z.preprocess(
  (value) => (value === null || value === "" ? undefined : value),
  z
    .string()
    .max(500)
    .optional()
    .refine(
      (value) => value === undefined || isHttpOrInternalPublicHref(value),
      {
        error:
          "リンクは / から始まるパス、または http(s) の URL を指定してください（javascript: 等は不可）",
      },
    ),
);

/**
 * サイドバー custom 等: 空 / 未指定は許可、値があれば内部 or 許可外部。
 *
 * **`z.preprocess` も `transform` も使わない。** preprocess は入力が本質的に
 * `unknown` なので、この schema を含む object を `z.output` で読むと
 * `linkUrl?: unknown` に落ちる。transform で直すと今度は input ≠ output になり、
 * conform（`useForm<z.input<…>>` が house pattern）の `submission.value` が
 * 変換前の型で返るので、受け取る側と噛み合わない。
 *
 * 入出力を同じ `string | undefined` に保ち、空文字は `refine` 側で通す。
 * 空文字→`undefined` の正規化は保存経路（`SidebarSection` の `|| undefined`）が
 * 従来から行っており、この schema の責務ではない。
 */
export const optionalSafePublicHrefSchema = z
  .string()
  .max(500)
  .optional()
  .refine((value) => !value || isSafePublicHref(value), {
    error:
      "リンクは / から始まるパス、または http(s) / mailto / tel の URL を指定してください",
  });
