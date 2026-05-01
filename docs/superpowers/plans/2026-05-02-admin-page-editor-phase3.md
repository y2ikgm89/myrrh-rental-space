# Admin Page Editor Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`.

**Spec:** `docs/superpowers/specs/2026-05-02-admin-page-editor-phase3-design.md`

**Goal:** 全 23 sections に共通 `sectionLayoutSchema` を注入し、per-section padding/maxWidth/containerWidth を吸収。公開 SectionWrapper で統一適用。destructive Section.config JSON migration 1 個。

**Tech Stack:** Phase 1/2 同様 + `@theme` token (admin.css/public.css) + ScrollReveal animation primitive

**Branch:** `refactor/docs-diataxis` で続行（Phase 1+2 の延長）

---

## Phase 3A: 共通 layout schema factory

### Task 1: `sectionLayoutSchema` 作成

**Files:** Create `src/shared/lib/sections/definitions/_shared/layout.ts`

- [ ] **Step 1: 実装**

```typescript
// src/shared/lib/sections/definitions/_shared/layout.ts
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

- [ ] **Step 2: 検証 + Commit**

```bash
bun run type-check 2>&1 | tail -5
git add src/shared/lib/sections/definitions/_shared/layout.ts
git commit -m "feat(sections): add sectionLayoutSchema shared factory"
```

---

## Phase 3B: 23 sections への一斉注入 + per-section field 削除

### Task 2: 全 23 sections に layout: sectionLayoutSchema を追加

**Files:** Modify all 23 `definitions/<type>/schema.ts`

対象（Phase 1 で確認した 23 type）:

- `page-hero` / `hero` / `hero-parallax` / `concept` / `custom`
- `space-list` / `space-showcase` / `news-list` / `post-list` / `faq-list`
- `features` / `testimonial` / `gallery`
- `cta` / `contact-form` / `map` / `embed` / `instagram` / `event-calendar`
- `homepage-how-it-works` / `homepage-spaces` / `homepage-features` / `homepage-cta`

各 schema の `z.object({...})` または `.discriminatedUnion(...)` の各 variant に `layout: sectionLayoutSchema` を追加。

注意: page-hero は discriminated union (3 variants) — **3 variants 全部に layout を追加**。

```typescript
// 例: cta/schema.ts
import { sectionLayoutSchema } from "../_shared/layout";

export const ctaConfigSchema = z.object({
  // ... 既存
  layout: sectionLayoutSchema,
});
```

- [ ] **Step 1: 全 23 schema 更新**
- [ ] **Step 2: 検証**

```bash
bun run type-check 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/lib/sections/definitions/
git commit -m "refactor(sections): inject sectionLayoutSchema into all 23 section schemas"
```

### Task 3: per-section padding/maxWidth/containerWidth 削除

**Files:**

- Modify `custom/schema.ts`: 削除 `padding` / `maxWidth`
- Modify `embed/schema.ts`: 削除 `maxWidth`
- Modify `faq-list/schema.ts`: 削除 `containerWidth`

注意:

- `validations/section.ts` の重複 schema 定義（Phase 2 でも対応した legacy SSoT 違反）も同期更新
- `cta.variant` (default/centered/split) は内部バリアントのため**残す**
- `concept.layout` / `features.layout` / `gallery.layout` も内部レイアウトのため残す
- `hero.height` / `hero-parallax.height` も svh 高さで `layout.padding` と直交、残す

- [ ] **Step 1: 3 section schema 更新**
- [ ] **Step 2: validations/section.ts も同期更新**
- [ ] **Step 3: 検証 + Commit**

```bash
bun run validate 2>&1 | tail -5
git add src/shared/lib/sections/definitions/{custom,embed,faq-list}/schema.ts \
       src/shared/lib/validations/section.ts
git commit -m "chore(sections): drop per-section padding/maxWidth/containerWidth (absorbed into layout)"
```

---

## Phase 3C: section-options cleanup

### Task 4: `paddingValues` / `maxWidthValues` の caller を新 LAYOUT\_\* に置換 or 削除

**Files:**

- Modify: `src/shared/lib/validations/section-options.ts`
- 全 caller を grep で列挙

- [ ] **Step 1: caller 確認**

```bash
grep -rln "paddingValues\|maxWidthValues" src/ --include="*.ts" --include="*.tsx"
```

- [ ] **Step 2: 各 caller を `LAYOUT_PADDING_VALUES` / `LAYOUT_CONTAINER_WIDTH_VALUES` (`@/shared/lib/sections/definitions/_shared/layout`) からの import に置換**

公開 renderer / parser helper（`section-parsers.ts` の `parsePadding` / `parseMaxWidth`）は新 layout token に切替。

- [ ] **Step 3: `section-options.ts` から `paddingValues` / `Padding` / `maxWidthValues` / `MaxWidth` を削除**

- [ ] **Step 4: 検証 + Commit**

```bash
bun run validate 2>&1 | tail -5
git add src/
git commit -m "refactor(sections): remove orphan paddingValues/maxWidthValues from section-options.ts"
```

---

## Phase 3D: 公開 SectionWrapper

### Task 5: `SectionWrapper` 作成

**Files:**

- Create: `src/app/(public)/_components/sections/SectionWrapper.tsx`

- [ ] **Step 1: 実装（spec §5 のコード）**

```tsx
"use client"; // ScrollReveal が "use client" のため
import { cn } from "@/shared/lib/cn";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import type {
  LayoutPadding,
  LayoutContainerWidth,
  LayoutAnimate,
  SectionLayoutConfig,
} from "@/shared/lib/sections/definitions/_shared/layout";
import type { ReactNode } from "react";

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

interface SectionWrapperProps {
  readonly layout: SectionLayoutConfig;
  readonly children: ReactNode;
  readonly className?: string;
}

export function SectionWrapper({
  layout,
  children,
  className,
}: SectionWrapperProps) {
  const inner = (
    <div
      className={cn(
        "mx-auto px-4",
        CONTAINER_WIDTH_CLASSES[layout.containerWidth],
      )}
    >
      {children}
    </div>
  );

  return (
    <section
      className={cn(
        PADDING_CLASSES[layout.padding],
        layout.hideOnMobile && "max-md:hidden",
        layout.hideOnDesktop && "md:hidden",
        className,
      )}
    >
      {layout.animateOnScroll === "none" ? (
        inner
      ) : (
        <ScrollReveal variant={mapAnimateVariant(layout.animateOnScroll)}>
          {inner}
        </ScrollReveal>
      )}
    </section>
  );
}

function mapAnimateVariant(
  animate: LayoutAnimate,
): "fade-up" | "fade" | "scale" | undefined {
  if (animate === "none") return undefined;
  return animate;
}
```

ScrollReveal の variant が "fade-up" / "fade" / "scale" 全部対応しているか実装確認。なければ ScrollReveal 拡張（spec §7 risk）。

- [ ] **Step 2: 検証 + Commit**

```bash
bun run type-check 2>&1 | tail -5
git add src/app/\(public\)/_components/sections/SectionWrapper.tsx
git commit -m "feat(public): SectionWrapper applies layout/visibility/animation uniformly"
```

### Task 6: 全 23 section components を SectionWrapper でラップ

**Files:** 全公開 section component（HeroSection / CTASection / etc）

- [ ] **Step 1: 各 section component を `<SectionWrapper layout={config.layout}>` でラップ**

各 section component の最外殻 `<section>` を削除し、`<SectionWrapper>` に置換。

例:

```tsx
// Before
export function CTASection({ config }: { config: CtaConfig }) {
  return <section className="py-16">...</section>;
}

// After
export function CTASection({ config }: { config: CtaConfig }) {
  return <SectionWrapper layout={config.layout}>...</SectionWrapper>;
}
```

- [ ] **Step 2: 検証 + Commit**

```bash
bun run validate 2>&1 | tail -5
bun run build 2>&1 | tail -10
git add src/
git commit -m "refactor(public): wrap all 23 section components with SectionWrapper"
```

---

## Phase 3E: Migration

### Task 7: Section.config JSON migration

**Files:** Create `prisma/migrations/<TS>_section_layout_unification/migration.sql`

- [ ] **Step 1: Migration SQL を Python heredoc で書き出し**

```bash
TS=$(date -u +%Y%m%d%H%M%S)
echo "$TS" > /tmp/migration-ts-3e.txt
python3 -c "import os; os.makedirs('prisma/migrations/${TS}_section_layout_unification', exist_ok=True)"

python3 << 'PY'
import os
ts = open('/tmp/migration-ts-3e.txt').read().strip()
sql = r"""-- Phase 3: per-section padding/maxWidth/containerWidth → layout group に移行

-- custom
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

-- embed
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

-- faq-list
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
"""
path = f'prisma/migrations/{ts}_section_layout_unification/migration.sql'
with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(sql)
print(f'Wrote: {path}')
PY
```

- [ ] **Step 2: 適用**

```bash
TS=$(cat /tmp/migration-ts-3e.txt)
bunx --bun prisma db execute --file prisma/migrations/${TS}_section_layout_unification/migration.sql
bunx --bun prisma migrate resolve --applied "${TS}_section_layout_unification"
```

- [ ] **Step 3: 検証 + Commit**

```bash
bun run validate && bun run build 2>&1 | tail -10
TS=$(cat /tmp/migration-ts-3e.txt)
git add prisma/migrations/${TS}_section_layout_unification/migration.sql
git commit -m "feat(prisma): migration — relocate per-section padding/maxWidth into layout group"
```

---

## Phase 3F: テスト

### Task 8: sectionLayoutSchema + SectionWrapper unit tests

**Files:**

- Create: `__tests__/unit/shared/lib/sections/section-layout.test.ts`

- [ ] **Step 1: schema test**

```typescript
import { describe, expect, test } from "bun:test";
import { sectionLayoutSchema } from "@/shared/lib/sections/definitions/_shared/layout";

describe("sectionLayoutSchema", () => {
  test("空オブジェクトで全フィールド default 補完", () => {
    const r = sectionLayoutSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.padding).toBe("md");
      expect(r.data.containerWidth).toBe("lg");
      expect(r.data.hideOnMobile).toBe(false);
      expect(r.data.hideOnDesktop).toBe(false);
      expect(r.data.animateOnScroll).toBe("fade-up");
    }
  });

  test("不正な padding は reject", () => {
    const r = sectionLayoutSchema.safeParse({ padding: "extra-large" });
    expect(r.success).toBe(false);
  });

  test("hideOnMobile + hideOnDesktop 両方 true でも valid（運用上は完全非表示）", () => {
    const r = sectionLayoutSchema.safeParse({
      hideOnMobile: true,
      hideOnDesktop: true,
    });
    expect(r.success).toBe(true);
  });

  test("animateOnScroll: none を許容", () => {
    const r = sectionLayoutSchema.safeParse({ animateOnScroll: "none" });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 2: 検証 + Commit**

```bash
bun test __tests__/unit/shared/lib/sections/section-layout.test.ts 2>&1 | tail -5
git add __tests__/unit/shared/lib/sections/section-layout.test.ts
git commit -m "test(sections): sectionLayoutSchema unit tests"
```

---

## Self-Review

### Spec coverage

- [x] Section 1 共通 layout schema → Task 1
- [x] Section 2 23 sections 注入 → Task 2
- [x] Section 3 per-section field 削除 → Task 3
- [x] Section 4 migration → Task 7
- [x] Section 5 SectionWrapper → Task 5, 6
- [x] section-options cleanup → Task 4
- [x] テスト → Task 8

### Type consistency

- [x] `LAYOUT_PADDING_VALUES` / `LAYOUT_CONTAINER_WIDTH_VALUES` / `LAYOUT_ANIMATE_VALUES` 命名統一
- [x] `SectionLayoutConfig` / `LayoutPadding` / `LayoutContainerWidth` / `LayoutAnimate` 型 export

---

## Execution Recommendation

Subagent dispatch 推奨:

- **Bundle 1 (Tasks 1-4)**: schema 統一 + section-options cleanup（4 commits）
- **Bundle 2 (Tasks 5-7)**: 公開 renderer + migration（3 commits）
- **Bundle 3 (Task 8)**: テスト（1 commit、controller 直接実装で OK）
