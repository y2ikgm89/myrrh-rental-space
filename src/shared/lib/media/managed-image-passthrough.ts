/**
 * 管理メディア（R2）の画像を公開 origin から pass-through するときの fail-closed ガード。
 *
 * ## なぜ（監査 A-46）
 *
 * `/icon` と `/apple-icon` は DB の `SettingsSeo.faviconUrl` を fetch して、
 * **上流の `Content-Type` をそのまま付けて自サイト origin から配信**していた。
 * `X-Content-Type-Options: nosniff` は明示された `Content-Type` を止めないので、
 * 上流が `text/html` を返せば自ドメイン上で HTML が描画される。
 * しかも `public, max-age=3600, stale-while-revalidate=86400` で edge にキャッシュされ、
 * 設定を戻しても最大 1 日 stale が配られる。
 *
 * 書き込み側は `updateBasicInfo` の `assertAllowedManagedImageUrls` が既に
 * 「管理画面からアップロードしたメディアのみ」を強制している。ここはその**下流での
 * 二重化**で、seed / 直接 SQL / 過去の行など、書き込みガードを通っていない値が
 * DB にあっても公開 origin から任意コンテンツを配らないようにする。
 *
 * ## 何を通すか
 *
 * 1. URL が管理メディアの origin 上の https であること
 *    （判定は `isAllowedManagedImageSrc` — 書き込み側と同じ述語を使う）
 * 2. 上流の `Content-Type` が `SUPPORTED_IMAGE_MIME_TYPES` に載っていること
 *
 * 2 の許可集合は `uploadFile` が magic-byte から確定する MIME の SSoT と同一。
 * R2 に置かれた object はその 4 形式しか持ちえないので、集合を別に手書きしない
 * （手書きの第 2 リストは必ず drift する — 監査 A-44 の実例）。
 *
 * どちらか一方でも満たさなければ `null` を返す。**呼び出し側は fallback を描く。**
 */

import "server-only";

import { serverEnv } from "@/shared/lib/env/server";
import { isAllowedManagedImageSrc } from "@/shared/lib/media/next-image-src";
import { SUPPORTED_IMAGE_MIME_TYPES } from "@/shared/lib/r2/media-magic-bytes";
import { fetchPublicHttpResource } from "@/shared/lib/ssrf-guard";

const PASSTHROUGH_CONTENT_TYPES: ReadonlySet<string> = new Set(
  SUPPORTED_IMAGE_MIME_TYPES,
);

export type ManagedImagePassthrough = {
  readonly body: ReadableStream<Uint8Array>;
  /** 上流そのままではなく、許可集合に載っていることを確認済みの値。 */
  readonly contentType: string;
};

/**
 * pass-through 可能な出所か。`/images/...` のようなローカル public path は
 * fetch できないのでここでは弾く（絶対 https のみ）。
 */
function isPassthroughSource(url: string): boolean {
  if (!url.startsWith("https://")) return false;
  return isAllowedManagedImageSrc(url, {
    publicMediaUrl: serverEnv.R2_PUBLIC_URL ?? null,
  });
}

/** `image/png; charset=utf-8` のような parameter 付きを正規化する。 */
function normalizeContentType(raw: string | null): string {
  return (raw ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

/**
 * 管理メディアの画像を取得し、pass-through してよい形なら body と Content-Type を返す。
 * 出所・上流ステータス・Content-Type のいずれかが不適合なら `null`。
 */
export async function fetchManagedImagePassthrough(
  url: string,
): Promise<ManagedImagePassthrough | null> {
  if (!isPassthroughSource(url)) return null;

  try {
    const upstream = await fetchPublicHttpResource(url);
    if (!upstream.ok || !upstream.body) return null;

    const contentType = normalizeContentType(
      upstream.headers.get("content-type"),
    );
    if (!PASSTHROUGH_CONTENT_TYPES.has(contentType)) {
      await upstream.body.cancel();
      return null;
    }

    return { body: upstream.body, contentType };
  } catch {
    return null;
  }
}
