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
 * 前後に空白の付いた href を弾く。
 *
 * **3 つの述語すべてがこれを課すこと自体が不変条件。** `new URL()` は WHATWG URL 仕様
 * どおり前後の空白と C0 制御文字を捨ててから解釈するので、`" https://example.com"` は
 * scheme 判定を素通りする。以前は保存側の `isExternalPublicHref` だけがこれを許し、
 * 描画側の `toSafePublicHref` が拒否していたため、**管理者が URL を貼り付けたときに
 * 先頭の空白ごと保存が成功し、公開ページではそのリンクが href 無しで描画される**
 * （エラーは一度も出ない）。保存を通る href は描画も通る、を保つ。
 *
 * 貼り付けに紛れ込む空白は入力の不備であって拒否の理由ではないので、管理者が打ち込む
 * schema 側は `.trim()` で先に正規化する。ここで弾くのは schema を経由しない呼び出しと、
 * 文字列の**内側**に空白を含むような直しようのない値だけになる。
 */
function hasSurroundingWhitespace(url: string): boolean {
  // `.trim()` だけでは足りない。JS の trim が落とすのは空白と U+0009-U+000D で、
  // `new URL()` が捨てる C0 制御文字（U+0000-U+001F）の残りは通してしまう。
  // 通すと `U+0001` から始まる URL が保存も描画も通り、制御文字ごと href に
  // 出る（実測）。`new URL()` と同じ範囲を弾いて、保存値を解釈結果に一致させる。
  return (
    url !== url.trim().replace(/^[\u0000-\u001F]+|[\u0000-\u001F]+$/gu, "")
  );
}

/**
 * 内部 app route（`/` 始まり、`//` 除外）または許可スキーム付き絶対 URL か。
 * protocol-relative (`//evil`) や `javascript:` は false。
 */
export function isSafePublicHref(url: string): boolean {
  if (!url || hasSurroundingWhitespace(url)) return false;
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
  if (!url || hasSurroundingWhitespace(url)) return false;
  if (url.startsWith("/") || url.startsWith("//")) return false;
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
  .trim()
  .min(1, { error: "URLは必須です" })
  .max(500)
  .refine(isInternalNavHref, {
    error: "内部リンクは / から始まるパスを指定してください",
  });

export const externalPublicHrefSchema = z
  .string()
  .trim()
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
  if (!url || hasSurroundingWhitespace(url)) return false;
  if (url.startsWith("//")) return false;
  const scheme = getUrlScheme(url);
  return scheme === "http" || scheme === "https";
}

/**
 * 任意の href 欄を作る。**未入力は空文字ひとつで表す。**
 *
 * 以前は 2 つの optional href スキーマが別々の形で書かれ、同じ「未入力」を
 * `undefined` / `null` / `""` の 3 通りで表していた。形の違いは実害を出していた:
 *
 * - `z.union([z.string(), z.null()]).optional()` は conform の `getZodConstraint` に
 *   **`required: true`** を出させ、`maxLength` を落とす。実測でサイドバーの
 *   カスタムウィジェットの `linkUrl` だけが「任意なのに必須」の制約を持っていた
 *   （`description` / `linkLabel` は `required: false`）。#1812 で入れた形
 * - `z.preprocess` 版は `z.input` が `unknown` に落ち、conform の `submission.value`
 *   が呼び出し側と噛み合わない
 *
 * **`null` は受け付けない**（破壊的変更）。保存経路は `data.linkUrl || undefined` で
 * `null` を書かず、保存済み JSON にも `linkUrl: null` は無い（実測）。DB 列の NULL 化は
 * 保存側の責務であってスキーマの関心ではない。
 */
function optionalHrefSchema(
  isAllowed: (url: string) => boolean,
  error: string,
) {
  return z
    .string()
    .trim()
    .max(500)
    .refine((value) => value === "" || isAllowed(value), { error })
    .optional();
}

/** 任意の http(s) / 内部 path（mailto / tel は不可。Cookie 同意バナー等）。 */
export const optionalHttpOrInternalHrefSchema = optionalHrefSchema(
  isHttpOrInternalPublicHref,
  "リンクは / から始まるパス、または http(s) の URL を指定してください（javascript: 等は不可）",
);

/** 任意の内部 path / http(s) / mailto / tel（サイドバー custom 等）。 */
export const optionalSafePublicHrefSchema = optionalHrefSchema(
  isSafePublicHref,
  "リンクは / から始まるパス、または http(s) / mailto / tel の URL を指定してください",
);
