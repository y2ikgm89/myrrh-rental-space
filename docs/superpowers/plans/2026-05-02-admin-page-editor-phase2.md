# Admin Page Editor Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-02-admin-page-editor-phase2-design.md`

**Goal:** Execute clean-break extensions in one pass: button style unification (A) + image metadata structuring (B) + dynamic select (C).

**Architecture:** ① In Phase 2A, create a button factory, unify 5 sections, remove legacy CTA + migrate data. ② In Phase 2B, structure image metadata (4 sections + destructive Section.config JSON migration). ③ In Phase 2C, add dynamic select to field-registry and unify post-list / faq-list.

**Tech Stack:** Same as Phase 1 (Prisma 7.8 / PostgreSQL / Next.js 16.2 / React 19 + Compiler 1.0 / Zod 4 / Tabler Icons)

**Branch:** Continue on `refactor/docs-diataxis` (extension of Phase 1).

---

## File Structure

### New files

| Path                                                                     | Purpose                                                              |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `src/shared/lib/sections/definitions/_shared/buttons.ts`                 | `createButtonsArraySchema` factory (shared buttons array schema)     |
| `src/shared/lib/sections/definitions/_shared/image.ts`                   | `createImageGroupSchema` / `createCompactImageGroupSchema` factories |
| `src/shared/lib/sections/dynamic-options.ts`                             | `DynamicSelectSource` type + `useDynamicSectionOptions`              |
| `src/admin/api/section-dynamic-options/route.ts` (or fetch helper)       | Fetch post categories / faq categories                               |
| `prisma/migrations/<TS>_buttons_unify_and_image_structure/migration.sql` | Data migration (buttons + image structuring)                         |
| `__tests__/unit/shared/lib/sections/buttons-factory.test.ts`             | Buttons factory tests                                                |
| `__tests__/unit/shared/lib/sections/image-factory.test.ts`               | Image factory tests                                                  |
| `__tests__/unit/shared/lib/sections/dynamic-select.test.ts`              | dynamicSelect tests                                                  |

### Changes

| Path                                                                                         | Details                                                                                    |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/shared/lib/sections/field-registry.ts`                                                  | Add `dynamicSelectSource` + `field.dynamicSelect()` helper                                 |
| `src/shared/lib/sections/definitions/cta/schema.ts`                                          | Adopt `createButtonsArraySchema`, remove `.transform()`                                    |
| `src/shared/lib/sections/definitions/hero/schema.ts`                                         | Same + structure `backgroundImageUrl` → `backgroundImage`                                  |
| `src/shared/lib/sections/definitions/hero-parallax/schema.ts`                                | Same                                                                                       |
| `src/shared/lib/sections/definitions/page-hero/schema.ts`                                    | Migration to `createButtonsArraySchema` out of scope (already custom; align in another PR) |
| `src/shared/lib/sections/definitions/homepage-cta/schema.ts`                                 | Adopt `createButtonsArraySchema`                                                           |
| `src/shared/lib/sections/definitions/concept/schema.ts`                                      | Structure `imageUrl` → `image`                                                             |
| `src/shared/lib/sections/definitions/testimonial/schema.ts`                                  | Structure `items[].authorImageUrl` → `authorImage`                                         |
| `src/shared/lib/sections/definitions/post-list/schema.ts`                                    | `categoryId` → `field.dynamicSelect`                                                       |
| `src/shared/lib/sections/definitions/faq-list/schema.ts`                                     | `categoryId` → `field.dynamicSelect` (if present)                                          |
| `src/shared/lib/validations/cta-and-url.ts`                                                  | Remove `createCtaSchemas` / `transformLegacyCtaToButtons` / `transformCtaFields`           |
| `src/shared/lib/validations/section.ts`                                                      | Remove `.transform()` from `heroConfigSchema` / `ctaConfigSchema`                          |
| `src/public/components/design-system/button.tsx`                                             | Accept `iconName?` / `size` / `customBackgroundColor` / `customTextColor`                  |
| `src/app/(public)/_components/homepage/...`                                                  | Update Hero / HeroParallax / Concept / Testimonial renderers                               |
| `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionEditPanel.tsx`       | Pass dynamic options to AutoSectionForm via props                                          |
| `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form.tsx` | Accept `dynamicOptions` prop + inject on select render                                     |
| `prisma/seed.ts`                                                                             | Update defaults like `defaultPageHero` to new structure                                    |

### Removals

- `transformLegacyCtaToButtons` function
- `transformCtaFields` function
- `createCtaSchemas` factory (legacy)

---

## Phase 2A: Button style unification

### Task A1: Create `createButtonsArraySchema` factory

**Files:**

- Create: `src/shared/lib/sections/definitions/_shared/buttons.ts`

- [ ] **Step 1: Implement factory**

```typescript
// src/shared/lib/sections/definitions/_shared/buttons.ts
import { z } from "zod";
import { fieldRegistry, field } from "../../field-registry";
import {
  createInternalAppRouteSchema,
  ctaButtonVariants,
  ctaButtonSizes,
  optionalHexColorSchema,
} from "@/shared/lib/validations/cta-and-url";

export function createButtonsArraySchema(label = "Buttons") {
  return field
    .array(label, {
      subGroup: "button",
      fields: {
        text: field.text("Button Text", { maxLength: 50 }),
        url: createInternalAppRouteSchema(500).register(fieldRegistry, {
          fieldType: "url",
          label: "Link URL",
          group: "content",
        }),
        variant: field.select("Button Variant", {
          options: ctaButtonVariants,
          default: "primary",
        }),
        size: field.select("Button Size", {
          options: ctaButtonSizes,
          default: "lg",
        }),
        iconName: field.icon("Icon (optional)", {
          helpText: "Tabler Icons name (e.g., IconArrowRight)",
        }),
        openInNewTab: field.boolean("Open in new tab"),
        backgroundColor: optionalHexColorSchema.register(fieldRegistry, {
          fieldType: "color",
          label: "Background color (custom)",
          group: "content",
          helpText: "If unset, use variant default color",
        }),
        textColor: optionalHexColorSchema.register(fieldRegistry, {
          fieldType: "color",
          label: "Text color (custom)",
          group: "content",
          helpText: "If unset, use variant default color",
        }),
      },
    })
    .refine((arr) => new Set(arr.map((b) => b.url)).size === arr.length, {
      error: "You cannot register multiple buttons with the same URL",
    });
}
```

- [ ] **Step 2: Validate**

```bash
bun run type-check 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/lib/sections/definitions/_shared/buttons.ts
git commit -m "feat(sections): add createButtonsArraySchema shared factory"
```

---

### Task A2: Unify 5 sections to `createButtonsArraySchema`

**Files:**

- Modify: `cta/schema.ts`, `hero/schema.ts`, `hero-parallax/schema.ts`, `homepage-cta/schema.ts`
- Note: `page-hero/schema.ts` is excluded in Phase 2 because it already has a custom schema (align in a future PR)

- [ ] **Step 1: Update cta/schema.ts**

```typescript
import { createButtonsArraySchema } from "../_shared/buttons";

export const ctaConfigSchema = z.object({
  sectionLabel: field.text("Section Label", { ... }),
  title: field.text("Heading", { maxLength: 100, subGroup: "text" }),
  description: field.textarea("Description", { maxLength: 500, subGroup: "text" }),
  buttons: createButtonsArraySchema("Buttons"),
  backgroundColor: field.color("Background Color", { group: "design" }),
  variant: field.select("Layout Variant", { ... }),
});
```

Remove the `.transform()` chain (absorbed legacy `transformLegacyCtaToButtons`).

- [ ] **Step 2: Update hero/schema.ts similarly**
- [ ] **Step 3: Update hero-parallax/schema.ts similarly**
- [ ] **Step 4: Update homepage-cta/schema.ts similarly**

- [ ] **Step 5: Validate**

```bash
bun run type-check 2>&1 | tail -5
bun run lint 2>&1 | tail -5
```

- [ ] **Step 6: Commit**

```bash
git add src/shared/lib/sections/definitions/{cta,hero,hero-parallax,homepage-cta}/schema.ts
git commit -m "refactor(sections): unify 4 sections to use createButtonsArraySchema"
```

---

### Task A3: Extend public Button primitive with size/icon/color

**Files:**

- Modify: `src/public/components/design-system/button.tsx` (or relevant path)

- [ ] **Step 1: Check existing props**

```bash
cat src/public/components/design-system/button.tsx 2>&1 | head -50
```

- [ ] **Step 2: Add `iconName` / `customBackgroundColor` / `customTextColor` props**

```tsx
import * as TablerIcons from "@tabler/icons-react";
import type { ComponentProps } from "react";

interface ExtendedProps {
  readonly iconName?: string;
  readonly customBackgroundColor?: string;
  readonly customTextColor?: string;
}

function resolveIcon(name: string | undefined) {
  if (!name) return null;
  const Icon = (TablerIcons as Record<string, unknown>)[name];
  if (typeof Icon === "function" || typeof Icon === "object") {
    return Icon as React.ComponentType<{ className?: string }>;
  }
  return null;
}

// Inside Button:
const Icon = resolveIcon(iconName);
const inlineStyle: React.CSSProperties = {
  ...(customBackgroundColor && { backgroundColor: customBackgroundColor }),
  ...(customTextColor && { color: customTextColor }),
};

return (
  <button style={inlineStyle} ...>
    {Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
    {children}
  </button>
);
```

- [ ] **Step 3: Update public Hero / CTA renderers** — pass iconName/size/customBackgroundColor to Button in buttons.map

- [ ] **Step 4: Validate + Commit**

```bash
bun run validate 2>&1 | tail -5
git add src/public/
git commit -m "feat(public): Button primitive consumes iconName/size/customBackgroundColor/customTextColor"
```

---

### Task A4: Legacy CTA data migration + code removal

**Files:**

- Create: `prisma/migrations/<TS>_buttons_unify_drop_legacy_cta/migration.sql`
- Modify: `src/shared/lib/validations/cta-and-url.ts` (remove)
- Modify: `src/shared/lib/validations/section.ts` (remove)

- [ ] **Step 1: Check for legacy CTA data in the existing DB**

```bash
bun -e "
const { PrismaClient } = require('./generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const p = new PrismaClient({ adapter: new PrismaPg(pool) });
(async () => {
  const sections = await p.section.findMany({ where: { type: { in: ['hero', 'cta'] } } });
  for (const s of sections) {
    const c = s.config;
    if (typeof c === 'object' && c && ('ctaPrimary' in c || 'ctaSecondary' in c)) {
      console.log(s.id, s.type, JSON.stringify(c));
    }
  }
  await p.\$disconnect();
})();
"
```

- [ ] **Step 2: Write migration SQL (Python)**

```bash
TS=$(date -u +%Y%m%d%H%M%S)
echo "$TS" > /tmp/migration-ts-a4.txt
python3 -c "import os; os.makedirs('prisma/migrations/${TS}_buttons_unify_drop_legacy_cta', exist_ok=True)"

python3 << 'PY'
import os
ts = open('/tmp/migration-ts-a4.txt').read().strip()
sql = r"""-- Phase 2A: Convert legacy ctaPrimary / ctaSecondary to buttons[] + remove fields
-- If legacy CTA fields remain in hero/cta config, merge into buttons array

-- Note: build array via jsonb_path operations. If buttons array already exists, do not merge legacy fields

UPDATE sections SET config = jsonb_set(
  config - 'ctaPrimary' - 'ctaSecondary',
  '{buttons}',
  COALESCE(config->'buttons', '[]'::jsonb) ||
    CASE
      WHEN config->'ctaPrimary'->>'text' IS NOT NULL AND config->'ctaPrimary'->>'url' IS NOT NULL
      THEN jsonb_build_array(jsonb_build_object(
        'text', config->'ctaPrimary'->>'text',
        'url', config->'ctaPrimary'->>'url',
        'variant', 'primary',
        'size', 'lg',
        'iconName', '',
        'openInNewTab', false
      ))
      ELSE '[]'::jsonb
    END ||
    CASE
      WHEN config->'ctaSecondary'->>'text' IS NOT NULL AND config->'ctaSecondary'->>'url' IS NOT NULL
      THEN jsonb_build_array(jsonb_build_object(
        'text', config->'ctaSecondary'->>'text',
        'url', config->'ctaSecondary'->>'url',
        'variant', 'secondary',
        'size', 'lg',
        'iconName', '',
        'openInNewTab', false
      ))
      ELSE '[]'::jsonb
    END
) WHERE type IN ('hero', 'cta')
  AND (config ? 'ctaPrimary' OR config ? 'ctaSecondary');
"""
path = f'prisma/migrations/{ts}_buttons_unify_drop_legacy_cta/migration.sql'
with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(sql)
print(f'Wrote: {path}')
PY
```

- [ ] **Step 3: Apply migration**

```bash
TS=$(cat /tmp/migration-ts-a4.txt)
bunx --bun prisma db execute --file prisma/migrations/${TS}_buttons_unify_drop_legacy_cta/migration.sql
bunx --bun prisma migrate resolve --applied "${TS}_buttons_unify_drop_legacy_cta"
```

- [ ] **Step 4: Remove legacy from cta-and-url.ts**

Remove `createCtaSchemas` / `transformLegacyCtaToButtons` / `transformCtaFields`.

- [ ] **Step 5: Remove `.transform()` from section.ts (no-op if already handled in Task A2)**

```typescript
// Check: ensure heroConfigSchema / ctaConfigSchema do not use transformCtaFields
grep "transformCtaFields\|transformLegacyCtaToButtons" src/
# Expected: 0 matches
```

- [ ] **Step 6: Validate**

```bash
bun run validate 2>&1 | tail -5
bun run build 2>&1 | tail -10
```

- [ ] **Step 7: Commit**

```bash
TS=$(cat /tmp/migration-ts-a4.txt)
git add prisma/migrations/${TS}_buttons_unify_drop_legacy_cta/migration.sql \
        src/shared/lib/validations/cta-and-url.ts \
        src/shared/lib/validations/section.ts
git commit -m "feat(prisma+sections): migrate legacy ctaPrimary/ctaSecondary to buttons[] + drop legacy helpers"
```

---

## Phase 2B: Image metadata structuring

### Task B1: Create `createImageGroupSchema` factory

**Files:**

- Create: `src/shared/lib/sections/definitions/_shared/image.ts`

- [ ] **Step 1: Implement factory**

```typescript
// src/shared/lib/sections/definitions/_shared/image.ts
import { field } from "../../field-registry";

export function createImageGroupSchema(label = "Image") {
  return field.group(
    label,
    {
      url: field.image("Image URL"),
      alt: field.text("Alt Text (a11y / SEO)", {
        maxLength: 200,
        helpText: "Used when the image fails to load or for screen readers",
      }),
      caption: field.text("Caption (optional)", {
        maxLength: 300,
        helpText: "Description shown below the image",
      }),
    },
    { subGroup: "image" },
  );
}

export function createCompactImageGroupSchema(label = "Image") {
  return field.group(
    label,
    {
      url: field.image("Image URL"),
      alt: field.text("Alt Text", { maxLength: 200 }),
    },
    { subGroup: "image" },
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/lib/sections/definitions/_shared/image.ts
git commit -m "feat(sections): add createImageGroupSchema shared factory"
```

---

### Task B2: Structure images in 4 sections

**Files:**

- Modify: `hero/schema.ts`、`hero-parallax/schema.ts`、`concept/schema.ts`、`testimonial/schema.ts`

- [ ] **Step 1: hero/schema.ts**

```typescript
// Remove: backgroundImageUrl: field.image("Background Image", { subGroup: "image" })
// Add: backgroundImage: createImageGroupSchema("Background Image")

import { createImageGroupSchema } from "../_shared/image";

backgroundImage: createImageGroupSchema("Background Image"),
```

- [ ] **Step 2: hero-parallax/schema.ts similarly**
- [ ] **Step 3: concept/schema.ts**

```typescript
// imageUrl → image
import { createImageGroupSchema } from "../_shared/image";

image: createImageGroupSchema("Main Image"),
```

- [ ] **Step 4: testimonial/schema.ts**

```typescript
// items[].authorImageUrl → items[].authorImage
import { createCompactImageGroupSchema } from "../_shared/image";

items: z.array(
  z.object({
    // ...
    authorImage: createCompactImageGroupSchema("Profile Image"),
  }),
);
```

- [ ] **Step 5: Validate + Commit**

```bash
bun run type-check 2>&1 | tail -5
git add src/shared/lib/sections/definitions/{hero,hero-parallax,concept,testimonial}/schema.ts
git commit -m "refactor(sections): structure single-string images into image group"
```

---

### Task B3: Migration (destructive Section.config JSON)

**Files:**

- Create: `prisma/migrations/<TS>_section_image_meta_structuring/migration.sql`
- Create: `scripts/migrate-testimonial-images.ts` (for converting testimonial.items[])

- [ ] **Step 1: Pre-check grep**

```bash
bun -e "
const { PrismaClient } = require('./generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const p = new PrismaClient({ adapter: new PrismaPg(pool) });
(async () => {
  const sections = await p.section.findMany({ where: { type: { in: ['hero','hero-parallax','concept','testimonial'] } } });
  console.log('Total target sections:', sections.length);
  await p.\$disconnect();
})();
"
```

- [ ] **Step 2: Migration SQL (hero / hero-parallax / concept)**

```bash
TS=$(date -u +%Y%m%d%H%M%S)
echo "$TS" > /tmp/migration-ts-b3.txt
python3 -c "import os; os.makedirs('prisma/migrations/${TS}_section_image_meta_structuring', exist_ok=True)"

python3 << 'PY'
import os
ts = open('/tmp/migration-ts-b3.txt').read().strip()
sql = r"""-- Phase 2B: Convert hero / hero-parallax / concept string images to {url, alt, caption} group

-- hero
UPDATE sections SET config = jsonb_set(
  config - 'backgroundImageUrl',
  '{backgroundImage}',
  jsonb_build_object(
    'url', COALESCE(config->>'backgroundImageUrl', ''),
    'alt', '',
    'caption', ''
  )
) WHERE type = 'hero' AND config ? 'backgroundImageUrl';

-- hero-parallax
UPDATE sections SET config = jsonb_set(
  config - 'backgroundImageUrl',
  '{backgroundImage}',
  jsonb_build_object(
    'url', COALESCE(config->>'backgroundImageUrl', ''),
    'alt', '',
    'caption', ''
  )
) WHERE type = 'hero-parallax' AND config ? 'backgroundImageUrl';

-- concept
UPDATE sections SET config = jsonb_set(
  config - 'imageUrl',
  '{image}',
  jsonb_build_object(
    'url', COALESCE(config->>'imageUrl', ''),
    'alt', '',
    'caption', ''
  )
) WHERE type = 'concept' AND config ? 'imageUrl';
"""
path = f'prisma/migrations/{ts}_section_image_meta_structuring/migration.sql'
with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(sql)
print(f'Wrote: {path}')
PY
```

- [ ] **Step 3: Apply migration**

```bash
TS=$(cat /tmp/migration-ts-b3.txt)
bunx --bun prisma db execute --file prisma/migrations/${TS}_section_image_meta_structuring/migration.sql
bunx --bun prisma migrate resolve --applied "${TS}_section_image_meta_structuring"
```

- [ ] **Step 4: bun script for testimonial.items[]**

```typescript
// scripts/migrate-testimonial-images.ts
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env["DATABASE_URL"] });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const sections = await prisma.section.findMany({
    where: { type: "testimonial" },
  });
  for (const section of sections) {
    const config = section.config;
    if (
      typeof config !== "object" ||
      !config ||
      !("items" in config) ||
      !Array.isArray((config as { items: unknown }).items)
    )
      continue;
    const items = (config as { items: Record<string, unknown>[] }).items;
    let changed = false;
    for (const item of items) {
      if (typeof item.authorImageUrl === "string") {
        item.authorImage = { url: item.authorImageUrl, alt: "" };
        delete item.authorImageUrl;
        changed = true;
      }
    }
    if (changed) {
      await prisma.section.update({
        where: { id: section.id },
        data: { config: config as never },
      });
      console.log(`Migrated section ${section.id}`);
    }
  }
  await prisma.$disconnect();
}

main();
```

```bash
bun scripts/migrate-testimonial-images.ts
```

- [ ] **Step 5: Validate + Commit**

```bash
bun run validate 2>&1 | tail -5
TS=$(cat /tmp/migration-ts-b3.txt)
git add prisma/migrations/${TS}_section_image_meta_structuring/migration.sql \
        scripts/migrate-testimonial-images.ts
git commit -m "feat(prisma): migration — convert string image fields to {url, alt, caption?} groups"
```

---

### Task B4: Update public renderers

**Files:**

- Modify: Public Hero / HeroParallax / Concept / Testimonial components

- [ ] **Step 1: grep callers + update**

```bash
grep -rln "backgroundImageUrl\|imageUrl\|authorImageUrl" src/app/\(public\)/ src/public/ --include="*.tsx" --include="*.ts"
```

Update each caller to the new structure (`backgroundImage.url` / `image.url` / `authorImage.url`).

Also use `alt` (aria-label / Image alt prop).

- [ ] **Step 2: Validate + Commit**

```bash
bun run validate 2>&1 | tail -5
bun run build 2>&1 | tail -10
git add src/
git commit -m "refactor(public): image renderers consume {url, alt, caption} groups"
```

---

## Phase 2C: Dynamic Select

### Task C1: Add `field.dynamicSelect` helper

**Files:**

- Modify: `src/shared/lib/sections/field-registry.ts`

- [ ] **Step 1: Add `FieldMeta.dynamicSelectSource`**

```typescript
export type DynamicSelectSource = "postCategories" | "faqCategories";

export interface FieldMeta {
  // ... existing
  readonly dynamicSelectSource?: DynamicSelectSource;
}

interface DynamicSelectOpts {
  readonly source: DynamicSelectSource;
  readonly group?: FieldMeta["group"];
  readonly subGroup?: FieldSubGroup;
  readonly helpText?: string;
}

// Add to field object
dynamicSelect(label: string, opts: DynamicSelectOpts) {
  return z
    .string()
    .uuid()
    .or(z.literal(""))
    .default("")
    .register(fieldRegistry, {
      fieldType: "select",
      label,
      group: opts.group ?? "content",
      dynamicSelectSource: opts.source,
      ...(opts.subGroup !== undefined && { subGroup: opts.subGroup }),
      ...(opts.helpText !== undefined && { helpText: opts.helpText }),
    });
},
```

- [ ] **Step 2: Validate + Commit**

```bash
bun run type-check 2>&1 | tail -5
git add src/shared/lib/sections/field-registry.ts
git commit -m "feat(field-registry): add field.dynamicSelect helper + dynamicSelectSource meta"
```

---

### Task C2: Switch post-list / faq-list categoryId to `dynamicSelect`

**Files:**

- Modify: `definitions/post-list/schema.ts`、`definitions/faq-list/schema.ts`

- [ ] **Step 1: post-list/schema.ts**

```typescript
// Remove: categoryId: z.string().uuid().optional()
// Add:
categoryId: field.dynamicSelect("Filter by Category", {
  source: "postCategories",
  subGroup: "other",
  helpText: "If unset, show posts from all categories",
}),
```

- [ ] **Step 2: faq-list/schema.ts similarly (if categoryId exists)**

```bash
grep -n "categoryId" src/shared/lib/sections/definitions/faq-list/schema.ts
```

Replace if present; skip if absent.

- [ ] **Step 3: Validate + Commit**

```bash
bun run type-check 2>&1 | tail -5
git add src/shared/lib/sections/definitions/{post-list,faq-list}/schema.ts
git commit -m "refactor(sections): post-list / faq-list categoryId via field.dynamicSelect"
```

---

### Task C3: Inject dynamic options into SectionEditPanel + AutoSectionForm

**Files:**

- Modify: `pages/[slug]/edit/_components/SectionEditPanel.tsx`
- Modify: `pages/[slug]/_sections/_components/auto-section-form.tsx`
- Modify: `pages/[slug]/_sections/_components/auto-fields/AutoSelectField.tsx`
- Modify: `pages/[slug]/edit/_components/PageEditor.tsx` (via fetch + props)

- [ ] **Step 1: getSectionDynamicOptions server fetch**

```typescript
// src/admin/queries/section-dynamic-options.ts (new)
import "server-only";
import { prisma } from "@/shared/db/prisma";

export type DynamicSectionOptions = {
  readonly postCategories: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
  }>;
  readonly faqCategories: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
  }>;
};

export async function getSectionDynamicOptions(): Promise<DynamicSectionOptions> {
  const [postCategories, faqCategories] = await Promise.all([
    prisma.postCategory.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.faqCategory
      .findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })
      .catch(() => []),
  ]);
  return { postCategories, faqCategories };
}
```

Note: if the faqCategory model does not exist, fall back to `[]`.

- [ ] **Step 2: Fetch in PageEditor page.tsx and pass to client component via props**

```tsx
// pages/[slug]/edit/page.tsx
const dynamicOptions = await getSectionDynamicOptions();

<PageEditor key={page.id} page={page} dynamicOptions={dynamicOptions} />;
```

- [ ] **Step 3: Pipe props from PageEditor → SectionEditPanel**

```tsx
<SectionEditPanel
  key={activeSection.id}
  section={activeSection}
  dynamicOptions={dynamicOptions}
  onUpdated={() => router.refresh()}
/>
```

- [ ] **Step 4: Pipe SectionEditPanel → AutoSectionForm**

```tsx
<AutoSectionForm
  ...
  dynamicOptions={dynamicOptions}
/>
```

- [ ] **Step 5: Pass dynamicOptions to AutoSelectField inside AutoSectionForm**

In `AutoFieldByType` case "select", if `meta.dynamicSelectSource` exists, override options:

```tsx
case "select":
  const dynamicSrc = meta.dynamicSelectSource;
  const dynamicValues = dynamicSrc ? dynamicOptions?.[dynamicSrc] ?? [] : null;
  return (
    <AutoSelectField
      ...
      dynamicOptions={dynamicValues}
    />
  );
```

- [ ] **Step 6: If dynamicOptions are passed to AutoSelectField, override static options**

```tsx
const optionsToRender = dynamicOptions
  ? [
      { value: "", label: "(None)" },
      ...dynamicOptions.map((o) => ({ value: o.id, label: o.name })),
    ]
  : staticOptions;
```

- [ ] **Step 7: Validate + Commit**

```bash
bun run validate 2>&1 | tail -5
bun run build 2>&1 | tail -10
git add src/
git commit -m "feat(page-edit): consume dynamicOptions for post/faq categoryId selects"
```

---

## Phase 2D: Tests + cleanup

### Task D1: factory + dynamicSelect tests

**Files:**

- Create: `__tests__/unit/shared/lib/sections/buttons-factory.test.ts`
- Create: `__tests__/unit/shared/lib/sections/image-factory.test.ts`
- Create: `__tests__/unit/shared/lib/sections/dynamic-select.test.ts`

- [ ] **Step 1: buttons-factory.test.ts**

```typescript
import { describe, expect, test } from "bun:test";
import { createButtonsArraySchema } from "@/shared/lib/sections/definitions/_shared/buttons";

describe("createButtonsArraySchema", () => {
  const schema = createButtonsArraySchema();

  test("defaults to empty array", () => {
    const r = schema.safeParse(undefined);
    expect(r.success).toBe(true);
  });

  test("parses minimal shape (text + url)", () => {
    const r = schema.safeParse([{ text: "Reserve", url: "/reservation" }]);
    expect(r.success).toBe(true);
  });

  test("supports size / iconName / variant fields", () => {
    const r = schema.safeParse([
      {
        text: "Reserve",
        url: "/reservation",
        size: "sm",
        iconName: "IconArrowRight",
        variant: "ghost",
      },
    ]);
    expect(r.success).toBe(true);
  });

  test("rejects duplicate URL via refine", () => {
    const r = schema.safeParse([
      { text: "A", url: "/a" },
      { text: "B", url: "/a" },
    ]);
    expect(r.success).toBe(false);
  });

  test("rejects external URL (internal app routes only)", () => {
    const r = schema.safeParse([
      { text: "External", url: "https://example.com" },
    ]);
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: image-factory.test.ts**

```typescript
import { describe, expect, test } from "bun:test";
import {
  createImageGroupSchema,
  createCompactImageGroupSchema,
} from "@/shared/lib/sections/definitions/_shared/image";

describe("createImageGroupSchema", () => {
  const schema = createImageGroupSchema();

  test("parses minimal shape (url + alt)", () => {
    const r = schema.safeParse({
      url: "https://example.com/a.jpg",
      alt: "alt",
    });
    expect(r.success).toBe(true);
  });

  test("caption is optional (default empty string)", () => {
    const r = schema.safeParse({
      url: "https://example.com/a.jpg",
      alt: "alt",
    });
    expect(r.success).toBe(true);
  });
});

describe("createCompactImageGroupSchema", () => {
  test("caption field is not included", () => {
    const schema = createCompactImageGroupSchema();
    const r = schema.safeParse({ url: "https://example.com/a.jpg", alt: "" });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 3: dynamic-select.test.ts**

```typescript
import { describe, expect, test } from "bun:test";
import { fieldRegistry, field } from "@/shared/lib/sections/field-registry";

describe("field.dynamicSelect", () => {
  const schema = field.dynamicSelect("Category", {
    source: "postCategories",
  });

  test("registers dynamicSelectSource meta", () => {
    const meta = fieldRegistry.get(schema);
    expect(meta?.dynamicSelectSource).toBe("postCategories");
    expect(meta?.fieldType).toBe("select");
  });

  test("allows empty string (no category selected)", () => {
    const r = schema.safeParse("");
    expect(r.success).toBe(true);
  });

  test("allows UUID", () => {
    const r = schema.safeParse("550e8400-e29b-41d4-a716-446655440000");
    expect(r.success).toBe(true);
  });

  test("rejects non-UUID string", () => {
    const r = schema.safeParse("not-a-uuid");
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 4: Validate + Commit**

```bash
bun test __tests__/unit/shared/lib/sections/ 2>&1 | tail -5
git add __tests__/unit/shared/lib/sections/
git commit -m "test(sections): button factory + image factory + dynamicSelect tests"
```

---

## Self-Review

### Spec coverage

- [x] Section 1.1–1.3 button unification → Task A1, A2, A3, A4
- [x] Section 2.1–2.4 image metadata structuring → Task B1, B2, B3, B4
- [x] Section 3.1–3.3 dynamic select → Task C1, C2, C3
- [x] Section 4 removals → Task A4
- [x] Section 7 commit split → 14 tasks (spec: 14 commits)

### Type consistency

- [x] `createButtonsArraySchema` / `createImageGroupSchema` / `createCompactImageGroupSchema` / `dynamicSelect` naming consistency
- [x] `DynamicSelectSource` type export
- [x] `dynamicSelectSource` meta field consistency

---

## Execution Recommendation

**Recommend Subagent-Driven Development**:

- Execute sequentially in order: Phase 2A → 2B → 2C → 2D
- Phase 2A4 / 2B3 include destructive migrations, so use fresh subagent dispatch; after completion, the controller verifies with `git log --oneline` + `git show --stat HEAD`
- After each phase, have the controller run `bun run validate`
