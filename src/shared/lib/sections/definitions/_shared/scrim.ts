/**
 * 共通スクリム（背景メディア上の readability overlay）factory
 *
 * テキストを画像に重ねる hero 系（`hero` / `page-hero` media variant）の SSoT。
 * `scrimTone` が「スクリム色 + 文字色 + ハロー色」を一意に決めるため、編集者が
 * 壊れた組み合わせ（明スクリム + 明文字 等）を作れない。レンダリング側は
 * `@/public/components/page-hero/hero-scrim` の `HeroScrim` / `getHeroTextClasses`
 * が tone から派生する。
 *
 * `_shared/media.ts` の `HERO_BG_TRANSITIONS` と同じ「`as const` 配列 + factory」
 * 自己完結パターン。`section-options.ts` / `section-parsers.ts` には登録しない。
 */

import { field } from "../../field-registry";

/** スクリムのトーン SSoT（dark=暗スクリム+明文字 / light=明スクリム+暗文字） */
export const SCRIM_TONES = ["dark", "light"] as const;
export type ScrimTone = (typeof SCRIM_TONES)[number];

/** hero 系の背景スクリム共通フィールド（spread して各 schema に注入） */
export function createScrimFields() {
  return {
    scrimTone: field.select("オーバーレイのトーン", {
      options: SCRIM_TONES,
      default: "dark",
      group: "design",
      helpText:
        "dark=暗いスクリム+明るい文字 / light=明るいスクリム+暗い文字。背景に合わせて選ぶ",
    }),
    scrimOpacity: field.number("オーバーレイの濃さ", {
      min: 0,
      max: 100,
      default: 40,
      suffix: "%",
      group: "design",
      helpText: "0% でスクリムなし（文字の縁取り・影は維持されます）",
    }),
  };
}
