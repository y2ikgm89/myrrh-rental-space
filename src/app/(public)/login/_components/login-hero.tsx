/**
 * LoginHero — login route (page + loading) の共有ヒーロー SSoT
 *
 * 他システムページ (faq / contact 等) と canonical 一致させる:
 * `hero` section type + `variant: "minimal"` → StandardHeroSection minimal variant。
 * 両端 gold-line eyebrow (`SectionLabel`) + 中央寄せ Container + `text-page-hero` h1
 * + solid bg-background + border-b border-border separation + SplitText animation。
 *
 * 設計上の重要事項 (CSP nonce gap 構造予防 + PPR landmine 回避):
 * - title は `PortableTextSpan[]` を要求するが、`createSpan()` factory は
 *   `crypto.randomUUID()` を介して span を生成する。これを module-init 時に呼ぶと
 *   PPR (`cacheComponents: true`) で `Route "..." used crypto.randomUUID() before
 *   accessing uncached data` エラーになる。
 * - そのため /login は plain text ラベルしか持たないことを利用して、module-init 時に
 *   固定 `_key` の span オブジェクトリテラルを 1 つだけ宣言し `createSpan()` を呼ばない。
 *   固定 `_key` でも /login 頁内で複数 LoginHero を render しないため key 衝突なし。
 * - 加えて `@/shared/lib/portable-text` barrel から値を引かず type-only import に
 *   限定する。これにより /login の client subtree が portable-text のいかなる value 経路
 *   (factory / text helper) も持たなくなる。barrel 自体も schema 値 re-export を除去済
 *   (`src/shared/lib/portable-text/index.ts` 参照) なので、StandardHeroSection 経由で
 *   混入していた Zod schema chunk が strict-dynamic CSP 下で nonce-less な Flight
 *   top-level <script> として CSP ブロックされる問題が **根本解消**する。
 */

import type { ReactElement } from "react";
import { StandardHeroSection } from "../../_components/StandardHeroSection";
import { getHeroConfig } from "@/shared/lib/validations/section-defaults";
import { DEFAULT_SECTION_STYLE } from "@/shared/domain/section-styles/types";
import type { PortableTextSpan } from "@/shared/lib/portable-text";

// 固定 `_key` (UUID 生成回避 = PPR `cacheComponents` 制約)。/login の hero title は
// plain span 1 件固定。React reconciliation は span 1 件なので key 衝突なし。
const LOGIN_TITLE_SPANS: readonly PortableTextSpan[] = [
  {
    _key: "login-hero-title",
    _type: "span",
    text: "ログイン",
  },
];

const LOGIN_HERO_CONFIG = getHeroConfig({
  sectionLabel: "Sign in",
  title: [...LOGIN_TITLE_SPANS],
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
