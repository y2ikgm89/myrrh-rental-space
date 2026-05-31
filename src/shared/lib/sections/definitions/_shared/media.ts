/**
 * 共通メディア（画像 / 動画）配列 factory
 *
 * Hero 系 section の背景メディア SSoT。画像 / 動画どちらも受け付ける
 * `{ url, alt, caption }` を **複数登録**できる配列フィールドを返す。
 * 1 件なら単一背景（動画は loop / 画像は静止）、複数件なら
 * `HeroBackgroundSlideshow` が自動スライドショー描画する。
 *
 * 公開側は各 item の `detectMediaSourceType(url)` で runtime に image / video を
 * 派生し、`<Image>` / `<VideoPlayer>` を出し分ける。
 *
 * 2026-05-31 PR: 単一 group (`createMediaGroupSchema`) からクリーンブレイクで配列化。
 * 旧形式 `{ url, alt, caption }` の既存 DB データは
 * `scripts/migrate-hero-background-media-to-array.ts` で配列へ一括変換する
 * （コードに互換シムは残さない）。
 *
 * `createImageGroupSchema` (image 単独・単一) との使い分け:
 * - `createMediaArraySchema`: hero 系（背景に動画も許容 + スライドショー）
 * - `createImageGroupSchema`: editorial / content section（静止画固定の場面）
 */

import { field } from "../../field-registry";

/** 背景スライドショーのトランジション種別 SSoT（全面背景 hero 用、画像のみ ken-burns 有効） */
export const HERO_BG_TRANSITIONS = ["crossfade", "ken-burns"] as const;
export type HeroBgTransition = (typeof HERO_BG_TRANSITIONS)[number];

/** 背景メディア配列の最大件数（運用上の上限） */
export const HERO_BG_MEDIA_MAX = 12;

export function createMediaArraySchema(label = "背景メディア（画像 / 動画）") {
  return field.array(label, {
    subGroup: "media",
    max: HERO_BG_MEDIA_MAX,
    helpText:
      "画像 (JPEG/PNG/WebP/GIF) または動画 (R2 mp4 / YouTube / Vimeo URL)。複数登録するとスライドショーになります",
    fields: {
      url: field.media("メディア", {
        accept: "image-or-video",
      }),
      alt: field.text("代替テキスト（a11y / SEO）", {
        maxLength: 200,
        helpText: "画像が読み込めない場合や読み上げ時に使用",
      }),
      caption: field.text("キャプション（任意）", {
        maxLength: 300,
        helpText: "画像下部やオーバーレイ内に表示する説明文",
      }),
    },
  });
}
