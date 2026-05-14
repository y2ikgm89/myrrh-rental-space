/**
 * LoginHero — login route (page + loading) の共有ヒーロー SSoT
 *
 * 他システムページ (faq / contact 等) と canonical 一致させる:
 * `hero` section type + `variant: "minimal"` → StandardHeroSection minimal variant。
 * 両端 gold-line eyebrow (`SectionLabel`) + 中央寄せ Container + `text-page-hero` h1
 * + solid bg-background + border-b border-border separation + SplitText animation。
 *
 * PortableTextSpan の `_key` (`crypto.randomUUID()`) は module init で 1 回だけ評価される。
 * SC render body で `createSpan()` を呼ぶと PPR (`cacheComponents: true`) で
 * `Route "..." used crypto.randomUUID() before accessing uncached data` エラー。
 * `editorialSplitHeroDefaults` と同じ canonical pattern。
 */

import type { ReactElement } from "react";
import { StandardHeroSection } from "../../_components/StandardHeroSection";
import { getHeroConfig } from "@/shared/lib/validations/section-defaults";
import { DEFAULT_SECTION_STYLE } from "@/shared/domain/section-styles/types";
import { createSpan } from "@/shared/lib/portable-text";

const LOGIN_HERO_CONFIG = getHeroConfig({
  sectionLabel: "Sign in",
  title: [createSpan("ログイン")],
  variant: "minimal",
});

export function LoginHero(): ReactElement {
  return (
    <StandardHeroSection
      config={LOGIN_HERO_CONFIG}
      style={DEFAULT_SECTION_STYLE}
    />
  );
}
