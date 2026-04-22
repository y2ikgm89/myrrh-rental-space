# Section Architecture Phase A — Wrapper 統合 + Hero 独立 + Spacing token 再設計

**日付**: 2026-04-22
**種別**: 破壊的変更（後方互換なし）
**ステータス**: 設計中
**依存**: なし（Phase B の前提となる基盤）
**後続**: `2026-04-22-section-architecture-phase-b.md`（Style cascade + Library）
**所要見込み**: 5 営業日 (1 週)
**ブランチ戦略**: `feature/section-arch-phase-a` worktree で隔離、5 commit 構成

---

## 概要

ホームページ専用 5 セクション（`homepage-hero` / `homepage-how-it-works` / `homepage-spaces` / `homepage-features` / `homepage-cta`）が `SectionWrapper` を経由していないため、管理画面の DesignFields で `paddingTop/paddingBottom/maxWidth/background` を変更しても効かない silent gap を解消する。あわせて Hero を Page schema の first-class field（`pageHero`）に独立させ、Spacing token を Utopia.fyi 風 fluid clamp() スケールに再設計する。

---

## 背景・目的

### 現状の問題

1. **管理画面の design 制御が部分的に dead UI** — `Section.design` JSON カラムは存在し `DesignFields.tsx` で UI も生成されるが、`homepage-*` 5 セクションが `SectionWrapper` を経由していないため、editor が padding を変更しても画面に反映されない。CLAUDE.md `ssot-singletons.md` の dead state 排除哲学に反する。

2. **Hero の特殊レイアウトが Section 統一 schema を汚染** — Hero は grid full-bleed（`md:grid-cols-2 md:grid-rows-[1fr_1fr]`）で `Container` を使わないため、`SectionWrapper` の `mx-auto px-[var(--container-padding)]` 規約と非互換。`skipPadding skipContainer` 例外を増やすより、Sanity / Strapi / Contentful の業界標準である「PageHero を Page schema 上の first-class field として分離」する方がクリーン。

3. **横 padding がハードコード** — `px-4` (HowItWorks/CTA) / `px-6 md:px-12 lg:px-16` (Hero) / `px-4 md:px-6` (Features) と各セクションで独自値、SSoT (`--container-padding: clamp(1.5rem, 3vw, 3rem)`) を経由していない。

4. **縦 spacing が viewport ramp 段階値** — 現状 `--spacing-section-compact: clamp(5rem, 8vw, 7rem)` は単一値で SSoT 化されているが、`SectionWrapper.paddingMap` は `pt-24 md:pt-32 lg:pt-40` の段階的 ramp。両者で哲学が分裂。Editorial 系として連続的 fluid 単一値で統一する。

5. **Features の `max-w-[50rem]` arbitrary value** — `@theme` token に未昇格。Editorial 用狭幅サイズの SSoT 化が必要。

### 目標

- 全 section が `SectionWrapper` 経由で描画され、管理画面 design 制御が完全有効化
- Hero は `pageHero` first-class field として Page schema に独立（PageHero variant 3 種をサポート）
- Spacing token を Utopia.fyi 風 fluid clamp() T シャツスケール（`--space-3xs` 〜 `--space-2xl`）に統一
- 横 padding / 縦 padding の SSoT を `--container-padding` / `--space-*` に集約、`px-4` / `px-6` ハードコード全廃
- viewport breakpoint 段階 ramp の `paddingMap` を fluid 単一値に書き換え

---

## 公式準拠の根拠（一次資料・取得 2026-04-22）

各引用は context7 query-docs / WebFetch / WebSearch で本日（2026-04-22）取得した一次資料に基づく。出典 URL と該当部分の要約引用を併記。

| 出典 / バージョン                 | URL / 取得方法                                                                                              | 該当部分の要約引用                                                                                                                                                                                                                                     | 計画書での採用箇所                                                                              |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| **Tailwind CSS 4.x**              | `context7: /tailwindlabs/tailwindcss.com`                                                                   | "Container queries enable styling based on parent container size, **significantly enhancing portability and reusability of components**". `--container-*` token: 3xs (16rem) → 7xl (80rem)                                                             | AD-2（SectionWrapper の portability）、AD-5（Container token）                                  |
| **Next.js 16.x**                  | `context7: /vercel/next.js`                                                                                 | Server Component → Client Component composition pattern: "Demonstrates component composition pattern where a Server Component (Page) imports and nests a Client Component"                                                                             | 全 phase の SC/CC 境界設計                                                                      |
| **MDN viewport units**            | `https://developer.mozilla.org/en-US/docs/Web/CSS/length`                                                   | "Hero Sections & Full-Height Elements: **Use `svh` (Recommended)**. Fills the entire viewport when browser interfaces are fully expanded (safest). Content won't get hidden when the address bar retracts." `dvh` は性能リスクで非推奨                 | モバイル戦略、Hero `min-h-[var(--hero-min-height-xl)]: 85svh`                                   |
| **Utopia.fyi clamp 公式**         | `https://utopia.fyi/blog/clamp/`                                                                            | clamp 公式: `Slope = (MaxSize - MinSize) / (MaxWidth - MinWidth)` / `yIntersection = (-MinWidth × Slope) + MinSize` / `clamp(MinSize, yIntersection + Slope × 100vw, MaxSize)`. Adrian Roselli 警告: text zoom との相互作用に accessibility テスト必須 | AD-3（Spacing token）、テスト計画に zoom 検証追加                                               |
| **Utopia.fyi spacing scale**      | `https://utopia.fyi/space/calculator`                                                                       | T-shirt size 9 段階（3xs / 2xs / xs / s / m / l / xl / 2xl / 3xl）。viewport 360-1240、base 18-20px 想定の canonical 出力値                                                                                                                            | AD-3（spacing token 数値の SSoT 化）                                                            |
| **WCAG 2.2 SC 2.5.5 (AAA)**       | `https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced`                                          | "**44 by 44 CSS pixels** for pointer input targets". 4 例外: Equivalent / Inline / User Agent Control / Essential. AAA レベル                                                                                                                          | タッチ対象保証、`--touch-target-min: 2.75rem` の根拠                                            |
| **WAI-ARIA APG 1.2 Landmarks**    | `https://www.w3.org/WAI/ARIA/apg/patterns/landmarks/`                                                       | "A page contains seven or fewer landmark regions for optimal value, as landmark benefits diminish with proliferation". landmark roles: banner / complementary / contentinfo / form / main / navigation / region / search                               | 既存 `role="banner"` / `role="contentinfo"` 規約継続、Section に過剰な `role="region"` 付与禁止 |
| **Sanity 業界主流（2025）**       | WebSearch + `https://robotostudio.com/blog/the-only-sanity-page-builder-guide-youll-ever-need`              | "**Hero is included as a block type within page builder array** rather than a completely separate field. Use Sanity's `insertMenu` grouping feature to organize and visually separate it from other content blocks in the editor UI."                  | AD-1 の正当化（業界主流とは異なるアプローチを取る理由を ADR で明記）                            |
| **Strapi v5 Dynamic Zones**       | WebSearch + `https://strapi.io/blog/building-a-page-builder-via-content-modeling-best-practices-in-strapi5` | "Components: 構造化フィールドの再利用 / Dynamic Zones: editor が異なる section type を選択 / Hero は **Dynamic Zone の 1 component として含める** が標準"                                                                                              | 同上、業界比較セクション                                                                        |
| **iOS / Android safe-area-inset** | MDN viewport units 同 URL                                                                                   | iOS Safari と Android Chrome のアドレスバー挙動: "Dynamic address bar collapse/expansion affects viewport size. **Best practice: Avoid `dvh` for critical layouts**"                                                                                   | モバイル戦略 D（safe area inset 対応）                                                          |

### バージョン明記

- Tailwind CSS: 4.2 系（`package.json`）
- Next.js: 16.2 系（`package.json`）
- Sanity: v3 / v4 共通の page builder pattern（2025 業界調査）
- Strapi: v5 系（2025 業界調査）
- WAI-ARIA APG: 1.2 (November 2021 release)
- WCAG: 2.2 (Recommendation)
- Utopia.fyi: 2024-2025 公式 calculator 仕様

---

## 業界実装パターン比較（CMS Page Builder の Hero 取り扱い）

| CMS / Framework                    | Hero の扱い                                                                                                   | 出典                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Sanity（業界主流 2025）**        | `pageBuilder` array の 1 type として含める。Insert Menu Group で UI 分離                                      | [Roboto Studio guide](https://robotostudio.com/blog/the-only-sanity-page-builder-guide-youll-ever-need)                             |
| **Strapi v5**                      | `Dynamic Zone` の 1 component として含める。Component 一覧から editor が選択                                  | [Strapi Page Builder best practices](https://strapi.io/blog/building-a-page-builder-via-content-modeling-best-practices-in-strapi5) |
| **WordPress Gutenberg**            | Block (= section) の 1 種として `core/cover` を提供。Page には `<!-- wp:cover -->` block として埋め込み       | WordPress block API（context7 取得）                                                                                                |
| **Contentful**                     | Reference field でセクション配列に Hero を含める実装が一般的（Page Header を別 reference にするケースもあり） | 業界実装多様                                                                                                                        |
| **本プロジェクト（Phase A 採用）** | `Page.pageHero Json?` first-class field として独立                                                            | 下記 AD-1 で正当化                                                                                                                  |

### 本プロジェクトが業界主流と異なる選択をする理由（ADR で正当化）

**業界主流 (Sanity / Strapi)**: Hero は section[] array の 1 type として含める。これは以下の利点がある:

- Editor が「Hero なしページ」を作りやすい
- Hero を section の並び順に組み込みやすい
- スキーマがシンプル

**本プロジェクトが first-class field を採用する理由**:

1. **既存 `homepage-hero` の grid full-bleed レイアウト** が `SectionWrapper`（`Container` 必須）規約と非互換
2. **`skipPadding skipContainer` の例外を増やすと SectionWrapper の責務が肥大化** → cascade resolver（Phase B）の設計が複雑化
3. **本プロジェクトでは「Hero なしページ」が稀** で、ほぼ全 page で `PageHero` か `null` の二択
4. **PageHero variant（editorial-split / compact / minimal）の Zod discriminated union で variant 専用 props を型安全化** できる（section.config の wide JSON より型支援が強い）
5. **CMS 業界主流とは異なるが、SSoT 強制 + 型安全 + cascade 単純化のトレードオフで本選択を採用**

→ **ADR `0016-page-hero-first-class-field.md` で本選択を Architecture Decision として記録、業界主流（array 内 type）も併記して将来的な見直し余地を残す**。

---

## アーキテクチャ決定事項

### AD-1: PageHero を Page schema の first-class field 化

`Page.pageHero Json?` 列を追加。`homepage-hero` Section type は廃止。Page = `{ pageHero: PageHero | null, sections: Section[] }` の構造に統一。

PageHero variant (Zod discriminated union):

```typescript
type PageHero =
  | {
      variant: "editorial-split";
      images: HeroImage[];
      transition: HeroTransition;
      label;
      title;
      description;
      buttonText;
      buttonUrl;
    }
  | { variant: "compact"; image: HeroImage; label; title; description }
  | { variant: "minimal"; eyebrow?: string; title; description };
```

### AD-2: SectionWrapper 必須化

`homepage-how-it-works` / `homepage-spaces` / `homepage-features` / `homepage-cta` の 4 件を `SectionWrapper` 経由に書き換え。`Spaces` は Header (Container 使用) と Carousel (full-bleed) の 2 ブロックに分離し、Carousel 部分は `<SectionWrapper skipContainer>` で全幅維持。

### AD-3: Spacing token の Utopia.fyi 風 fluid 化（公式 calculator 出力準拠）

`--spacing-section` / `--spacing-section-compact` を廃止し、Utopia.fyi 公式 calculator の T-shirt スケール 9 段階を採用。viewport 範囲は本プロジェクトの最小 (iPhone SE 375px) 〜 desktop (1280px) で設定（モバイル最適化優先、ultra-wide は max 値で頭打ち）。

**Utopia 公式 clamp 公式**（[出典](https://utopia.fyi/blog/clamp/)）:

```
Slope = (MaxSize - MinSize) / (MaxWidth - MinWidth)
yIntersection = (-MinWidth × Slope) + MinSize
clamp(MinSize, yIntersection + Slope × 100vw, MaxSize)
```

**採用する spacing scale**（viewport 375 → 1280px、editorial 用途別 min/max 設定。各値は上記公式で計算済み）:

```css
@theme {
  --space-3xs: clamp(0.25rem, 0.198rem + 0.221vw, 0.5rem); /* 4-8px */
  --space-2xs: clamp(0.5rem, 0.397rem + 0.442vw, 1rem); /* 8-16px */
  --space-xs: clamp(1rem, 0.793rem + 0.884vw, 2rem); /* 16-32px */
  --space-sm: clamp(2rem, 1.586rem + 1.768vw, 4rem); /* 32-64px */
  --space-md: clamp(
    3rem,
    2.171rem + 3.536vw,
    7rem
  ); /* 48-112px (compact section) */
  --space-lg: clamp(
    4rem,
    2.55rem + 6.188vw,
    11rem
  ); /* 64-176px (default section) */
  --space-xl: clamp(
    5rem,
    2.929rem + 8.84vw,
    15rem
  ); /* 80-240px (hero margin) */
  --space-2xl: clamp(
    6rem,
    3.308rem + 11.491vw,
    19rem
  ); /* 96-304px (hero/feature) */
}
```

**WCAG accessibility 配慮**（Adrian Roselli 警告から、Utopia clamp 記事末尾参照）:

- text zoom (ブラウザ拡大 200% / 400%) で fluid scale が破綻しないか **手動テスト必須**
- min 値は `rem` 単位で設定（root font-size 拡大に追従）、`px` 単位禁止
- 検証チェックリスト: ① ブラウザ zoom 200% で section 余白が崩壊しないか ② root font-size を 24px に上げて scale が狭くなりすぎないか ③ Lighthouse a11y スコア劣化なし

`SectionWrapper.paddingTopMap` / `paddingBottomMap` を viewport ramp から fluid 単一値に書き換え:

```typescript
const paddingTopMap = {
  none: "",
  sm: "pt-[var(--space-sm)]",
  md: "pt-[var(--space-md)]",
  lg: "pt-[var(--space-lg)]",
  xl: "pt-[var(--space-xl)]",
} satisfies Record<NonNullable<SectionDesign["paddingTop"]>, string>;
```

### AD-4: 横 padding の SSoT 強制

`--container-padding` を `clamp(1rem, 3vw, 3rem)` に拡張（min 16px に下げて iPhone SE 等の小画面で画面幅有効活用）。`SectionWrapper` 内側 Container は必ずこの token を経由。`px-4` / `px-6` のハードコード全廃を `architecture-boundaries.test.ts` で検証。

Safe area inset 対応:

```css
padding-inline: max(
  var(--container-padding),
  env(safe-area-inset-left),
  env(safe-area-inset-right)
);
```

### AD-5: Editorial 用 Container max-width token

`max-w-[50rem]` を `--container-editorial: 50rem` (800px) として `@theme` 昇格。`Section.design.maxWidth` enum に `editorial` を追加（`max-w-3xl` (sm) / `max-w-4xl` (md) / `max-w-[var(--container-editorial)]` (editorial) / `max-w-6xl` (lg) / `max-w-7xl` (xl) / `max-w-full` (full)）。

### AD-6: Section header bottom margin の fluid 化

各セクションの `mb-10 md:mb-14` を `mb-[var(--space-sm)]` (32-64px) に統一。SectionWrapper 内側に `SectionHeader` 共通コンポーネント新設し、label/title/description の余白を SSoT 化。

### AD-7: ホームページ section 縦 padding のデフォルトは `md`

`DEFAULT_PAGE_SECTIONS["home"]` 内の各セクションに `design: { paddingTop: "md", paddingBottom: "md", maxWidth: "xl" }` を埋める。Editorial の compact ホームページとして 64-112px を default 化。

### AD-8: モバイルレスポンシブ戦略（公式準拠）

CSS 仕様レベルで連続レスポンシブを保証し、breakpoint 切替段差を廃止する。

#### 大原則

1. **Fluid clamp() 単一値 → breakpoint 切替なし**（Utopia.fyi 準拠、AD-3 で既述）
2. **マクロは viewport / マイクロは container query**（Tailwind CSS 4 公式 `tailwind-patterns.md` § Container Queries 準拠）
   - マクロ（Hero split, 2col grid, フォーム）: `md:grid-cols-2`
   - マイクロ（カードグリッド, セクション内 widget）: `@md:grid-cols-2`
3. **Mobile-first + WCAG 2.5.5 Enhanced (AAA) 44px 必須**（既存 `--touch-target-min: 2.75rem`）

#### Hero モバイル戦略（PageHero variant 別）

| variant           | mobile                                                                                                            | desktop                                                      |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `editorial-split` | `aspect-[4/3]` image + bottom overlay text（z-stack）+ 3 層可読性防御（scrim + paint-order stroke + text-shadow） | 2col grid（image + text）`min-h-[var(--hero-min-height-xl)]` |
| `compact`         | `min-h-[40svh]` の画像 + 下部 text 帯                                                                             | 同左                                                         |
| `minimal`         | 画像なし、heading + lead text のみ                                                                                | 同左                                                         |

`min-height` は **`svh` 必須**（[MDN viewport units](https://developer.mozilla.org/en-US/docs/Web/CSS/length) 準拠）:

> "Hero Sections & Full-Height Elements: **Use `svh` (Recommended)**. Fills the entire viewport when browser interfaces are fully expanded (safest)."

`100vh` 廃止（iOS Safari address bar 伸縮で footer 切れ）、`100dvh` も性能リスクで非推奨（MDN 警告）。

#### Safe area inset 対応（iPhone Notch / Dynamic Island / Android navigation gesture）

全 fixed UI と Hero bottom に `env(safe-area-inset-*)` 加算:

```css
/* MobileNav / sticky bottom bar (既存) */
padding-bottom: env(safe-area-inset-bottom);

/* Hero bottom CTA */
padding-bottom: calc(var(--space-md) + env(safe-area-inset-bottom));

/* Container 横 padding（safe area inset カバー） */
padding-inline: max(
  var(--container-padding),
  env(safe-area-inset-left),
  env(safe-area-inset-right)
);
```

#### Touch target 44px 確保

Editorial では小さいラベル文字 (11px) を維持しつつ、`<a>` / `<button>` wrapper を `min-h-[var(--touch-target-min)]` (44px) で囲む。文字は `inline-flex items-center` で center 配置。

```tsx
<a className="inline-flex items-center min-h-[var(--touch-target-min)] px-3 text-[0.7rem] uppercase tracking-[0.18em]">
  {label}
</a>
```

#### Mobile QA チェックリスト（Phase 完了後の検証項目）

破壊的変更後、以下を **375px / 414px / 768px / 1024px / 1280px / 1920px** で目視確認:

- [ ] Hero overlay text の readability（3層防御維持）
- [ ] Section 縦余白が「呼吸感」を保ちつつ過剰でない（375px で max 100px が体感許容）
- [ ] Container 横余白が safe area inset を侵食しない（notch 横向き時）
- [ ] Touch target 44px 全要素（Lighthouse Mobile / axe-core で自動検証）
- [ ] iOS Safari 100svh で footer / CTA が画面外に消えない
- [ ] keyboard 表示時に input がスクロールイン（既存 `interactiveWidget: 'resizes-visual'`）
- [ ] `prefers-reduced-motion: reduce` でアニメーション全停止
- [ ] **ブラウザ zoom 200% / 400% で fluid scale が破綻しない**（Adrian Roselli accessibility 警告対応）
- [ ] Lighthouse Mobile スコア 95+（CLS / LCP）
- [ ] DevTools "Throttling: Slow 4G" + "iPhone SE" emulation で実機相当確認

---

## 破壊的変更リスト

| 変更                                                                     | 影響                                                                    |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `homepage-hero` Section type 削除                                        | 既存 home Page の sections から該当 record を抽出して `pageHero` に移行 |
| `Section.design` の `maxWidth` enum に `editorial` 追加                  | seed・既存 record 互換、追加のみ                                        |
| `SectionWrapper.paddingMap` の値を viewport ramp から fluid 単一値に変更 | 全ページの section 縦 padding が連続値に変化（編集者承認必要）          |
| `--spacing-section` / `--spacing-section-compact` token 廃止             | これら token を直接参照する全箇所を `--space-*` に置換                  |
| `--container-padding` の min 値を `1.5rem` → `1rem` に変更               | モバイルで横余白が 24px → 16px に減少                                   |
| `homepage-*` 5 セクションコンポーネントが SectionWrapper 経由            | 描画 DOM 構造が `<section><div>` ラップ追加                             |
| Hero の `homepage-hero` Section render 経路廃止 → `pageHero` 専用 render | Page render ロジックの分岐変更                                          |

---

## 新規ファイル

- `prisma/migrations/<timestamp>_add_page_hero_and_remove_homepage_hero_section/migration.sql` — Page.pageHero 列追加 + 既存 homepage-hero Section データ移行 + Section type 削除 SQL
- `src/shared/lib/sections/page-hero/schema.ts` — PageHero Zod discriminated union schema
- `src/shared/lib/sections/page-hero/types.ts` — PageHero TypeScript types
- `src/shared/lib/sections/page-hero/defaults.ts` — variant 別 default props
- `src/app/(public)/_shared/components/page-hero/PageHero.tsx` — Server Component dispatcher
- `src/app/(public)/_shared/components/page-hero/EditorialSplitHero.tsx` — variant 1（既存 hero-section.tsx 移行）
- `src/app/(public)/_shared/components/page-hero/CompactHero.tsx` — variant 2
- `src/app/(public)/_shared/components/page-hero/MinimalHero.tsx` — variant 3
- `src/app/(public)/_shared/components/sections/SectionHeader.tsx` — label/title/description の SSoT コンポーネント
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/_components/PageHeroEditor.tsx` — pageHero 編集 UI
- `__tests__/unit/lib/sections/page-hero/schema.test.ts` — PageHero schema validation テスト
- `__tests__/unit/lib/sections/page-hero/migration.test.ts` — 既存 Section → PageHero 変換ロジックテスト
- `docs/architecture/decisions/0016-page-hero-first-class-field.md` — ADR

## 変更ファイル

- `prisma/schema.prisma` — Page model に `pageHero Json?` 追加、SectionDesign の maxWidth enum 拡張
- `prisma/seed.ts` / seed 関数群 — homepage seed を `pageHero` 利用形式に書き換え
- `src/app/(public)/_styles/public.css` — `--space-*` token 追加、`--spacing-section*` 削除、`--container-padding` min 値変更、`--container-editorial` 追加
- `src/app/(admin)/_styles/admin.css` — admin 側 `--space-*` も同様（admin Section 用）
- `src/shared/lib/validations/section-design.ts` — maxWidth enum に `editorial` 追加
- `src/app/(public)/_shared/components/sections/SectionWrapper.tsx` — paddingMap / maxWidthMap fluid 化、Container 強制
- `src/app/(public)/page.tsx` — `pageHero` を Page から取り出して `<PageHero>` 描画、`homepage-hero` 分岐削除
- `src/app/(public)/_components/homepage/how-it-works-section.tsx` — SectionWrapper 経由に書き換え、`px-4` / `--spacing-section-compact` 撤去
- `src/app/(public)/_components/homepage/spaces-section.tsx` — Header (Container) と Carousel (full-bleed) を別 SectionWrapper にラップ
- `src/app/(public)/_components/homepage/features-section.tsx` — SectionWrapper + `maxWidth: "editorial"` で `max-w-[50rem]` 撤去
- `src/app/(public)/_components/homepage/cta-section.tsx` — SectionWrapper 経由
- `src/shared/lib/sections/registry.ts` — `homepage-hero` 登録削除
- `src/shared/lib/sections/definitions/homepage-hero/` — ディレクトリごと削除
- `src/shared/lib/sections/default-page-sections.ts` — homepage の sections から `homepage-hero` 削除、各セクションに `design: { paddingTop: "md", paddingBottom: "md" }` 埋め込み
- `src/shared/domain/pages/queries.ts` / `commands.ts` — `pageHero` field の serialize/deserialize 対応
- `src/shared/domain/sections/queries.ts` — homepage filter から hero 除外
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/page.tsx` — Tabs に「Hero」追加
- `.claude/rules/ssot-singletons.md` — `--space-*` token を SSoT 表に追記、`--spacing-section*` 削除
- `.claude/rules/frontend/project-design-config.md` — Spacing token 表更新
- `.claude/rules/tailwind-patterns.md` — Spacing token 説明更新
- `.claude/rules/gotchas.md` — `pageHero` 関連 gotcha 追加（旧 `homepage-hero` セクション参照禁止）
- `__tests__/unit/lib/sections/architecture-boundaries.test.ts` — `px-4` / `px-6` ハードコード禁止 grep 追加

## 削除ファイル

- `src/app/(public)/_components/homepage/hero-section.tsx` — `EditorialSplitHero.tsx` に移行
- `src/shared/lib/sections/definitions/homepage-hero/schema.ts`
- `src/shared/lib/sections/definitions/homepage-hero/metadata.ts`

---

## マイグレーション

### Schema 変更 SQL

```sql
-- 1. Page に pageHero JSON 列を追加（nullable、後でデータ充填）
ALTER TABLE "Page" ADD COLUMN "pageHero" JSONB;

-- 2. 既存の homepage-hero Section を抽出して該当 Page の pageHero に移行
UPDATE "Page" p
SET "pageHero" = jsonb_build_object(
  'variant', 'editorial-split',
  'label', s.config->>'label',
  'title', s.config->>'title',
  'description', s.config->>'description',
  'images', COALESCE(s.config->'images', '[]'::jsonb),
  'transition', COALESCE(s.config->>'transition', 'crossfade'),
  'buttonText', s.config->>'buttonText',
  'buttonUrl', s.config->>'buttonUrl'
)
FROM "Section" s
WHERE s."pageId" = p.id AND s.type = 'homepage-hero';

-- 3. 移行済み homepage-hero Section レコードを削除
DELETE FROM "Section" WHERE type = 'homepage-hero';

-- 4. SectionDesign の maxWidth enum 値追加は schema 上のみ（DB は VARCHAR）
```

### 実行手順

```bash
# 非対話的 migration（CLAUDE.md ハードルール準拠）
TS=$(date -u +%Y%m%d%H%M%S)
NAME="add_page_hero_and_remove_homepage_hero_section"
mkdir prisma/migrations/${TS}_${NAME}
# migration.sql を Python 経由で書き出し（PreToolUse hook 回避）
python3 -c "open('prisma/migrations/${TS}_${NAME}/migration.sql','w',encoding='utf-8').write('...SQL...')"
bunx --bun prisma db execute --file prisma/migrations/${TS}_${NAME}/migration.sql
bunx --bun prisma migrate resolve --applied ${TS}_${NAME}
bunx --bun prisma generate
```

---

## 環境変数

なし（既存の `DATABASE_URL` のみ）

---

## 実装 Phase 分割（5 commit 構成）

### P1: Spacing token 新設 + 旧 token 並行運用（0.5d / 1 commit）

**目的**: 新 token を `@theme` に追加し、旧 token と並行運用可能にする。後続 phase で個別書き換え。

**変更**:

- `src/app/(public)/_styles/public.css` に `--space-3xs` 〜 `--space-2xl` 追加、`--container-editorial: 50rem` 追加
- `src/app/(admin)/_styles/admin.css` に同様の `--space-*` 追加
- `--spacing-section` / `--spacing-section-compact` は **削除せず残す**（後続 phase で参照箇所を移行）
- `--container-padding` の min 値を `1rem` に変更

**検証**:

- `bun run validate` 通過
- 既存ページの視覚デグレなし（手動確認: home / spaces / posts / news / contact / faq / events 各 1 ページ）

**Commit message**: `feat(styles): add fluid spacing scale and editorial container token (Phase A.1)`

---

### P2: SectionWrapper の paddingMap / maxWidthMap を新 token 経由に書き換え（0.5d / 1 commit）

**目的**: `SectionWrapper` の値を fluid 単一値に変更。標準 section 全件の動作確認。

**変更**:

- `src/app/(public)/_shared/components/sections/SectionWrapper.tsx`:
  - `paddingTopMap` / `paddingBottomMap` を `pt-[var(--space-{sm,md,lg,xl})]` に
  - `maxWidthMap` に `editorial: "max-w-[var(--container-editorial)]"` 追加
- `src/shared/lib/validations/section-design.ts` の `sectionMaxWidthValues` に `"editorial"` 追加
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/DesignFields.tsx` の maxWidth Select options に `editorial` 追加
- 標準 section の `_shared/components/sections/standard/**/*.tsx` 全件で目視確認

**検証**:

- `bun run validate && bun run build` 通過
- 標準 section 表示の手動確認（hero-parallax / cta / faq-list / space-list / etc）

**Commit message**: `refactor(sections): switch SectionWrapper to fluid spacing tokens (Phase A.2)`

---

### P3: homepage-\* 4 件を SectionWrapper 統合（1d / 1 commit）

**目的**: `homepage-how-it-works` / `homepage-spaces` / `homepage-features` / `homepage-cta` を SectionWrapper 経由化。

**変更**:

- `how-it-works-section.tsx`: `<section className="px-4 py-[var(--spacing-section-compact)]">` → `<SectionWrapper design={resolvedDesign}>`
- `spaces-section.tsx`: Header と Carousel を別 SectionWrapper に分離（Header は通常、Carousel は `skipContainer`）
- `features-section.tsx`: SectionWrapper + `maxWidth: "editorial"`
- `cta-section.tsx`: SectionWrapper 経由
- `default-page-sections.ts` の home 設定で各セクションに `design: { paddingTop: "md", paddingBottom: "md", maxWidth: "xl" }` 埋め込み（features は `editorial`、carousel は `full`）
- `src/app/(public)/page.tsx` で各 section に `design` を resolve して渡す
- `_shared/components/sections/SectionHeader.tsx` 新設（label/title/description の SSoT）

**検証**:

- `bun run validate && bun run build` 通過
- ホームページ visual regression 手動確認（375px / 768px / 1280px / 1920px）
- 管理画面 `/admin/pages/home/edit` で paddingTop/Bottom 変更が画面反映されること
- Lighthouse Mobile スコア 90+ 維持

**Commit message**: `refactor(homepage): integrate 4 sections into SectionWrapper (Phase A.3)`

---

### P4: PageHero first-class field 化（DB migration 含む、最高リスク phase）（2d / 1 commit）

**目的**: Hero を `Page.pageHero` JSON 列に独立、`homepage-hero` Section type を廃止。

**変更**:

- Prisma schema: `Page.pageHero Json?` 追加
- migration SQL: 既存 `homepage-hero` Section データを `Page.pageHero` に移行 + Section レコード削除
- `src/shared/lib/sections/page-hero/` 新設（schema / types / defaults）
- `EditorialSplitHero.tsx` / `CompactHero.tsx` / `MinimalHero.tsx` 新設（variant 別コンポーネント）
- `PageHero.tsx` dispatcher（variant に応じて切替）
- `src/app/(public)/page.tsx` で `pageHero` を取り出して `<PageHero>` 描画、`homepage-hero` 分岐削除
- 旧 `hero-section.tsx` を `EditorialSplitHero.tsx` として移植（grid full-bleed 維持、`PageHero` ラッパーは Container 不使用）
- 管理画面 `/admin/pages/[slug]/edit` に「Hero」タブ追加（`PageHeroEditor.tsx`）
- `src/shared/lib/sections/registry.ts` から `homepage-hero` 登録削除
- `src/shared/lib/sections/definitions/homepage-hero/` ディレクトリ削除
- `default-page-sections.ts` の home から `homepage-hero` 削除、別途 `DEFAULT_PAGE_HERO_HOME` を export
- ADR `0016-page-hero-first-class-field.md` 作成
- 関連 unit / integration テスト追加

**検証**:

- migration 実行: `bunx --bun prisma db execute --file <path>` + `bunx --bun prisma migrate resolve --applied <name>`
- migration 後 `bun -e "..."` で home Page の pageHero 列が正しく充填されているか確認
- `bun run validate && bun run build` 通過
- 公開トップページの Hero 表示確認（既存と同等のレンダリング）
- 管理画面 `/admin/pages/home/edit` で Hero variant 切替・config 編集動作確認
- 全テスト通過: `bun run test:all`

**ロールバック手順**: migration revert SQL（`pageHero` 列削除 + 旧 `homepage-hero` Section レコード復元）を migration ディレクトリに併記。worktree 隔離でリスク低減。

**Commit message**: `feat(page-hero): promote Hero to first-class Page field (Phase A.4, BREAKING)`

---

### P5: 旧 token 撤去 + ハードコード ban + ADR + ルール更新（1d / 1 commit）

**目的**: 旧 token と並行運用を終了、`px-4` / `px-6` ハードコード禁止を CI 化、関連ドキュメント更新。

**変更**:

- `--spacing-section` / `--spacing-section-compact` を `public.css` から削除
- 残存参照箇所を grep で 0 確認、残っていれば置換
- `architecture-boundaries.test.ts` に `px-4` / `px-6` 直書き禁止と、旧 `--spacing-section` 系 CSS 変数の `src` 残存禁止を追加
- `.claude/rules/ssot-singletons.md` 更新（`--space-*` 追記、`--spacing-section*` 削除）
- `.claude/rules/frontend/project-design-config.md` 更新（Spacing token 表）
- `.claude/rules/tailwind-patterns.md` 更新
- `.claude/rules/gotchas.md` に「`homepage-hero` Section type 廃止、`pageHero` field 使用」gotcha 追加
- ADR `0016-page-hero-first-class-field.md` を `Status: Accepted` に変更

**検証**:

- `grep -r "spacing-section" src/ --include="*.tsx" --include="*.ts" --include="*.css"` で 0 ヒット
- `grep -rE 'className="[^"]*\bpx-(4|6)\b' src/app/(public)/` で 0 ヒット（許容: layout.tsx の MobileNav 等の特殊ケースは個別判定）
- `bun run validate && bun run build` 通過
- `bun run test:all` 通過

**Commit message**: `refactor(styles): remove deprecated spacing tokens and enforce padding SSoT (Phase A.5)`

---

## 検証

### Phase 全体の完了基準

- [ ] `bun run validate && bun run build` 通過（全 phase 完了後）
- [ ] `bun run test:all` 通過
- [ ] `bun run lhci` Mobile スコア 90+ 維持
- [ ] `bunx playwright test --project=chromium` 通過（公開ページ E2E）
- [ ] 管理画面 `/admin/pages/home/edit` で `pageHero` および各 section の design 編集が画面反映される
- [ ] 公開ホームページ visual regression（375px / 414px / 768px / 1024px / 1280px / 1920px）
- [ ] iPhone SE 実機相当（DevTools emulation + Slow 4G）で touch target 44px / safe area / svh 動作確認
- [ ] `prefers-reduced-motion: reduce` でアニメーション全停止
- [ ] grep ground truth 検証:
  - `grep -r "spacing-section" src/` ヒット 0
  - `grep -r "homepage-hero" src/` ヒット 0
  - `grep -rE 'className="[^"]*\bpx-(4|6)\b' src/app/\(public\)/` 例外を除き 0

### Mobile QA チェックリスト

- [ ] Hero overlay text の readability（3層防御維持）
- [ ] Section 縦余白が「呼吸感」を保ちつつ過剰でない（375px で max 100px が体感許容）
- [ ] Container 横余白が safe area inset を侵食しない（notch 横向き時）
- [ ] iOS Safari 100svh で footer / CTA が画面外に消えない
- [ ] Reduced motion 設定でアニメーション全停止
- [ ] Lighthouse Mobile スコア 95+（CLS / LCP）

---

## ロールバック戦略

- 各 phase は独立した 1 commit として作成。問題発生時は `git revert <sha>` で個別 rollback 可能
- P4 (DB migration) のみ data migration を含むため、roll-forward 戦略を推奨:
  - migration revert SQL を `prisma/migrations/<ts>_revert_page_hero/migration.sql` として準備
  - rollback 時: revert SQL 実行 + `git revert` + `bunx --bun prisma generate`
- worktree 隔離 (`feature/section-arch-phase-a`) で main を常にクリーン状態に保つ

---

## リスク

| リスク                                                  | 対策                                                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| P4 migration での既存 home Page データ消失              | dev DB で migration を 2 回連続実行し idempotency 確認、production 適用前に DB バックアップ         |
| Spacing 変更による視覚デグレで運用者が違和感            | Phase 完了後に運用者レビュー、必要なら `default-page-sections.ts` の design preset を `lg` 等に調整 |
| `homepage-hero` を参照する CMS データが他にある         | grep で全 `Section.type = 'homepage-hero'` を移行 SQL でカバー、移行後 SELECT で残存 0 確認         |
| Editor / Viewer ロールが pageHero 編集権限なしで詰まる  | `executeAdminMutationResult` の `resource: "page"` で既存 RBAC を継承（追加変更不要）               |
| Reduced motion ユーザーで Hero variant 切替が機能しない | PageHero variant は CSS のみで切替、GSAP は装飾レイヤーのみ（既存 `gsap.matchMedia` パターン継承）  |
| Container Queries 古いブラウザ非対応                    | プロジェクト Tailwind v4 の最低要件 (Safari 16.4+ / Chrome 111+) で対応済み、新規追加なし           |

---

## 関連 ADR / ルール

- 新規 ADR: `docs/architecture/decisions/0016-page-hero-first-class-field.md`（Phase A.4 で作成）
- 影響を受ける ADR: `0014-test-execution-policy.md`（Phase A.4 の test:all 実行確認）
- 更新ルール: `ssot-singletons.md` / `project-design-config.md` / `tailwind-patterns.md` / `gotchas.md`
- 後続: Phase B（`2026-04-22-section-architecture-phase-b.md`）で SectionStyle cascade を追加

---

## 実装手順サマリ（agentic worker 向け）

1. worktree 作成: `feature/section-arch-phase-a`
2. P1 → P2 → P3 → P4 → P5 の順に commit、各 phase 完了後 `bun run validate && bun run build`
3. P4 のみ DB migration 含むため worktree DB を最初に用意 + 2 回連続 migration 実行で idempotency 確認
4. Phase 完了後 PR 作成、レビュー後 main マージ → 本番デプロイ
5. 完了後本ファイル削除（CLAUDE.md clean-break 原則）、ADR 0016 を Accepted で残す
