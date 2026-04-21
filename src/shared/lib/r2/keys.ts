/**
 * Cloudflare R2 Object Key ユーティリティ（client-safe pure functions）
 *
 * Key 構造: `{prefix}/{folder}/{timestamp}-{uuid}.{ext}`
 *
 * - `prefix`: `STORAGE_PREFIXES` の 4 値のいずれか（旧 Supabase Bucket 名相当）
 * - `folder`: 任意サブパス（spaceId / postId / logo 等のスコープ）
 * - `timestamp-uuid.ext`: 衝突回避のためのランダム化ファイル名
 *
 * Public URL: `{R2_PUBLIC_URL}/{key}` で Cloudflare R2 カスタムドメインから配信。
 * Server Action プロキシ方式で保存・削除するため Presigned URL は使わない。
 */

export const STORAGE_PREFIXES = {
  SPACES: "spaces",
  POSTS: "posts",
  SITE: "site",
  MEDIA: "media",
} as const;

export type StoragePrefix =
  (typeof STORAGE_PREFIXES)[keyof typeof STORAGE_PREFIXES];

/**
 * ファイル名から拡張子（小文字、ドットなし）を抽出する。
 * 拡張子がない場合は空文字を返す。
 */
function getFileExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  if (idx < 0 || idx === filename.length - 1) return "";
  return filename.slice(idx + 1).toLowerCase();
}

type GenerateStorageKeyInput = {
  prefix: StoragePrefix;
  filename: string;
  /** 任意のサブフォルダ（例: spaceId / postId / logo）*/
  folder?: string;
};

/**
 * 衝突回避つきの R2 Object Key を生成する。
 *
 * @example
 *   generateStorageKey({ prefix: "spaces", folder: "abc", filename: "hero.jpg" })
 *   // => "spaces/abc/1713654000000-550e8400-e29b-41d4-a716-446655440000.jpg"
 */
export function generateStorageKey(input: GenerateStorageKeyInput): string {
  const ext = getFileExtension(input.filename);
  const uniqueId = crypto.randomUUID();
  const timestamp = Date.now();
  const folderSegment = input.folder ? `${input.folder}/` : "";
  const extSegment = ext ? `.${ext}` : "";
  return `${input.prefix}/${folderSegment}${timestamp}-${uniqueId}${extSegment}`;
}

/**
 * 末尾スラッシュを除去する（URL 結合時の正規化）。
 */
function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/**
 * 先頭スラッシュを除去する（key 正規化）。
 */
function stripLeadingSlash(key: string): string {
  return key.startsWith("/") ? key.slice(1) : key;
}

/**
 * R2 Object Key から公開 URL を構築する。
 *
 * @param key 例: "spaces/abc/123.jpg"
 * @param publicUrl カスタムドメイン URL（例: "https://media.example.com"）
 */
export function buildPublicUrl(key: string, publicUrl: string): string {
  return `${stripTrailingSlash(publicUrl)}/${stripLeadingSlash(key)}`;
}

/**
 * 公開 URL から Object Key 部分を抽出する。
 * Public URL と一致しない URL の場合は null を返す。
 *
 * @param url 例: "https://media.example.com/spaces/abc/123.jpg"
 * @param publicUrl カスタムドメイン URL
 */
export function extractKeyFromUrl(
  url: string,
  publicUrl: string,
): string | null {
  const base = stripTrailingSlash(publicUrl);
  if (!url.startsWith(`${base}/`)) return null;
  return url.slice(base.length + 1);
}
