/**
 * Cloudflare R2 Object Key ユーティリティ（client-safe pure functions）
 *
 * Key 構造: `{prefix}/{folder}/{timestamp}-{uuid}.{ext}`
 *
 * - `prefix`: `STORAGE_PREFIXES` の 4 値のいずれか（R2 バケット内の仮想フォルダ）
 * - `folder`: 任意サブパス（spaceId / postId / logo 等のスコープ）。
 *   path traversal 防止のため `[a-z0-9-]+` のみ許可（複数階層は使わない設計）。
 * - `timestamp-uuid.ext`: 衝突回避のためのランダム化ファイル名
 *   （拡張子は **server-side 検出済み MIME から派生** — user filename は使用しない）
 *
 * Public URL: `{R2_PUBLIC_URL}/{key}` で Cloudflare R2 カスタムドメインから配信。
 * Server Action プロキシ方式で保存・削除するため Presigned URL は使わない。
 *
 * @security user filename をそのまま key に流すと `evil.png/../../foo` のような
 *   path-segment injection が可能（key は literal だが CDN URL 正規化と非対称になり
 *   cache poisoning / 将来の prefix-based authorization の bypass 経路になる）。
 *   このモジュールは **filename を一切 key に転記しない** clean-break 設計。
 */

import {
  MEDIA_MIME_EXTENSIONS,
  type SupportedMediaMimeType,
} from "./media-magic-bytes";

export const STORAGE_PREFIXES = {
  SPACES: "spaces",
  POSTS: "posts",
  SITE: "site",
  MEDIA: "media",
} as const;

export type StoragePrefix =
  (typeof STORAGE_PREFIXES)[keyof typeof STORAGE_PREFIXES];

/**
 * folder セグメントの許可文字: 小文字英数字 + ハイフン（slug-style）。
 * Stripe / Shopify / GitHub の URL slug 業界標準と一致。
 */
const FOLDER_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * folder 文字列が安全かを判定する。複数階層 / path traversal / 大文字 / 記号は拒否。
 */
export function isValidStorageFolder(folder: string): boolean {
  if (folder.length === 0 || folder.length > 64) return false;
  return FOLDER_PATTERN.test(folder);
}

type GenerateStorageKeyInput = {
  prefix: StoragePrefix;
  /**
   * **server-side で検出済みの MIME type**（`detectMediaMimeFromMagicBytes` の戻り値等）。
   * クライアント供給の `file.type` は magic-byte 偽装可能なため受け付けない。
   */
  contentType: SupportedMediaMimeType;
  /** 任意のサブフォルダ（`isValidStorageFolder` を通過した値のみ）*/
  folder?: string;
};

/**
 * 衝突回避つきの R2 Object Key を生成する。
 *
 * @throws {Error} folder が許可パターン (`[a-z0-9-]+`) を満たさない場合
 *
 * @example
 *   generateStorageKey({
 *     prefix: "spaces",
 *     folder: "abc",
 *     contentType: "image/jpeg",
 *   })
 *   // => "spaces/abc/1713654000000-550e8400-e29b-41d4-a716-446655440000.jpg"
 */
export function generateStorageKey(input: GenerateStorageKeyInput): string {
  if (input.folder !== undefined && !isValidStorageFolder(input.folder)) {
    throw new Error(
      `Invalid storage folder: must match /^[a-z0-9-]+$/ (max 64 chars). Got: ${JSON.stringify(input.folder)}`,
    );
  }
  const ext = MEDIA_MIME_EXTENSIONS[input.contentType];
  const uniqueId = crypto.randomUUID();
  const timestamp = Date.now();
  const folderSegment = input.folder ? `${input.folder}/` : "";
  return `${input.prefix}/${folderSegment}${timestamp}-${uniqueId}.${ext}`;
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
