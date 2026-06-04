/**
 * page-hero セクションのデフォルト config
 *
 * seed.ts / migration の COALESCE / 未設定時のフォールバック値として使用。
 */

import { createBlock, createSpan } from "@/shared/lib/portable-text";
import type { PageHeroConfig } from "./schema";

export const DEFAULT_PAGE_HERO = {
  variant: "editorial-split",
  label: [createSpan("Volume One — Spring 2026")],
  title: [createSpan("Where silence works.")],
  description: [
    createBlock([
      createSpan(
        "静けさが仕事をする場所。Myrrh は光と余白を大切にした、思考のためのレンタルスペースです。",
      ),
    ]),
  ],
  images: [
    {
      url: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80",
      alt: "自然光が差し込む開放的なレンタルスペース",
    },
    {
      url: "https://images.unsplash.com/photo-1462826303086-329426d1aef5?w=1200&q=80",
      alt: "木の温もりを感じるミーティングルーム",
    },
    {
      url: "https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=1200&q=80",
      alt: "モダンなデザインのコワーキングスペース",
    },
  ],
  transition: "crossfade",
  buttons: [
    {
      label: [createSpan("Reserve a space")],
      url: "/reservation",
      variant: "primary",
      size: "lg",
      openInNewTab: false,
      backgroundColor: "",
      textColor: "",
    },
    {
      label: [createSpan("View spaces")],
      url: "/spaces",
      variant: "secondary",
      size: "lg",
      openInNewTab: false,
      backgroundColor: "",
      textColor: "",
    },
  ],
  layout: {
    padding: "md",
    containerWidth: "lg",
    hideOnMobile: false,
    hideOnDesktop: false,
    animateOnScroll: "fade-up",
  },
} satisfies PageHeroConfig;
