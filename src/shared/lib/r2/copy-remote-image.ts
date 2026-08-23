/**
 * 外部サイトの画像を R2 へ複製する（server-only）。
 *
 * ## なぜ複製するか（監査 A-45）
 *
 * リンクカード（BookmarkNode）は OGP サムネイルと favicon を `<img src>` として
 * 本文 HTML に焼き込む。外部 URL のまま保存すると 2 箇所で塞がれる:
 *
 * - `assertAllowedManagedImageSourcesInJson` が `imageUrl` / `faviconUrl` を
 *   「管理画面からアップロードしたメディア」でないと判定し、**本文の保存自体が失敗する**
 * - 仮に保存できても CSP の `img-src` は R2 origin と固定 5 ホストしか許さないので、
 *   公開ページでは `Refused to load the image` になる
 *
 * 取得時点で R2 へ複製してしまえば、保存側の不変条件（管理メディアのみ）と
 * 表示側の不変条件（`img-src` に載る origin のみ）が同時に満たされる。
 * 外部画像のリンク切れ・閲覧者 IP の第三者への漏洩も同時に消える。
 *
 * ## 失敗は null（fail-closed）
 *
 * 取得失敗・サイズ超過・magic-byte が対応画像形式でない（ICO / SVG favicon 等）は
 * すべて `null` を返す。**外部 URL をそのまま返す経路は無い。** 呼び出し側は
 * 画像なしとして扱う（BookmarkNode は `imageUrl` / `faviconUrl` が空なら
 * `<img>` を出さない）。
 */

import "server-only";

import { fetchPublicHttpResource } from "@/shared/lib/ssrf-guard";

import { STORAGE_PREFIXES } from "./keys";
import { IMAGE_VALIDATION, uploadFile } from "./upload";

/**
 * 1 枚あたりの取得上限。`uploadFile` 側の画像上限（5MB）と同じ値にして、
 * 「ダウンロードは通ったが upload で弾かれる」無駄を作らない。
 */
const MAX_REMOTE_IMAGE_BYTES = 5 * 1024 * 1024;

const FETCH_TIMEOUT_MS = 10_000;

/**
 * `content-length` を信用せず、読み取り中も上限を強制する。
 * 単一インスタンスの Cloud Run コンテナを巨大ボディで OOM させる経路を塞ぐ。
 */
async function readBytesWithLimit(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;

  const body = response.body;
  if (!body) return null;

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  // `File` の BlobPart は ArrayBuffer 背後の view を要求するので、
  // ArrayBuffer を明示確保してから view を作る（SharedArrayBuffer 由来を除外）。
  const merged = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

/**
 * 外部画像を R2 へ複製し、公開 URL を返す。複製できなければ `null`。
 *
 * MIME は `uploadFile` が magic-byte から確定する（上流の `Content-Type` は
 * 信用しない）。対応形式外は upload 側が拒否するので、ここでは判定しない。
 *
 * @param url 複製元の絶対 URL（SSRF ガード付き fetch を通す）
 * @param folder R2 object key のサブフォルダ（`[a-z0-9-]+`）
 */
export async function copyRemoteImageToR2(
  url: string,
  folder: string,
): Promise<string | null> {
  let bytes: Uint8Array<ArrayBuffer> | null;
  try {
    const response = await fetchPublicHttpResource(url, {
      method: "GET",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    bytes = await readBytesWithLimit(response, MAX_REMOTE_IMAGE_BYTES);
  } catch {
    return null;
  }

  if (bytes === null || bytes.byteLength === 0) return null;

  const result = await uploadFile(
    new File([bytes], "remote-image", { type: "application/octet-stream" }),
    STORAGE_PREFIXES.MEDIA,
    { validation: IMAGE_VALIDATION, folder },
  );
  return result.success ? result.url : null;
}
