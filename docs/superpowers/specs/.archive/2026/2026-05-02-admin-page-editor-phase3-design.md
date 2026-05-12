# Admin Page Editor Phase 3 — Section Layout & Visibility (Clean Break)

> 対象: 全セクション共通の layout / visibility 設定の標準化
> 作成: 2026-05-02
> ステータス: Draft（ユーザー承認待ち）
> 依存: Phase 1 (`9e96ebd2`) + Phase 2 (`98deee61`) 完了

## 背景・動機

Phase 1/2 で構造刷新（master-detail UI、page-hero 統合、ボタン統一、画像メタ構造化、動的 select）は完了したが、**セクション横断のレイアウト・表示制御** は不揃い:

1. **レイアウト設定がセクションごとにバラバラ**:
   - `custom` / `embed` / `faq-list` のみ `padding` フィールドあり
   - `custom` / `embed` のみ `maxWidth` フィールドあり
   - 他 18 sections (cta / hero / concept / space-list / etc) は **padding/maxWidth 制御なし** → 公開ページで余白調整不可
   - 各セクションが独自に padding を hardcode して描画

2. **visibility 制御不在**:
   - 「モバイルのみ非表示」「デスクトップのみ非表示」が UI から指定不可
   - DB の `Section.isActive` は all-or-nothing、レスポンシブ表示制御なし

3. **アニメーション制御不在**:
   - スクロール時の入場アニメーション on/off を section ごとに制御不可
   - 現状は公開 renderer 側でハードコード

## 方針: Clean Break（後方互換なし）

ユーザー指示: 破壊的変更可・公式準拠・後方互換性なし・推奨実装。

これに従い、以下を **同一 PR で一括実施**:

1. **共通 `layout` group field を全 23 sections に統一注入**: `padding / containerWidth / hideOnMobile / hideOnDesktop / animateOnScroll`
2. **既存の per-section `padding` / `maxWidth` フィールドを削除**（共通 layout に吸収）
3. **データ migration**: 既存 `config.padding` / `config.maxWidth` を `config.layout.padding` / `config.layout.containerWidth` に転送
4. **公開側 SectionRenderer で layout config を統一適用** — 各 section component に padding/containerWidth/visibility を流し込む wrapper パターン
5. **`section-options.ts` の `paddingValues` / `maxWidthValues` を `layoutPaddingValues` / `layoutContainerWidthValues` に rename + scope cleanup**

## ゴール

- 全 23 sections で **「上下余白 / コンテナ幅 / モバイル非表示 / デスクトップ非表示 / 入場アニメ」** が UI から編集可能
- 公開ページで **どのセクションも同一の layout 制御契約**で描画される
- per-section の独自 padding/maxWidth フィールドは消滅、SSoT 統一

---

## 設計詳細

### 1. 共通 `layout` group factory

新規ファイル `src/shared/lib/sections/definitions/_shared/layout.ts`:

```typescript
import { z } from "zod";
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
```

`group: "design"` で AutoSectionForm の Accordion 「デザイン」内に表示。

### 2. 全 23 sections への注入

各 section schema に `layout: sectionLayoutSchema` を追加:

```typescript
// 例: cta/schema.ts
export const ctaConfigSchema = z.object({
  sectionLabel: field.text(...),
  title: field.text(...),
  description: field.textarea(...),
  buttons: createButtonsArraySchema(),
  backgroundColor: field.color("背景色", { group: "design" }),
  variant: field.select("レイアウトの種類", { ... }),
  layout: sectionLayoutSchema,  // ← 追加
});
```

### 3. 既存 per-section フィールド削除

| Section    | 削除対象              | 移行先                                    |
| ---------- | --------------------- | ----------------------------------------- |
| `custom`   | `padding`, `maxWidth` | `layout.padding`, `layout.containerWidth` |
| `embed`    | `maxWidth`            | `layout.containerWidth`                   |
| `faq-list` | `containerWidth`      | `layout.containerWidth`                   |

**残す per-section フィールド**:

- `cta.variant` (default/centered/split — レイアウトの種類でなく構造的バリアント)
- `concept.layout` (side-by-side/stacked — 内部レイアウト)
- `features.layout` (hero-first/equal-grid/icon-left — 内部レイアウト)
- `gallery.layout` (grid/masonry — 内部レイアウト)
- `hero.height` / `hero-parallax.height` (svh ベース、layout.padding と直交)

→ **共通 layout は「外側」、per-section layout は「内側」** という責務分離。

### 4. データ migration（destructive Section.config JSON）

`prisma/migrations/<TS>_section_layout_unification/migration.sql`:

```sql
-- custom: padding / maxWidth を layout group に移行
UPDATE sections SET config = jsonb_set(
  config - 'padding' - 'maxWidth',
  '{layout}',
  jsonb_build_object(
    'padding', COALESCE(config->>'padding', 'md'),
    'containerWidth', COALESCE(config->>'maxWidth', 'lg'),
    'hideOnMobile', false,
    'hideOnDesktop', false,
    'animateOnScroll', 'fade-up'
  )
) WHERE type = 'custom' AND (config ? 'padding' OR config ? 'maxWidth');

-- embed: maxWidth を layout に移行
UPDATE sections SET config = jsonb_set(
  config - 'maxWidth',
  '{layout}',
  jsonb_build_object(
    'padding', 'md',
    'containerWidth', COALESCE(config->>'maxWidth', 'lg'),
    'hideOnMobile', false,
    'hideOnDesktop', false,
    'animateOnScroll', 'fade-up'
  )
) WHERE type = 'embed' AND config ? 'maxWidth';

-- faq-list: containerWidth を layout に移行
UPDATE sections SET config = jsonb_set(
  config - 'containerWidth',
  '{layout}',
  jsonb_build_object(
    'padding', 'md',
    'containerWidth', COALESCE(config->>'containerWidth', 'lg'),
    'hideOnMobile', false,
    'hideOnDesktop', false,
    'animateOnScroll', 'fade-up'
  )
) WHERE type = 'faq-list' AND config ? 'containerWidth';

-- 上記 3 type 以外の全セクション: layout group が無ければ default で挿入
-- （registry の .default() で safeParse 時に補完されるため migration では不要だが、
--  hot pages の DB explorer で UI 表示する際の見栄えのため明示的に追加してもよい）
-- → migration では skip（safeParse の default 補完に任せる）
```

### 5. 公開側 SectionRenderer の layout 統一適用

`src/app/(public)/_components/sections/SectionWrapper.tsx`（or 既存 wrapper）:

```tsx
import { cn } from "@/shared/lib/cn";
import type { SectionLayoutConfig } from "@/shared/lib/sections/definitions/_shared/layout";

const PADDING_CLASSES: Record<LayoutPadding, string> = {
  none: "py-0",
  sm: "py-[var(--space-sm)]",
  md: "py-[var(--space-md)]",
  lg: "py-[var(--space-lg)]",
  xl: "py-[var(--space-xl)]",
};

const CONTAINER_WIDTH_CLASSES: Record<LayoutContainerWidth, string> = {
  sm: "max-w-[var(--prose-narrow)]",
  md: "max-w-[var(--prose-medium)]",
  lg: "max-w-[var(--container-max)]",
  xl: "max-w-[var(--container-editorial)]",
  full: "max-w-none",
};

const VISIBILITY_CLASSES = (l: SectionLayoutConfig) =>
  cn(l.hideOnMobile && "max-md:hidden", l.hideOnDesktop && "md:hidden");

export function SectionWrapper({
  layout,
  children,
}: {
  readonly layout: SectionLayoutConfig;
  readonly children: ReactNode;
}) {
  return (
    <section
      className={cn(
        PADDING_CLASSES[layout.padding],
        VISIBILITY_CLASSES(layout),
      )}
    >
      <div
        className={cn(
          "mx-auto px-4",
          CONTAINER_WIDTH_CLASSES[layout.containerWidth],
        )}
      >
        {layout.animateOnScroll === "none" ? (
          children
        ) : (
          <ScrollReveal variant={layout.animateOnScroll}>
            {children}
          </ScrollReveal>
        )}
      </div>
    </section>
  );
}
```

各 section component（`HeroSection` / `CTASection` / etc）を `SectionWrapper` でラップし、外側 padding/containerWidth/visibility を統一委譲。section component 自体は**内側コンテンツのみ責務**を持つ。

### 6. 公式準拠

| 項目                          | 公式準拠先                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| Tailwind responsive utilities | [Tailwind responsive design](https://tailwindcss.com/docs/responsive-design) — `max-md:` / `md:` |
| ScrollReveal                  | 既存 `@/public/components/animations/scroll-reveal`（`prefers-reduced-motion` 対応済）           |
| Postgres JSONB UPDATE         | [PostgreSQL JSON Functions](https://www.postgresql.org/docs/current/functions-json.html)         |

### 7. リスク

| リスク                                                                        | 影響                         | 対策                                                              |
| ----------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------- |
| 全 23 sections 一斉編集の漏れ                                                 | layout 未注入 section が出る | grep で `z.object({` ヒット数 = 23 を確認                         |
| 既存 page で padding/containerWidth が変わる                                  | 公開ページの見た目崩れ       | migration の COALESCE で既存値保持、default は md/lg で従来と近い |
| `section-options.ts` の `paddingValues`/`maxWidthValues` 削除で他 caller 影響 | type-check break             | grep で全 caller 列挙、新 LAYOUT\_\* に置換                       |
| ScrollReveal の variant 拡張                                                  | 既存 caller 影響             | `fade-up` 既存サポート、`fade`/`scale`/`none` 新規追加            |

### 8. 計画される commit 分割

#### Phase 3A: 共通 layout schema

1. `feat(sections): add sectionLayoutSchema shared factory`

#### Phase 3B: 23 sections への一斉注入

2. `refactor(sections): inject sectionLayoutSchema into all 23 section schemas`
3. `chore(sections): drop per-section padding/maxWidth/containerWidth (absorbed into layout)`

#### Phase 3C: section-options cleanup

4. `refactor(sections): remove orphan paddingValues/maxWidthValues from section-options.ts`

#### Phase 3D: Public renderer 統一

5. `feat(public): SectionWrapper applies layout/visibility/animation uniformly`
6. `refactor(public): wrap all 23 section components with SectionWrapper`

#### Phase 3E: Migration

7. `feat(prisma): migration — relocate per-section padding/maxWidth into layout group`

#### Phase 3F: テスト

8. `test(sections): sectionLayoutSchema + SectionWrapper unit tests`

合計 8 commits（Phase 1/2 より小スコープ）。

---

## Out of Scope（次回 spec へ）

- ❌ Tabler Icons static allowlist による bundle 削減
- ❌ page-hero buttons の `createButtonsArraySchema` 統合
- ❌ live preview iframe / autosave / スケジュール公開
- ❌ section レベルの背景色 / 背景画像（`hero` 等は per-section で既存、共通化はしない）
