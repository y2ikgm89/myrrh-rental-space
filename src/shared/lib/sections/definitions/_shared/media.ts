/**
 * 共通メディア（画像 / 動画）グループ factory
 *
 * Hero 系 section の単一メディアフィールド SSoT。画像 / 動画どちらも受け付ける
 * `url` + `alt` + `caption` group を返す（業界 reference: WordPress Cover Block の
 * `mediaUrl` + `mediaType` discriminator / Sanity Studio の `_type` polymorphic /
 * Contentful Media field の `contentType` MIME 派生）。
 *
 * 公開側は `detectMediaSourceType(media.url)` で runtime に image / video を派生し、
 * `<Image>` / `<VideoPlayer>` を出し分ける。alt は image 描画時の必須属性、video 描画
 * 時は `aria-label` 相当として使う。caption は両者で表示する任意の説明文。
 *
 * `createImageGroupSchema` (image 単独) との使い分け:
 * - `createMediaGroupSchema`: hero 系（背景に動画も許容する場面）
 * - `createImageGroupSchema`: editorial / content section（静止画固定の場面）
 */

import { z } from "zod";

import { field, fieldRegistry } from "../../field-registry";

export function createMediaGroupSchema(label = "メディア") {
  return z
    .object({
      url: field.media("メディア URL", {
        accept: "image-or-video",
        helpText:
          "画像 (JPEG/PNG/WebP/GIF) または動画 (R2 mp4 / YouTube / Vimeo URL)",
      }),
      alt: field.text("代替テキスト（a11y / SEO）", {
        maxLength: 200,
        helpText: "画像が読み込めない場合や読み上げ時に使用",
      }),
      caption: field.text("キャプション（任意）", {
        maxLength: 300,
        helpText: "画像下部やオーバーレイ内に表示する説明文",
      }),
    })
    .prefault({})
    .register(fieldRegistry, {
      fieldType: "group",
      label,
      group: "content",
      subGroup: "media",
    });
}
