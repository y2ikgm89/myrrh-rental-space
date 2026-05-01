// src/shared/lib/sections/definitions/_shared/layout.ts
//
// セクション横断の共通レイアウト・表示制御 schema factory。
//
// 全 23 sections に `layout: sectionLayoutSchema` として注入され、
// AutoSectionForm の Accordion 「デザイン」グループ内に統一表示される。
// 公開側は SectionWrapper が config.layout を読み取り、
// 上下余白 / コンテナ幅 / モバイル/デスクトップ非表示 / 入場アニメーションを統一適用する。

import type { z } from "zod";
import { field } from "../../field-registry";

export const LAYOUT_PADDING_VALUES = ["none", "sm", "md", "lg", "xl"] as const;
export const LAYOUT_CONTAINER_WIDTH_VALUES = [
  "sm",
  "md",
  "lg",
  "xl",
  "full",
] as const;
export const LAYOUT_ANIMATE_VALUES = [
  "none",
  "fade-up",
  "fade",
  "scale",
] as const;

export type LayoutPadding = (typeof LAYOUT_PADDING_VALUES)[number];
export type LayoutContainerWidth =
  (typeof LAYOUT_CONTAINER_WIDTH_VALUES)[number];
export type LayoutAnimate = (typeof LAYOUT_ANIMATE_VALUES)[number];

/** Section 共通の layout / visibility 設定 group */
export const sectionLayoutSchema = field.group(
  "レイアウト・表示制御",
  {
    padding: field.select("上下余白", {
      options: LAYOUT_PADDING_VALUES,
      default: "md",
      helpText: "セクション上下のスペース",
    }),
    containerWidth: field.select("コンテナ幅", {
      options: LAYOUT_CONTAINER_WIDTH_VALUES,
      default: "lg",
      helpText: "コンテンツの最大幅",
    }),
    hideOnMobile: field.boolean("モバイルで非表示", {
      default: false,
      helpText: "768px 未満で非表示",
    }),
    hideOnDesktop: field.boolean("デスクトップで非表示", {
      default: false,
      helpText: "768px 以上で非表示",
    }),
    animateOnScroll: field.select("入場アニメーション", {
      options: LAYOUT_ANIMATE_VALUES,
      default: "fade-up",
      helpText: "スクロール時の表示演出",
    }),
  },
  { group: "design" },
);

export type SectionLayoutConfig = z.infer<typeof sectionLayoutSchema>;
