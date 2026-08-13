/**
 * お問い合わせ添付の受け入れ条件 SSoT（client-safe）。
 *
 * 3 つの層が同じ値を見る必要がある:
 *
 * 1. **client のフォーム** — `accept` 属性と送信前のサイズガード
 * 2. **server の command** — magic-byte 検出後の MIME / サイズ検証（本当の関門）
 * 3. **`next.config.ts`** — Server Action の `bodySizeLimit`
 *
 * 3 が 1・2 より小さいと、**フレームワークが先に弾いて何も起きない**。
 * Server Action の request が reject されるので `MutationResult` は返らず、
 * 呼出側の `isMutationError` にも到達せず、toast も出ない。
 * 実際そうなっていた（既定 1MB に対して PDF は 10MB まで受け付ける建て付け）。
 *
 * MIME 一覧は以前 client（`accept` 文字列）と server（配列）に二重定義されており、
 * 片方だけ足す事故が起こりうる形だった。ここに寄せてある。
 *
 * `server-only` を付けない — client component から import する。
 */

import { MEDIA_MAX_SIZE_BYTES } from "./media-size";
import type { SupportedMediaMimeType } from "./media-magic-bytes";

/**
 * お問い合わせ添付として許可する MIME（inquiry-overhaul completion design §6.4）。
 * 画像 3 種 + PDF のみ。動画・音声・GIF・SVG は非対応（`media-magic-bytes` の
 * 汎用一覧からさらに絞り込む — 添付は「見積書 PDF / 現地写真」用途に限定する）。
 */
export const INQUIRY_ATTACHMENT_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const satisfies readonly SupportedMediaMimeType[];

export type InquiryAttachmentMimeType =
  (typeof INQUIRY_ATTACHMENT_ALLOWED_MIME_TYPES)[number];

/**
 * 許可 MIME 中の最大サイズ（現状は PDF の 10MB）。
 *
 * per-MIME の上限は `MEDIA_MAX_SIZE_BYTES` が canonical で、ここはその最大値。
 * 「PDF は 10MB」と書き写さないのは、片方だけ動いたときに気付けないため。
 */
export const INQUIRY_ATTACHMENT_MAX_SIZE_BYTES = Math.max(
  ...INQUIRY_ATTACHMENT_ALLOWED_MIME_TYPES.map(
    (mime) => MEDIA_MAX_SIZE_BYTES[mime],
  ),
);

/** `<input type="file" accept>` に渡す文字列。 */
export const INQUIRY_ATTACHMENT_ACCEPT =
  INQUIRY_ATTACHMENT_ALLOWED_MIME_TYPES.join(",");

/**
 * Server Action の `bodySizeLimit` に使う値（bytes）。
 *
 * **問い合わせ添付の上限ではなく `MEDIA_MAX_SIZE_BYTES` 全体の最大値**（現状は
 * 動画の 50MB）から導く。Server Action で File を受ける経路は問い合わせ添付だけ
 * ではない — `uploadMedia`（`admin/actions/media.ts`）も Server Action で、
 * MediaUploadDialog / ImageDropPlugin / use-media-upload の 3 箇所から呼ばれる。
 *
 * 同じ機能の Route Handler (`/admin/api/media`) も存在するが **client は GET しか
 * 叩いておらず**、アップロードは Server Action 側を通る。「メディアは Route Handler
 * だからこの上限の対象外」と読むと、動画 50MB / 音声 20MB が無言で 413 になる。
 *
 * multipart/form-data は boundary・part header・他フィールドの分だけ実サイズを
 * 超える。公式ドキュメントは「typical multipart uploads で 10〜20 KB 程度を
 * 見込め」としているので、余裕を持って 64 KB を足す。
 *
 * この値が上限として見えることは無い（client 側が各経路の上限で先に弾き、
 * 超えた分は server が MIME 別上限で弾いて理由付きのエラーを返す）。ここは
 * 「正当なアップロードがフレームワークに無言で落とされない」ための下限。
 */
export const SERVER_ACTION_BODY_SIZE_LIMIT_BYTES =
  Math.max(...Object.values(MEDIA_MAX_SIZE_BYTES)) + 64 * 1024;
