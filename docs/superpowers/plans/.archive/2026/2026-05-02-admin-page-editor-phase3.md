# Admin Page Editor Phase 3 Implementation Plan

> **Snapshot: 2026-05-13** — Implementation completed, archived as historical reference.
> **Completed: 2026-05-08** — Shared `sectionLayoutSchema` injected into all 22 sections + public `SectionWrapper` consumes layout uniformly + Section.config migration applied.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`.

**Spec:** `docs/superpowers/specs/2026-05-02-admin-page-editor-phase3-design.md`

**Goal:** Inject a shared `sectionLayoutSchema` into all 23 sections and absorb per-section padding/maxWidth/containerWidth. Apply it uniformly via the public `SectionWrapper`. One destructive `Section.config` JSON migration.

**Tech Stack:** Same as Phase 1/2 + `@theme` tokens (admin.css/public.css) + ScrollReveal animation primitive

**Branch:** Continue on `refactor/docs-diataxis` (extension of Phases 1+2)

---

## Phase 3A: Shared layout schema factory

### Task 1: Create `sectionLayoutSchema`

**Files:** Create `src/shared/lib/sections/definitions/_shared/layout.ts`

- [ ] **Step 1: Implement**

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
  "Layout & Display Controls",
  {
    padding: field.select("Vertical Padding", {
      options: LAYOUT_PADDING_VALUES,
      default: "md",
      helpText: "Vertical spacing for the section",
    }),
    containerWidth: field.select("Container Width", {
      options: LAYOUT_CONTAINER_WIDTH_VALUES,
      default: "lg",
      helpText: "Maximum content width",
    }),
    hideOnMobile: field.boolean("Hide on Mobile", {
      default: false,
      helpText: "Hidden below 768px",
    }),
    hideOnDesktop: field.boolean("Hide on Desktop", {
      default: false,
      helpText: "Hidden at 768px and above",
    }),
    animateOnScroll: field.select("Entrance Animation", {
      options: LAYOUT_ANIMATE_VALUES,
      default: "fade-up",
      helpText: "Reveal effect on scroll",
    }),
  },
  { group: "design" },
);

export type SectionLayoutConfig = z.infer<typeof sectionLayoutSchema>;
```

- [ ] **Step 2: Validate + Commit**

```bash
bun run type-check 2>&1 | tail -5
git add src/shared/lib/sections/definitions/_shared/layout.ts
git commit -m "feat(sections): add sectionLayoutSchema shared factory"
```

---

## Phase 3B: Bulk inject into 23 sections + remove per-section fields

### Task 2: Add layout: sectionLayoutSchema to all 23 sections

**Files:** Modify all 23 `definitions/<type>/schema.ts`

Targets (23 types confirmed in Phase 1):

- `page-hero` / `hero` / `hero-parallax` / `concept` / `custom`
- `space-list` / `space-showcase` / `news-list` / `post-list` / `faq-list`
- `features` / `testimonial` / `gallery`
- `cta` / `contact-form` / `map` / `embed` / `instagram` / `event-calendar`
- `homepage-how-it-works` / `homepage-spaces` / `homepage-features` / `homepage-cta`

Add `layout: sectionLayoutSchema` to each `z.object({...})` or each variant in `.discriminatedUnion(...)`.

Note: `page-hero` uses a discriminated union (3 variants) — **add `layout` to all three variants**.

```typescript
// Example: cta/schema.ts
import { sectionLayoutSchema } from "../_shared/layout";

export const ctaConfigSchema = z.object({
  // ... existing
  layout: sectionLayoutSchema,
});
```

- [ ] **Step 1: Update all 23 schemas**
- [ ] **Step 2: Validate**

```bash
bun run type-check 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/lib/sections/definitions/
git commit -m "refactor(sections): inject sectionLayoutSchema into all 23 section schemas"
```

### Task 3: Remove per-section padding/maxWidth/containerWidth

**Files:**

- Modify `custom/schema.ts`: Remove `padding` / `maxWidth`
- Modify `embed/schema.ts`: Remove `maxWidth`
- Modify `faq-list/schema.ts`: Remove `containerWidth`

Notes:

- Also update the duplicated schema definitions in `validations/section.ts` (legacy SSoT violation also handled in Phase 2).
- Keep `cta.variant` (default/centered/split) because it is an internal variant.
- Keep `concept.layout` / `features.layout` / `gallery.layout` because they are internal layouts.
- Keep `hero.height` / `hero-parallax.height` because they are svh heights and orthogonal to `layout.padding`.

- [ ] **Step 1: Update the 3 section schemas**
- [ ] **Step 2: Update `validations/section.ts` in sync**
- [ ] **Step 3: Validate + Commit**

```bash
bun run validate 2>&1 | tail -5
git add src/shared/lib/sections/definitions/{custom,embed,faq-list}/schema.ts \
       src/shared/lib/validations/section.ts
git commit -m "chore(sections): drop per-section padding/maxWidth/containerWidth (absorbed into layout)"
```

---

## Phase 3C: section-options cleanup

### Task 4: Replace or remove `paddingValues` / `maxWidthValues` callers with new LAYOUT\_\* values

**Files:**

- Modify: `src/shared/lib/validations/section-options.ts`
- List all callers via grep

- [ ] **Step 1: Confirm callers**

```bash
grep -rln "paddingValues\|maxWidthValues" src/ --include="*.ts" --include="*.tsx"
```

- [ ] **Step 2: Replace each caller with imports from `LAYOUT_PADDING_VALUES` / `LAYOUT_CONTAINER_WIDTH_VALUES` (`@/shared/lib/sections/definitions/_shared/layout`)**

Switch public renderers / parser helpers (`parsePadding` / `parseMaxWidth` in `section-parsers.ts`) to the new layout tokens.

- [ ] **Step 3: Remove `paddingValues` / `Padding` / `maxWidthValues` / `MaxWidth` from `section-options.ts`**

- [ ] **Step 4: Validate + Commit**

```bash
bun run validate 2>&1 | tail -5
git add src/
git commit -m "refactor(sections): remove orphan paddingValues/maxWidthValues from section-options.ts"
```

---

## Phase 3D: Public SectionWrapper

### Task 5: Create `SectionWrapper`

**Files:**

- Create: `src/app/(public)/_components/sections/SectionWrapper.tsx`

- [ ] **Step 1: Implement (spec §5 code)**

```tsx
"use client"; // ScrollReveal requires "use client"
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

Confirm ScrollReveal supports variants "fade-up" / "fade" / "scale". If not, extend ScrollReveal (spec §7 risk).

- [ ] **Step 2: Validate + Commit**

```bash
bun run type-check 2>&1 | tail -5
git add src/app/\(public\)/_components/sections/SectionWrapper.tsx
git commit -m "feat(public): SectionWrapper applies layout/visibility/animation uniformly"
```

### Task 6: Wrap all 23 section components with SectionWrapper

**Files:** All public section components (HeroSection / CTASection / etc)

- [ ] **Step 1: Wrap each section component with `<SectionWrapper layout={config.layout}>`**

Remove each section component’s outer `<section>` and replace with `<SectionWrapper>`.

Example:

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

- [ ] **Step 2: Validate + Commit**

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

- [ ] **Step 1: Write migration SQL using a Python heredoc**

```bash
TS=$(date -u +%Y%m%d%H%M%S)
echo "$TS" > /tmp/migration-ts-3e.txt
python3 -c "import os; os.makedirs('prisma/migrations/${TS}_section_layout_unification', exist_ok=True)"

python3 << 'PY'
import os
ts = open('/tmp/migration-ts-3e.txt').read().strip()
sql = r"""-- Phase 3: move per-section padding/maxWidth/containerWidth into layout group

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

- [ ] **Step 2: Apply**

```bash
TS=$(cat /tmp/migration-ts-3e.txt)
bunx --bun prisma db execute --file prisma/migrations/${TS}_section_layout_unification/migration.sql
bunx --bun prisma migrate resolve --applied "${TS}_section_layout_unification"
```

- [ ] **Step 3: Validate + Commit**

```bash
bun run validate && bun run build 2>&1 | tail -10
TS=$(cat /tmp/migration-ts-3e.txt)
git add prisma/migrations/${TS}_section_layout_unification/migration.sql
git commit -m "feat(prisma): migration — relocate per-section padding/maxWidth into layout group"
```

---

## Phase 3F: Tests

### Task 8: sectionLayoutSchema + SectionWrapper unit tests

**Files:**

- Create: `__tests__/unit/shared/lib/sections/section-layout.test.ts`

- [ ] **Step 1: Schema test**

```typescript
import { describe, expect, test } from "bun:test";
import { sectionLayoutSchema } from "@/shared/lib/sections/definitions/_shared/layout";

describe("sectionLayoutSchema", () => {
  test("fills all fields with defaults for empty object", () => {
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

  test("rejects invalid padding", () => {
    const r = sectionLayoutSchema.safeParse({ padding: "extra-large" });
    expect(r.success).toBe(false);
  });

  test("allows hideOnMobile + hideOnDesktop both true (fully hidden in practice)", () => {
    const r = sectionLayoutSchema.safeParse({
      hideOnMobile: true,
      hideOnDesktop: true,
    });
    expect(r.success).toBe(true);
  });

  test("allows animateOnScroll: none", () => {
    const r = sectionLayoutSchema.safeParse({ animateOnScroll: "none" });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 2: Validate + Commit**

```bash
bun test __tests__/unit/shared/lib/sections/section-layout.test.ts 2>&1 | tail -5
git add __tests__/unit/shared/lib/sections/section-layout.test.ts
git commit -m "test(sections): sectionLayoutSchema unit tests"
```

---

## Self-Review

### Spec coverage

- [x] Section 1 shared layout schema → Task 1
- [x] Section 2 inject into 23 sections → Task 2
- [x] Section 3 remove per-section fields → Task 3
- [x] Section 4 migration → Task 7
- [x] Section 5 SectionWrapper → Task 5, 6
- [x] section-options cleanup → Task 4
- [x] Tests → Task 8

### Type consistency

- [x] `LAYOUT_PADDING_VALUES` / `LAYOUT_CONTAINER_WIDTH_VALUES` / `LAYOUT_ANIMATE_VALUES` naming consistency
- [x] `SectionLayoutConfig` / `LayoutPadding` / `LayoutContainerWidth` / `LayoutAnimate` type exports

---

## Execution Recommendation

Subagent dispatch recommended:

- **Bundle 1 (Tasks 1-4)**: schema unification + section-options cleanup (4 commits)
- **Bundle 2 (Tasks 5-7)**: public renderer + migration (3 commits)
- **Bundle 3 (Task 8)**: tests (1 commit, direct controller implementation OK)
