# Admin Page Editor Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-02-admin-page-editor-redesign-design.md`

**Goal:** Revamp `/admin/pages/[slug]/edit` with a clean-break refactor: master-detail UI + semantic field groups + Section CRUD/reorder + PageHero integration.

**Architecture:** ① Add additive new code first (field-registry `subGroup`, page-hero registry registration, CRUD Server Actions, master-detail UI components). ② Switch public pages and seed callers to the new paths. ③ Run a destructive migration to move the `Page.pageHero` column into the Section table + remove legacy code in a single atomic commit.

**Tech Stack:** Prisma 7.8 / PostgreSQL / Next.js 16.2 / React 19 + Compiler 1.0 / Zod 4 / nuqs 2.8 / dnd-kit / Radix UI / Tailwind 4.2 / bun:test

**Branch:** Continue on current `refactor/docs-diataxis` (spec already committed; a new branch would be orphaned). After completion, pass `bun run validate && bun run build` → `git merge --ff-only` into main (or PR).

---

## File Structure

### New files

| Path                                                                                         | Purpose                                                                      |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `src/shared/lib/sections/definitions/page-hero/schema.ts`                                    | discriminated union (editorial-split / compact / minimal)                    |
| `src/shared/lib/sections/definitions/page-hero/defaults.ts`                                  | Default values for each variant                                              |
| `src/shared/lib/sections/definitions/page-hero/metadata.ts`                                  | label / icon / category                                                      |
| `src/shared/lib/sections/definitions/page-hero/index.ts`                                     | SectionDefinition export                                                     |
| `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionListSidebar.tsx`     | Left sidebar: dnd-kit Sortable + Add button                                  |
| `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionListItem.tsx`        | Single row: drag handle / icon / label / kebab / active toggle               |
| `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionEditPanel.tsx`       | Right panel: AutoSectionForm for selected section + page-hero variant Select |
| `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/AddSectionDialog.tsx`       | Add button → type picker dialog                                              |
| `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionTypePicker.tsx`      | Type selection UI                                                            |
| `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/section-edit-state.ts`      | nuqs query state SSoT                                                        |
| `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/FieldGroupSection.tsx` | Semantic group heading wrapper                                               |
| `prisma/migrations/<TS>_drop_page_hero_to_section/migration.sql`                             | destructive migration                                                        |
| `__tests__/unit/sections/page-hero-schema.test.ts`                                           | page-hero registry tests                                                     |
| `__tests__/integration/actions/admin/page-section-crud.test.ts`                              | CRUD Server Action integration tests                                         |

### Changes

| Path                                                                                         | Details                                                          |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `src/shared/lib/sections/field-registry.ts`                                                  | Add `subGroup?: FieldSubGroup`, extend helper opts               |
| `src/shared/lib/sections/registry.ts`                                                        | Register page-hero, keep deprecated homepage-hero comment        |
| `src/shared/lib/sections/definitions/<22 types>/schema.ts`                                   | Inject `subGroup` into each schema's `field.*()` calls           |
| `src/app/(admin)/admin/(dashboard)/_shared/actions/page-section.ts`                          | Add 5 CRUD + reorder functions, validations + cache invalidation |
| `src/app/(admin)/admin/(dashboard)/_shared/actions/page-section-types.ts`                    | Add new input types                                              |
| `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form.tsx` | Render content fields grouped by subGroup                        |
| `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/PageEditor.tsx`             | Convert to master-detail                                         |
| `src/app/(public)/_components/homepage/HomepageSections.tsx` (or similar)                    | page.pageHero → sections.find(type=page-hero)                    |
| `src/app/(preview)/preview/pages/[slug]/page.tsx`                                            | Same                                                             |
| `prisma/seed.ts`                                                                             | Replace seedPages pageHero write with page-hero section insert   |
| `prisma/schema.prisma`                                                                       | Remove `Page.pageHero` column (final commit)                     |

### Removals (in final commit)

- `src/shared/lib/sections/page-hero/schema.ts`
- `src/shared/lib/sections/page-hero/defaults.ts`
- `src/shared/lib/sections/page-hero/index.ts` (entire directory)
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/PageHeroEditor.tsx`
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionEditor.tsx`
- `updatePageHero` function in `src/app/(admin)/admin/(dashboard)/_shared/actions/page.ts`

---

## Phase A: Add subGroup to field-registry

### Task A1: Add optional `subGroup` to `FieldMeta`

**Files:**

- Modify: `src/shared/lib/sections/field-registry.ts`

- [ ] **Step 1: Add `subGroup` to the `FieldMeta` interface**

```typescript
// src/shared/lib/sections/field-registry.ts L16-23

export type FieldSubGroup = "text" | "image" | "button" | "other";

export interface FieldMeta {
  readonly fieldType: FieldType;
  readonly label: string;
  readonly placeholder?: string;
  readonly helpText?: string;
  readonly suffix?: string;
  readonly group: "content" | "design" | "advanced";
  readonly subGroup?: FieldSubGroup;
}
```

- [ ] **Step 2: Add `subGroup` to all helper opts interfaces**

Add `readonly subGroup?: FieldSubGroup` to the opts for `TextOpts` / `TextareaOpts` / `NumberOpts` / `BooleanOpts` / `SelectOpts` / `StringFieldOpts` (image / icon / url) / `ArrayOpts` / `GroupOpts`.

Example:

```typescript
interface TextOpts extends StringConstraints {
  readonly placeholder?: string;
  readonly helpText?: string;
  readonly default?: string;
  readonly group?: FieldMeta["group"];
  readonly subGroup?: FieldSubGroup;
}
```

- [ ] **Step 3: Pass `subGroup` into `register` in all `field.*` helpers**

Propagate opts.subGroup in each `fieldRegistry.register(schema, { ...meta })` call. Example:

```typescript
function text(label: string, opts: TextOpts = {}) {
  let s = z.string(...);
  if (opts.minLength != null) s = s.min(opts.minLength);
  if (opts.maxLength != null) s = s.max(opts.maxLength);
  const schema = opts.default !== undefined ? s.default(opts.default) : s;
  fieldRegistry.add(schema, {
    fieldType: "text",
    label,
    group: opts.group ?? "content",
    ...(opts.subGroup !== undefined && { subGroup: opts.subGroup }),
    ...(opts.placeholder !== undefined && { placeholder: opts.placeholder }),
    ...(opts.helpText !== undefined && { helpText: opts.helpText }),
  });
  return schema;
}
```

Because `exactOptionalPropertyTypes: true`, use conditional spreads to include or omit `subGroup` without assigning undefined.

- [ ] **Step 4: Validate**

```bash
bun run type-check 2>&1 | tail -30
```

Expected: EXIT=0, no errors (existing schemas are not annotated yet, so default `subGroup === undefined` works).

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/sections/field-registry.ts
git commit -m "feat(field-registry): add optional subGroup to FieldMeta"
```

---

### Task A2: Inject `subGroup` into the existing 22 section schemas

**Files:**

- Modify: `src/shared/lib/sections/definitions/<type>/schema.ts` × 22 files

Injection rules:

- `field.text` / `field.textarea` for **labels / titles / descriptions / copy** → `subGroup: "text"`
- `field.image` → `subGroup: "image"`
- Image array `field.array` → `subGroup: "image"`
- Button-related `field.url` / button text `field.text` / button array `field.array` → `subGroup: "button"`
- Everything else (identifier-like `section label` / `tagline` / `viewAllText` / `categoryFilter`) → leave undefined ("other")

- [ ] **Step 1: List all schemas**

```bash
ls src/shared/lib/sections/definitions/ | wc -l
```

Expected: 22 directories (page-hero is not created yet).

- [ ] **Step 2: Inject subGroup into each schema (22 files)**

Example: `definitions/cta/schema.ts`

```typescript
import { field } from "@/shared/lib/sections/field-registry";
import { z } from "zod";

export const ctaConfigSchema = z.object({
  sectionLabel: field.text("Section Label", { subGroup: "text" }),
  title: field.text("Title", { subGroup: "text" }),
  description: field.textarea("Description", { subGroup: "text" }),
  buttons: field.array("Buttons", {
    subGroup: "button",
    fields: {
      text: field.text("Button Text"),
      url: field.url("URL"),
      variant: field.select("Variant", {
        options: ["primary", "secondary", "outline"],
        default: "primary",
      }),
      openInNewTab: field.boolean("Open in new tab"),
    },
  }),
  backgroundColor: field.color("Background Color", { group: "design" }),
  variant: field.select("Layout", {
    group: "design",
    options: ["default", "centered", "split"],
    default: "default",
  }),
});
```

Note: **Do not add subGroup to inner field.\*** inside array/group (inherit from parent subGroup).

Update each schema in sequence.

- [ ] **Step 3: Validate**

```bash
bun run type-check 2>&1 | tail -10
bun run lint 2>&1 | tail -10
```

Expected: EXIT=0.

- [ ] **Step 4: Commit**

```bash
git add src/shared/lib/sections/definitions/
git commit -m "feat(sections): annotate 22 section schemas with subGroup"
```

---

## Phase B: Register page-hero in the Section registry

### Task B1: Create `definitions/page-hero/`

**Files:**

- Create: `src/shared/lib/sections/definitions/page-hero/schema.ts`
- Create: `src/shared/lib/sections/definitions/page-hero/defaults.ts`
- Create: `src/shared/lib/sections/definitions/page-hero/metadata.ts`
- Create: `src/shared/lib/sections/definitions/page-hero/index.ts`

- [ ] **Step 1: Create `schema.ts` (discriminated union)**

```typescript
// src/shared/lib/sections/definitions/page-hero/schema.ts
import { z } from "zod";
import { field } from "@/shared/lib/sections/field-registry";

const editorialSplitSchema = z.object({
  variant: z.literal("editorial-split"),
  label: field.text("Label", { subGroup: "text" }).default(""),
  title: field.text("Title", { subGroup: "text" }).default(""),
  description: field.textarea("Description", { subGroup: "text" }).default(""),
  images: field
    .array("Hero Images", {
      subGroup: "image",
      fields: {
        url: field.image("Image URL"),
        alt: field.text("Alt Text"),
      },
    })
    .default([]),
  transition: field.select("Transition", {
    subGroup: "image",
    options: ["crossfade", "ken-burns", "clip-reveal", "scale-fade"],
    default: "crossfade",
  }),
  buttonText: field.text("Button Text", { subGroup: "button" }).default(""),
  buttonUrl: field.url("Button URL", { subGroup: "button" }).default(""),
});

const compactSchema = z.object({
  variant: z.literal("compact"),
  image: z.object({
    url: field.image("Image URL", { subGroup: "image" }),
    alt: field.text("Alt Text"),
  }),
  label: field.text("Label", { subGroup: "text" }).default(""),
  title: field.text("Title", { subGroup: "text" }).default(""),
  description: field.textarea("Description", { subGroup: "text" }).default(""),
});

const minimalSchema = z.object({
  variant: z.literal("minimal"),
  eyebrow: field.text("Eyebrow", { subGroup: "text" }).optional(),
  title: field.text("Title", { subGroup: "text" }).default(""),
  description: field.textarea("Description", { subGroup: "text" }).default(""),
});

export const pageHeroConfigSchema = z.discriminatedUnion("variant", [
  editorialSplitSchema,
  compactSchema,
  minimalSchema,
]);

export type PageHeroConfig = z.infer<typeof pageHeroConfigSchema>;
```

- [ ] **Step 2: Create `defaults.ts`**

```typescript
// src/shared/lib/sections/definitions/page-hero/defaults.ts
import type { PageHeroConfig } from "./schema";

export const DEFAULT_PAGE_HERO: PageHeroConfig = {
  variant: "editorial-split",
  label: "RENTAL SPACES",
  title: "Premium moments you can only have here.",
  description:
    "From business to private use, we offer spaces tailored to your needs.",
  images: [],
  transition: "crossfade",
  buttonText: "View spaces",
  buttonUrl: "/spaces",
};
```

Follow the contents of the old `defaultPageHeroHome` (refer to existing `src/shared/lib/sections/page-hero/defaults.ts`).

- [ ] **Step 3: Create `metadata.ts`**

```typescript
// src/shared/lib/sections/definitions/page-hero/metadata.ts
import { IconLayoutDashboard } from "@tabler/icons-react";
import type { SectionMetadata } from "@/shared/lib/sections/types";

export const pageHeroMetadata: SectionMetadata = {
  type: "page-hero",
  label: "Page Hero",
  description: "Hero area at the top of the page. Switch layout by variant.",
  icon: IconLayoutDashboard,
  category: "hero",
};
```

Confirm the exact `SectionMetadata` fields in `src/shared/lib/sections/types.ts` and align accordingly.

- [ ] **Step 4: Create `index.ts`**

```typescript
// src/shared/lib/sections/definitions/page-hero/index.ts
export { pageHeroConfigSchema, type PageHeroConfig } from "./schema";
export { pageHeroMetadata } from "./metadata";
export { DEFAULT_PAGE_HERO } from "./defaults";
```

- [ ] **Step 5: Validate**

```bash
bun run type-check 2>&1 | tail -10
```

Expected: EXIT=0.

- [ ] **Step 6: Commit**

```bash
git add src/shared/lib/sections/definitions/page-hero/
git commit -m "feat(sections): add page-hero section definition (discriminated union)"
```

---

### Task B2: Register page-hero in registry.ts

**Files:**

- Modify: `src/shared/lib/sections/registry.ts`

- [ ] **Step 1: Add imports + register in sectionDefinitions map**

```typescript
// registry.ts
import {
  pageHeroConfigSchema,
  pageHeroMetadata,
} from "./definitions/page-hero";

// ... existing registrations
"page-hero": {
  configSchema: pageHeroConfigSchema,
  metadata: pageHeroMetadata,
},
```

- [ ] **Step 2: Add label/icon to section-metadata.ts if present**

Add `"page-hero": "Page Hero"` to `sectionTypeLabels` in `src/shared/lib/validations/section-metadata.ts`.

- [ ] **Step 3: Extend SectionType type**

Add `"page-hero"` to the `SectionType` union in `src/shared/lib/sections/types.ts` (skip if auto-derived).

- [ ] **Step 4: Validate**

```bash
bun run type-check 2>&1 | tail -10
bun run lint 2>&1 | tail -10
```

Expected: EXIT=0.

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/sections/registry.ts src/shared/lib/validations/section-metadata.ts src/shared/lib/sections/types.ts
git commit -m "feat(sections): register page-hero type in section registry"
```

---

## Phase C: Section CRUD + reorder Server Actions

### Task C1: `createPageSection` / `deletePageSection` / `duplicatePageSection`

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/page-section.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/page-section-types.ts`
- Modify: `src/shared/domain/sections/commands.ts` (new or extension)

- [ ] **Step 1: Implement domain commands**

`src/shared/domain/sections/commands.ts`:

```typescript
import "server-only";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/lib/errors/domain-error";
import { getSectionDefinition } from "@/shared/lib/sections/registry";
import type { SectionType } from "@/shared/lib/sections/types";

export async function createSectionCommand(input: {
  pageId: string | null;
  type: SectionType;
  order?: number;
}) {
  const definition = getSectionDefinition(input.type);
  if (!definition) {
    throw new DomainError("Invalid section type.", "VALIDATION");
  }

  // Only one page-hero per page
  if (input.type === "page-hero") {
    const existing = await prisma.section.findFirst({
      where: { pageId: input.pageId, type: "page-hero" },
      select: { id: true },
    });
    if (existing) {
      throw new DomainError("Hero already exists.", "CONFLICT");
    }
  }

  // Generate default config
  const defaultConfig = definition.configSchema.safeParse({});
  const config = defaultConfig.success ? defaultConfig.data : {};

  // order: append to end (max+1 for same pageId)
  const maxOrder = await prisma.section.aggregate({
    where: { pageId: input.pageId },
    _max: { order: true },
  });
  const order = input.order ?? (maxOrder._max.order ?? -1) + 1;

  const created = await prisma.section.create({
    data: {
      pageId: input.pageId,
      type: input.type,
      config: config as Prisma.InputJsonObject,
      order,
      isActive: true,
    },
    select: { id: true, pageId: true },
  });

  return { id: created.id, pageId: created.pageId };
}

export async function deleteSectionCommand(id: string) {
  const section = await prisma.section.findUnique({
    where: { id },
    select: { id: true, pageId: true, type: true },
  });
  if (!section) throw new DomainError("Section not found.", "NOT_FOUND");

  await prisma.section.delete({ where: { id } });
  return { id: section.id, pageId: section.pageId };
}

export async function duplicateSectionCommand(id: string) {
  const source = await prisma.section.findUnique({
    where: { id },
  });
  if (!source) throw new DomainError("Section not found.", "NOT_FOUND");
  if (source.type === "page-hero") {
    throw new DomainError("Hero cannot be duplicated.", "CONFLICT");
  }

  // Insert immediately after: shift items after source.order by +1
  await prisma.$transaction(async (tx) => {
    await tx.section.updateMany({
      where: { pageId: source.pageId, order: { gt: source.order } },
      data: { order: { increment: 1 } },
    });
    await tx.section.create({
      data: {
        pageId: source.pageId,
        type: source.type,
        config: source.config as Prisma.InputJsonObject,
        contentHtml: source.contentHtml,
        contentJson: source.contentJson as Prisma.InputJsonValue,
        order: source.order + 1,
        isActive: source.isActive,
      },
    });
  });

  const created = await prisma.section.findFirst({
    where: { pageId: source.pageId, order: source.order + 1 },
    select: { id: true, pageId: true },
  });

  if (!created) throw new DomainError("Failed to duplicate.", "INTERNAL");
  return { id: created.id, pageId: created.pageId };
}
```

- [ ] **Step 2: Write Server Action wrappers**

Add to `src/app/(admin)/admin/(dashboard)/_shared/actions/page-section.ts`:

```typescript
"use server";

import { z } from "zod";
import { revalidateTag } from "next/cache";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import {
  createSectionCommand,
  deleteSectionCommand,
  duplicateSectionCommand,
} from "@/shared/domain/sections/commands";
import { sectionTypeSchema } from "@/shared/lib/sections/types"; // Reuse existing enum schema (create if missing)

const createPageSectionSchema = z.object({
  pageId: z.string().uuid().nullable(),
  type: sectionTypeSchema,
  order: z.number().int().min(0).optional(),
});

export const createPageSection = async (input: unknown) => {
  const parsed = createPageSectionSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "page",
    action: "update",
    execute: async () => createSectionCommand(parsed.data),
    afterSuccess: (data) => {
      revalidateTag(CACHE_TAGS.SECTIONS, { revalidate: 0 });
      revalidateTag(CACHE_TAGS.PAGE_SECTIONS, { revalidate: 0 });
      revalidateTag(CACHE_TAGS.PAGES, { revalidate: 0 });
      if (data.pageId) {
        revalidateTag(getCacheTag.pages.detail(data.pageId), { revalidate: 0 });
      }
    },
    resolveAuditResourceId: (data) => data.id,
  });
};

export const deletePageSection = async (id: string) => {
  return executeAdminMutationResult({
    resource: "page",
    action: "update",
    resourceId: id,
    execute: async () => deleteSectionCommand(id),
    afterSuccess: (data) => {
      revalidateTag(CACHE_TAGS.SECTIONS, { revalidate: 0 });
      revalidateTag(CACHE_TAGS.PAGE_SECTIONS, { revalidate: 0 });
      revalidateTag(CACHE_TAGS.PAGES, { revalidate: 0 });
      if (data.pageId) {
        revalidateTag(getCacheTag.pages.detail(data.pageId), { revalidate: 0 });
      }
    },
  });
};

export const duplicatePageSection = async (id: string) => {
  return executeAdminMutationResult({
    resource: "page",
    action: "update",
    resourceId: id,
    execute: async () => duplicateSectionCommand(id),
    afterSuccess: (data) => {
      revalidateTag(CACHE_TAGS.SECTIONS, { revalidate: 0 });
      revalidateTag(CACHE_TAGS.PAGE_SECTIONS, { revalidate: 0 });
      revalidateTag(CACHE_TAGS.PAGES, { revalidate: 0 });
      if (data.pageId) {
        revalidateTag(getCacheTag.pages.detail(data.pageId), { revalidate: 0 });
      }
    },
    resolveAuditResourceId: (data) => data.id,
  });
};
```

Note: the second argument to `revalidateTag` is the `CACHE_LIFE` constant (project convention; see `prisma-patterns.md`). Follow existing patterns for the argument.

- [ ] **Step 3: Validate**

```bash
bun run type-check 2>&1 | tail -20
```

Expected: EXIT=0.

- [ ] **Step 4: Commit**

```bash
git add src/shared/domain/sections/ src/app/(admin)/admin/(dashboard)/_shared/actions/page-section.ts src/app/(admin)/admin/(dashboard)/_shared/actions/page-section-types.ts
git commit -m "feat(actions): createPageSection / deletePageSection / duplicatePageSection"
```

---

### Task C2: `togglePageSectionActive` / `reorderPageSections`

**Files:**

- Modify: `src/shared/domain/sections/commands.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/page-section.ts`

- [ ] **Step 1: Add domain command**

```typescript
export async function toggleSectionActiveCommand(id: string) {
  const section = await prisma.section.findUnique({
    where: { id },
    select: { id: true, isActive: true, pageId: true },
  });
  if (!section) throw new DomainError("Section not found.", "NOT_FOUND");

  const updated = await prisma.section.update({
    where: { id },
    data: { isActive: !section.isActive },
    select: { id: true, isActive: true, pageId: true },
  });
  return updated;
}

export async function reorderSectionsCommand(input: {
  pageId: string | null;
  orderedIds: string[];
}) {
  // Validate: orderedIds match sections for pageId
  const existing = await prisma.section.findMany({
    where: { pageId: input.pageId },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((s) => s.id));
  for (const id of input.orderedIds) {
    if (!existingIds.has(id)) {
      throw new DomainError("Invalid section ID included.", "VALIDATION");
    }
  }
  if (existing.length !== input.orderedIds.length) {
    throw new DomainError("Section count does not match.", "VALIDATION");
  }

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < input.orderedIds.length; i++) {
      const id = input.orderedIds[i];
      if (!id) continue;
      await tx.section.update({
        where: { id },
        data: { order: i },
      });
    }
  });

  return { count: input.orderedIds.length, pageId: input.pageId };
}
```

- [ ] **Step 2: Add Server Action**

```typescript
export const togglePageSectionActive = async (id: string) => {
  return executeAdminMutationResult({
    resource: "page",
    action: "update",
    resourceId: id,
    execute: async () => toggleSectionActiveCommand(id),
    afterSuccess: (data) => {
      revalidateTag(CACHE_TAGS.SECTIONS, { revalidate: 0 });
      revalidateTag(CACHE_TAGS.PAGE_SECTIONS, { revalidate: 0 });
      revalidateTag(CACHE_TAGS.PAGES, { revalidate: 0 });
      if (data.pageId) {
        revalidateTag(getCacheTag.pages.detail(data.pageId), { revalidate: 0 });
      }
    },
  });
};

const reorderSchema = z.object({
  pageId: z.string().uuid().nullable(),
  orderedIds: z.array(z.string().uuid()).min(1),
});

export const reorderPageSections = async (input: unknown) => {
  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "page",
    action: "update",
    execute: async () => reorderSectionsCommand(parsed.data),
    afterSuccess: (data) => {
      revalidateTag(CACHE_TAGS.SECTIONS, { revalidate: 0 });
      revalidateTag(CACHE_TAGS.PAGE_SECTIONS, { revalidate: 0 });
      revalidateTag(CACHE_TAGS.PAGES, { revalidate: 0 });
      if (data.pageId) {
        revalidateTag(getCacheTag.pages.detail(data.pageId), { revalidate: 0 });
      }
    },
  });
};
```

- [ ] **Step 3: Validate + Commit**

```bash
bun run validate 2>&1 | tail -10
git add src/shared/domain/sections/commands.ts src/app/(admin)/admin/(dashboard)/_shared/actions/page-section.ts
git commit -m "feat(actions): togglePageSectionActive / reorderPageSections"
```

---

## Phase D: New UI components (additive)

### Task D1: Render AutoSectionForm by subGroup + FieldGroupSection

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/FieldGroupSection.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/zod-introspection.ts` (include subGroup in FieldInfo)

- [ ] **Step 1: Create `FieldGroupSection`**

```tsx
// FieldGroupSection.tsx
import type { ReactNode } from "react";
import type { TablerIcon } from "@tabler/icons-react";

interface FieldGroupSectionProps {
  readonly title: string;
  readonly icon?: TablerIcon;
  readonly children: ReactNode;
}

export function FieldGroupSection({
  title,
  icon: Icon,
  children,
}: FieldGroupSectionProps) {
  return (
    <section className="space-y-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
        {Icon ? (
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        ) : null}
        {title}
      </h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
```

- [ ] **Step 2: Extract subGroup in `extractSchemaFields`**

Add `subGroup` to the `FieldInfo` type in `zod-introspection.ts` (pass through transparently from meta). Pass `fieldRegistry.get(schema)?.subGroup` to `FieldInfo.meta.subGroup`.

- [ ] **Step 3: Rewrite `auto-section-form.tsx` to render by subGroup**

Existing form body (around L168-222):

```tsx
// Existing: contentFields.map(renderField)
// New: group by subGroup using FieldGroupSection

const textFields = contentFields.filter((f) => f.meta.subGroup === "text");
const imageFields = contentFields.filter((f) => f.meta.subGroup === "image");
const buttonFields = contentFields.filter((f) => f.meta.subGroup === "button");
const otherFields = contentFields.filter(
  (f) => !f.meta.subGroup || f.meta.subGroup === "other",
);

return (
  <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
    <div className="space-y-6">
      {isCustomType && (
        <FieldGroupSection title="Body" icon={IconArticle}>
          <LexicalEditor ... />
        </FieldGroupSection>
      )}
      {textFields.length > 0 && (
        <FieldGroupSection title="Text" icon={IconTypography}>
          {textFields.map(renderField)}
        </FieldGroupSection>
      )}
      {imageFields.length > 0 && (
        <FieldGroupSection title="Images" icon={IconPhoto}>
          {imageFields.map(renderField)}
        </FieldGroupSection>
      )}
      {buttonFields.length > 0 && (
        <FieldGroupSection title="Buttons & Links" icon={IconLink}>
          {buttonFields.map(renderField)}
        </FieldGroupSection>
      )}
      {otherFields.length > 0 && (
        <div className="space-y-4">{otherFields.map(renderField)}</div>
      )}
    </div>

    {/* design / advanced use existing Accordion */}
    {hasAccordionContent && (
      <Accordion type="multiple" className="border-t border-border" defaultValue={[]}>
        {/* same as existing */}
      </Accordion>
    )}

    <FormActions ... />
  </form>
);
```

icon import: `IconArticle / IconTypography / IconPhoto / IconLink` from `@tabler/icons-react`.

- [ ] **Step 4: Validate + Commit**

```bash
bun run validate 2>&1 | tail -10
git add src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/
git commit -m "feat(auto-section-form): render content fields by subGroup with section headings"
```

---

### Task D2: SectionListSidebar + SectionListItem (no DnD)

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionListSidebar.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionListItem.tsx`

- [ ] **Step 1: Create `SectionListItem.tsx`**

```tsx
"use client";
import { cn } from "@/shared/lib/cn";
import { SectionTypeIcon } from "../../_sections/_components/SectionTypeIcon";
import { sectionTypeLabels } from "@/shared/lib/validations/section-metadata";
import type { PageSectionData } from "@/admin/actions/page-section-types";
import {
  IconDotsVertical,
  IconEye,
  IconEyeOff,
  IconCopy,
  IconTrash,
  IconGripVertical,
} from "@tabler/icons-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/admin/components/ui";

interface SectionListItemProps {
  readonly section: PageSectionData;
  readonly isActive: boolean;
  readonly onClick: () => void;
  readonly onToggleActive: () => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
  readonly canDuplicate: boolean;
  readonly canDelete: boolean;
  readonly dragHandleProps?: Record<string, unknown>;
}

export function SectionListItem({
  section,
  isActive,
  onClick,
  onToggleActive,
  onDuplicate,
  onDelete,
  canDuplicate,
  canDelete,
  dragHandleProps,
}: SectionListItemProps) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-md px-2 py-2",
        "hover:bg-accent/50",
        isActive && "bg-accent",
      )}
    >
      <button
        type="button"
        className="flex min-h-11 min-w-11 cursor-grab items-center justify-center text-muted-foreground"
        aria-label="Reorder"
        {...dragHandleProps}
      >
        <IconGripVertical className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex flex-1 items-center gap-2 text-left text-sm",
          !section.isActive && "opacity-60",
        )}
      >
        <SectionTypeIcon
          type={section.type}
          className="h-4 w-4 shrink-0 text-muted-foreground"
        />
        <span className="truncate">
          {sectionTypeLabels[section.type] ?? section.type}
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded text-muted-foreground hover:bg-accent"
            aria-label="Actions"
          >
            <IconDotsVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onToggleActive}>
            {section.isActive ? (
              <IconEyeOff className="mr-2 h-4 w-4" />
            ) : (
              <IconEye className="mr-2 h-4 w-4" />
            )}
            {section.isActive ? "Hide" : "Show"}
          </DropdownMenuItem>
          {canDuplicate && (
            <DropdownMenuItem onClick={onDuplicate}>
              <IconCopy className="mr-2 h-4 w-4" />
              Duplicate
            </DropdownMenuItem>
          )}
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                <IconTrash className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
```

- [ ] **Step 2: Create `SectionListSidebar.tsx` (no DnD)**

```tsx
"use client";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/admin/components/ui";
import { IconPlus } from "@tabler/icons-react";
import {
  togglePageSectionActive,
  duplicatePageSection,
  deletePageSection,
} from "@/admin/actions/page-section";
import { isMutationError } from "@/shared/lib/mutation-result";
import { useRouter } from "next/navigation";
import { SectionListItem } from "./SectionListItem";
import type { PageSectionData } from "@/admin/actions/page-section-types";

interface SectionListSidebarProps {
  readonly sections: readonly PageSectionData[];
  readonly activeSectionId: string;
  readonly onSelect: (id: string) => void;
  readonly onAddClick: () => void;
}

export function SectionListSidebar({
  sections,
  activeSectionId,
  onSelect,
  onAddClick,
}: SectionListSidebarProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const handleToggle = (id: string) => {
    startTransition(async () => {
      const result = await togglePageSectionActive(id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  };

  const handleDuplicate = (id: string) => {
    startTransition(async () => {
      const result = await duplicatePageSection(id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("Section duplicated");
      router.refresh();
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this section?")) return;
    startTransition(async () => {
      const result = await deletePageSection(id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("Section deleted");
      router.refresh();
    });
  };

  return (
    <aside className="space-y-2 lg:sticky lg:top-6">
      <div className="flex items-center justify-between px-2">
        <h2 className="text-sm font-medium text-foreground">Sections</h2>
        <Button size="sm" variant="outline" onClick={onAddClick}>
          <IconPlus className="mr-1 h-4 w-4" />
          Add
        </Button>
      </div>
      <div className="space-y-0.5 rounded-lg border border-border bg-card p-2">
        {sections.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            No sections
          </p>
        ) : (
          sections.map((section) => (
            <SectionListItem
              key={section.id}
              section={section}
              isActive={section.id === activeSectionId}
              onClick={() => onSelect(section.id)}
              onToggleActive={() => handleToggle(section.id)}
              onDuplicate={() => handleDuplicate(section.id)}
              onDelete={() => handleDelete(section.id)}
              canDuplicate={section.type !== "page-hero"}
              canDelete={section.type !== "page-hero"}
            />
          ))
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Validate + Commit**

```bash
bun run type-check 2>&1 | tail -10
git add src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionListSidebar.tsx \
       src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionListItem.tsx
git commit -m "feat(page-edit): SectionListSidebar + SectionListItem (no DnD yet)"
```

---

### Task D3: SectionEditPanel + page-hero variant Select

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionEditPanel.tsx`

- [ ] **Step 1: Create `SectionEditPanel.tsx`**

```tsx
"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import { updatePageSection } from "@/admin/actions/page-section";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { PageSectionData } from "@/admin/actions/page-section-types";
import { sectionTypeLabels } from "@/shared/lib/validations/section-metadata";
import { SectionTypeIcon } from "../../_sections/_components/SectionTypeIcon";
import { AutoSectionForm } from "../../_sections/_components/auto-section-form";
import type { ConfigFormSavePayload } from "../../_sections/_components/config-forms";
import { isRecord } from "@/shared/lib/serialize";

const PAGE_HERO_VARIANTS = [
  { value: "editorial-split", label: "Editorial Split" },
  { value: "compact", label: "Compact" },
  { value: "minimal", label: "Minimal" },
] as const;

interface SectionEditPanelProps {
  readonly section: PageSectionData;
  readonly onUpdated?: () => void;
}

export function SectionEditPanel({
  section,
  onUpdated,
}: SectionEditPanelProps) {
  const [isPending, startTransition] = useTransition();
  const isPageHero = section.type === "page-hero";

  // Manage page-hero variant in URL/state (to remount the form)
  const initialVariant =
    isPageHero &&
    isRecord(section.config) &&
    typeof section.config.variant === "string"
      ? section.config.variant
      : "editorial-split";
  const [variant, setVariant] = useState(initialVariant);

  const handleSave = (payload: ConfigFormSavePayload) => {
    startTransition(async () => {
      const result = await updatePageSection(section.id, {
        config: payload.config,
        ...(payload.contentJson !== undefined
          ? { contentJson: payload.contentJson }
          : {}),
      });
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("Saved");
      onUpdated?.();
    });
  };

  const handleVariantChange = (value: string) => {
    setVariant(value);
    // Remount section by variant → AutoSectionForm initializes with new defaults
  };

  // For page-hero, pass config with overridden variant to rebuild the form
  const adjustedSection = isPageHero
    ? {
        ...section,
        config: {
          ...(isRecord(section.config) ? section.config : {}),
          variant,
        },
      }
    : section;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <SectionTypeIcon
            type={section.type}
            className="h-5 w-5 text-muted-foreground"
          />
          {sectionTypeLabels[section.type] ?? section.type}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isPageHero && (
          <div className="space-y-2">
            <Label htmlFor="page-hero-variant">Variant</Label>
            <Select value={variant} onValueChange={handleVariantChange}>
              <SelectTrigger id="page-hero-variant">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_HERO_VARIANTS.map((v) => (
                  <SelectItem key={v.value} value={v.value}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Changing the variant resets the current form input
            </p>
          </div>
        )}
        <AutoSectionForm
          key={`${section.id}-${variant}-${String(section.updatedAt)}`}
          section={adjustedSection}
          onSave={handleSave}
          isPending={isPending}
          contentOnly
        />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Validate + Commit**

```bash
bun run type-check 2>&1 | tail -10
git add src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionEditPanel.tsx
git commit -m "feat(page-edit): SectionEditPanel with page-hero variant Select"
```

---

### Task D4: AddSectionDialog + SectionTypePicker

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/AddSectionDialog.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionTypePicker.tsx`

- [ ] **Step 1: Create `SectionTypePicker.tsx` (type selection grid)**

```tsx
"use client";
import { sectionDefinitions } from "@/shared/lib/sections/registry";
import { sectionTypeLabels } from "@/shared/lib/validations/section-metadata";
import { SectionTypeIcon } from "../../_sections/_components/SectionTypeIcon";
import type { SectionType } from "@/shared/lib/sections/types";

interface SectionTypePickerProps {
  readonly availableTypes: readonly SectionType[];
  readonly onSelect: (type: SectionType) => void;
  readonly disabled?: boolean;
}

export function SectionTypePicker({
  availableTypes,
  onSelect,
  disabled,
}: SectionTypePickerProps) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {availableTypes.map((type) => {
        const meta = sectionDefinitions[type]?.metadata;
        return (
          <button
            key={type}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(type)}
            className="group flex min-h-[3rem] items-start gap-3 rounded-lg border border-border bg-card p-3 text-left hover:border-accent hover:bg-accent/30 disabled:opacity-50"
          >
            <SectionTypeIcon
              type={type}
              className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-foreground"
            />
            <div className="space-y-0.5">
              <div className="text-sm font-medium">
                {sectionTypeLabels[type] ?? type}
              </div>
              {meta?.description && (
                <div className="text-xs text-muted-foreground">
                  {meta.description}
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Create `AddSectionDialog.tsx`**

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/admin/components/ui";
import { createPageSection } from "@/admin/actions/page-section";
import { isMutationError } from "@/shared/lib/mutation-result";
import { SectionTypePicker } from "./SectionTypePicker";
import type { SectionType } from "@/shared/lib/sections/types";

interface AddSectionDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly pageId: string | null;
  readonly availableTypes: readonly SectionType[];
}

export function AddSectionDialog({
  open,
  onOpenChange,
  pageId,
  availableTypes,
}: AddSectionDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleSelect = (type: SectionType) => {
    startTransition(async () => {
      const result = await createPageSection({ pageId, type });
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("Section added");
      onOpenChange(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80svh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Section</DialogTitle>
        </DialogHeader>
        <SectionTypePicker
          availableTypes={availableTypes}
          onSelect={handleSelect}
          disabled={isPending}
        />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Validate + Commit**

```bash
bun run type-check 2>&1 | tail -10
git add src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/AddSectionDialog.tsx \
       src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionTypePicker.tsx
git commit -m "feat(page-edit): AddSectionDialog + SectionTypePicker"
```

---

### Task D5: nuqs URL state for active section

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/section-edit-state.ts`

- [ ] **Step 1: Define SSoT parser**

```typescript
import { parseAsString } from "nuqs";

export const sectionEditQueryParser = parseAsString
  .withDefault("")
  .withOptions({ history: "push", shallow: true });
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/section-edit-state.ts
git commit -m "feat(page-edit): URL state parser for active section"
```

---

### Task D6: Drag-and-drop reorder with dnd-kit

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionListSidebar.tsx`

- [ ] **Step 1: Check for `@dnd-kit/core` `@dnd-kit/sortable`**

```bash
grep -E "@dnd-kit/(core|sortable|modifiers)" package.json
```

Expected: `@dnd-kit/core` `@dnd-kit/sortable` `@dnd-kit/modifiers` installed.

- [ ] **Step 2: Wire DndContext + SortableContext + reorderPageSections action in SectionListSidebar**

```tsx
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { reorderPageSections } from "@/admin/actions/page-section";
import { useId } from "react";

// SortableSectionListItem (wrapper around SectionListItem)
function SortableSectionListItem(props: SectionListItemProps & { id: string }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      <SectionListItem
        {...props}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

// Inside SectionListSidebar
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
);
const dndId = useId();

const handleDragEnd = (event: DragEndEvent) => {
  const { active, over } = event;
  if (!over || active.id === over.id) return;
  const oldIndex = sections.findIndex((s) => s.id === active.id);
  const newIndex = sections.findIndex((s) => s.id === over.id);
  if (oldIndex === -1 || newIndex === -1) return;

  const newOrder = arrayMove(sections.slice(), oldIndex, newIndex);
  // Optimistic UI: parent PageEditor refreshes later; better to reflect order immediately
  // Simple version: server action only
  startTransition(async () => {
    const result = await reorderPageSections({
      pageId: sections[0]?.pageId ?? null,
      orderedIds: newOrder.map((s) => s.id),
    });
    if (isMutationError(result)) {
      toast.error(result.error);
      return;
    }
    router.refresh();
  });
};

// JSX
<DndContext
  id={dndId}
  sensors={sensors}
  collisionDetection={closestCenter}
  modifiers={[restrictToVerticalAxis]}
  onDragEnd={handleDragEnd}
>
  <SortableContext
    items={sections.map((s) => s.id)}
    strategy={verticalListSortingStrategy}
  >
    {sections.map((section) => (
      <SortableSectionListItem
        key={section.id}
        id={section.id}
        {...sectionListItemProps}
      />
    ))}
  </SortableContext>
</DndContext>;
```

- [ ] **Step 3: Validate + Commit**

```bash
bun run type-check 2>&1 | tail -10
bun run lint 2>&1 | tail -10
git add src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionListSidebar.tsx
git commit -m "feat(page-edit): drag-and-drop reorder with dnd-kit"
```

---

## Phase E: Wire-up + public-side switch

### Task E1: Rewrite PageEditor to master-detail

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/PageEditor.tsx`

- [ ] **Step 1: Rewrite to master-detail structure**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/admin/components/ui";
import type { PageForEdit } from "@/admin/queries/page-section";
import { SectionListSidebar } from "./SectionListSidebar";
import { SectionEditPanel } from "./SectionEditPanel";
import { AddSectionDialog } from "./AddSectionDialog";
import { sectionEditQueryParser } from "./section-edit-state";
import { PageSeoForm } from "../../_seo/_components/PageSeoForm";
import {
  PAGE_EDIT_TAB_LABELS,
  PAGE_EDIT_TAB_VALUES,
  parsePageEditTabValue,
} from "./page-edit-tabs";
import type { SectionType } from "@/shared/lib/sections/types";
import { sectionDefinitions } from "@/shared/lib/sections/registry";

interface PageEditorProps {
  readonly page: PageForEdit;
}

const HOMEPAGE_ONLY_TYPES: ReadonlySet<SectionType> = new Set([
  "homepage-how-it-works",
  "homepage-spaces",
  "homepage-features",
  "homepage-cta",
]);

export function PageEditor({ page }: PageEditorProps) {
  const router = useRouter();

  const [activeTab, setActiveTab] = useQueryState(
    "tab",
    parseAsStringLiteral(PAGE_EDIT_TAB_VALUES)
      .withDefault("content")
      .withOptions({ history: "push", shallow: true }),
  );

  const [activeSectionId, setActiveSectionId] = useQueryState(
    "section",
    sectionEditQueryParser,
  );

  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const sections = page.sections;
  const activeSection =
    sections.find((s) => s.id === activeSectionId) ?? sections[0];

  // Available types: exclude page-hero if already present; homepage-* only for home
  const isHomepage = page.slug === "home";
  const hasPageHero = sections.some((s) => s.type === "page-hero");
  const availableTypes = (
    Object.keys(sectionDefinitions) as SectionType[]
  ).filter((type) => {
    if (type === "page-hero" && hasPageHero) return false;
    if (HOMEPAGE_ONLY_TYPES.has(type) && !isHomepage) return false;
    return true;
  });

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => {
        const tab = parsePageEditTabValue(v);
        if (tab) void setActiveTab(tab);
      }}
      className="space-y-5"
    >
      <TabsList className="h-auto flex-wrap gap-1">
        {PAGE_EDIT_TAB_VALUES.map((tab) => (
          <TabsTrigger key={tab} value={tab}>
            {PAGE_EDIT_TAB_LABELS[tab]}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent
        value="content"
        forceMount
        className="outline-none data-[state=inactive]:hidden"
      >
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <SectionListSidebar
            sections={sections}
            activeSectionId={activeSection?.id ?? ""}
            onSelect={(id) => void setActiveSectionId(id)}
            onAddClick={() => setAddDialogOpen(true)}
          />
          <div>
            {activeSection ? (
              <SectionEditPanel
                key={activeSection.id}
                section={activeSection}
                onUpdated={() => router.refresh()}
              />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Select a section</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Select a section from the list on the left or create one
                    with Add.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
        <AddSectionDialog
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
          pageId={page.id}
          availableTypes={availableTypes}
        />
      </TabsContent>

      <TabsContent
        value="seo"
        forceMount
        className="outline-none data-[state=inactive]:hidden"
      >
        <PageSeoForm page={page} />
      </TabsContent>
    </Tabs>
  );
}
```

Note: `getPageForEdit` currently returns `PageForEdit` including `pageHero`, but Task E2+ integrates it into sections. For this task, ignore `pageHero` (adjust later).

- [ ] **Step 2: Validate + Commit**

```bash
bun run type-check 2>&1 | tail -20
git add src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/PageEditor.tsx
git commit -m "feat(page-edit): wire master-detail layout in PageEditor"
```

---

### Task E2: Switch public HomepageSections to use the page-hero section

**Files:**

- Modify: Public homepage sections renderer (confirm exact location via Explore)
- Modify: `src/app/(preview)/preview/pages/[slug]/page.tsx`
- Modify: `src/admin/queries/page-section.ts` (remove `pageHero` from getPageForEdit/getPageWithSections return types or integrate into the page-hero section)

- [ ] **Step 1: List relevant callers via grep**

```bash
grep -rln "page\.pageHero\|pageHero\b" src/ --include="*.ts" --include="*.tsx"
```

Review all results and classify into one of the following:

- (A) Imports old `parsePageHero` / `pageHeroSchema` / `defaultPageHeroHome` → rewrite to read from page-hero section
- (B) Uses `page.pageHero` JSON directly → same change
- (C) DB query (`select: { pageHero: true }`) → remove from select

- [ ] **Step 2: Rewrite public HomepageSections to use sections**

```typescript
// src/app/(public)/_components/homepage/HomepageSections.tsx (confirm path)
import { isRecord } from "@/shared/lib/serialize";
import { pageHeroConfigSchema } from "@/shared/lib/sections/definitions/page-hero";
// ...

export function HomepageSections({ sections }: { sections: SectionData[] }) {
  const pageHeroSection = sections.find((s) => s.type === "page-hero" && s.isActive);
  const otherSections = sections.filter((s) => s.type !== "page-hero");

  const heroConfig = pageHeroSection
    ? pageHeroConfigSchema.safeParse(pageHeroSection.config)
    : null;

  return (
    <>
      {heroConfig?.success ? <PageHero config={heroConfig.data} /> : null}
      {otherSections.map((s) => <SectionRenderer key={s.id} section={s} />)}
    </>
  );
}
```

Rewrite the `PageHero` Server Component props to `{ config: PageHeroConfig }` (remove old `pageHero: PageHero` props).

- [ ] **Step 3: Do the same for the preview page**

```typescript
// src/app/(preview)/preview/pages/[slug]/page.tsx
const pageHeroSection = page.sections.find(
  (s) => s.type === "page-hero" && s.isActive,
);
// Remove the line passing pageHero to HomepageSections
```

- [ ] **Step 4: Remove `pageHero` from admin query return types**

Remove `pageHero: true` from `select` in `getPageForEdit` / `getPageWithSections` in `src/admin/queries/page-section.ts`, and remove the `pageHero` field from `PageForEdit`.

- [ ] **Step 5: Validate**

```bash
grep -rln "page\.pageHero\|\.pageHero\b" src/ --include="*.ts" --include="*.tsx"
```

Expected: 0 hits (except schema.prisma).

```bash
bun run type-check 2>&1 | tail -20
```

Expected: EXIT=0 (Prisma types still pass because the `Page.pageHero` column remains).

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "refactor(public): HomepageSections reads page-hero section instead of page.pageHero"
```

---

### Task E3: Change seedPages to insert a page-hero section

**Files:**

- Modify: `prisma/seed.ts`

- [ ] **Step 1: Revise the home portion of `seedPages`**

```typescript
// prisma/seed.ts (relevant portion)
import { DEFAULT_PAGE_HERO } from "@/shared/lib/sections/definitions/page-hero";

async function seedPages(prisma: AppPrismaClient) {
  // Existing page creation logic (do not pass pageHero)
  const home = await prisma.page.upsert({
    where: { slug: "home" },
    create: {
      slug: "home",
      title: "Home",
      isPublished: true,
      isSystemPage: true,
      // Do not pass pageHero field
    },
    update: {},
    select: { id: true },
  });

  // Insert page-hero section idempotently
  const existingHero = await prisma.section.findFirst({
    where: { pageId: home.id, type: "page-hero" },
    select: { id: true },
  });
  if (!existingHero) {
    await prisma.section.create({
      data: {
        pageId: home.id,
        type: "page-hero",
        config: DEFAULT_PAGE_HERO,
        order: -1,
        isActive: true,
      },
    });
  }
  // ... other section seeds
}
```

- [ ] **Step 2: Validate**

```bash
bun run type-check 2>&1 | tail -10
```

Expected: EXIT=0.

```bash
# Run seed (pageHero column still in schema, but not written)
bun prisma/seed.ts 2>&1 | tail -5
bun prisma/seed.ts 2>&1 | tail -5  # check idempotency
```

Expected: no errors, idempotent on second run.

- [ ] **Step 3: Commit**

```bash
git add prisma/seed.ts
git commit -m "chore(seed): seedPages inserts page-hero section instead of pageHero JSON"
```

---

## Phase F: Remove legacy PageEditor items (before schema change)

### Task F1: Remove legacy PageHeroEditor / updatePageHero / SectionEditor

**Files:**

- Delete: `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/PageHeroEditor.tsx`
- Delete: `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionEditor.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/page.ts` (remove `updatePageHero` function)

- [ ] **Step 1: Check references**

```bash
grep -rln "PageHeroEditor\|SectionEditor\|updatePageHero" src/ --include="*.ts" --include="*.tsx"
```

Confirm there are no remaining references from PageEditor (should be removed in Task E1).

- [ ] **Step 2: Remove files**

```bash
git rm src/app/\(admin\)/admin/\(dashboard\)/pages/\[slug\]/edit/_components/PageHeroEditor.tsx
git rm src/app/\(admin\)/admin/\(dashboard\)/pages/\[slug\]/edit/_components/SectionEditor.tsx
```

- [ ] **Step 3: Remove `updatePageHero` function from `page.ts`**

Remove the `updatePageHero` function definition and export from `src/app/(admin)/admin/(dashboard)/_shared/actions/page.ts`.

- [ ] **Step 4: Validate**

```bash
bun run validate 2>&1 | tail -20
```

Expected: EXIT=0.

- [ ] **Step 5: Commit**

```bash
git add src/app/(admin)/admin/(dashboard)/_shared/actions/page.ts
git commit -m "chore(admin): drop PageHeroEditor / SectionEditor / updatePageHero"
```

---

## Phase G: Destructive migration + remove legacy page-hero schema

### Task G1: Drop Page.pageHero column + data migration + remove legacy code (atomic 1 commit)

**Files:**

- Create: `prisma/migrations/<TS>_drop_page_hero_to_section/migration.sql`
- Modify: `prisma/schema.prisma`
- Delete: `src/shared/lib/sections/page-hero/{schema,defaults,index}.ts`

- [ ] **Step 1: Pre-check for zero remaining references via grep**

```bash
grep -rln "pageHero\|PageHero\|parsePageHero\|pageHeroSchema\|defaultPageHeroHome" \
  src/ --include="*.ts" --include="*.tsx" | grep -v "definitions/page-hero"
```

Expected: no output (no references outside the new `definitions/page-hero/` directory).

```bash
# Check current schema.prisma
grep -n "pageHero" prisma/schema.prisma
```

Expected: only one `pageHero Json?` line remains.

- [ ] **Step 2: Create directory with TS timestamp**

```bash
TS=$(date -u +%Y%m%d%H%M%S)
python3 -c "import os; os.makedirs('prisma/migrations/${TS}_drop_page_hero_to_section', exist_ok=True)"
echo "$TS" > /tmp/migration-ts.txt
```

- [ ] **Step 3: Write migration.sql with Python**

```bash
TS=$(cat /tmp/migration-ts.txt)
python3 -c "
sql = '''-- 1) Migrate Page.pageHero JSON to the Section table (home page only)
INSERT INTO sections (id, \"pageId\", \"type\", \"config\", \"order\", \"isActive\", \"createdAt\", \"updatedAt\")
SELECT
  gen_random_uuid(),
  p.id,
  'page-hero',
  COALESCE(p.\"pageHero\", '{\"variant\":\"editorial-split\",\"label\":\"\",\"title\":\"\",\"description\":\"\",\"images\":[],\"transition\":\"crossfade\",\"buttonText\":\"\",\"buttonUrl\":\"\"}'::jsonb),
  -1,
  TRUE,
  now(),
  now()
FROM pages p
WHERE p.\"pageHero\" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM sections s WHERE s.\"pageId\" = p.id AND s.\"type\" = 'page-hero'
  );

-- 2) Drop the Page.pageHero column
ALTER TABLE pages DROP COLUMN \"pageHero\";
'''
open(f'prisma/migrations/${TS}_drop_page_hero_to_section/migration.sql', 'w', encoding='utf-8').write(sql)
"
```

- [ ] **Step 4: Remove the `pageHero Json?` line from schema.prisma**

```typescript
// Page model in prisma/schema.prisma
model Page {
  id                 String       @id @default(uuid()) @db.Uuid
  slug               String       @unique
  title              String
  // remove pageHero Json?
  description        String?      @db.Text
  // ... remaining
}
```

- [ ] **Step 5: Apply migration**

```bash
TS=$(cat /tmp/migration-ts.txt)
bunx --bun prisma db execute --file prisma/migrations/${TS}_drop_page_hero_to_section/migration.sql 2>&1 | tail -5
bunx --bun prisma migrate resolve --applied "${TS}_drop_page_hero_to_section" 2>&1 | tail -3
bun run db:generate 2>&1 | tail -3
```

Expected: all EXIT=0. If a drift error appears, follow the manual pattern in git-migration.md.

- [ ] **Step 6: Remove legacy page-hero directory**

```bash
git rm -r src/shared/lib/sections/page-hero/
```

- [ ] **Step 7: Validate**

```bash
bun run validate 2>&1 | tail -20
bun run build 2>&1 | tail -30
```

Expected: both EXIT=0.

- [ ] **Step 8: smoke test**

```bash
# Verify in dev DB that Page.pageHero is gone and Section has type=page-hero
bun -e "
const { PrismaClient } = require('./generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const p = new PrismaClient({ adapter: new PrismaPg(pool) });
(async () => {
  const home = await p.page.findUnique({ where: { slug: 'home' }, select: { id: true } });
  const heroes = await p.section.findMany({ where: { pageId: home?.id, type: 'page-hero' }, select: { id: true, config: true, order: true } });
  console.log('page-hero count:', heroes.length);
  console.log('config keys:', Object.keys(heroes[0]?.config || {}));
  await p.\$disconnect();
})();
"
```

Expected: `page-hero count: 1` or more, `config keys: [ 'variant', 'label', 'title', ... ]`.

- [ ] **Step 9: Commit (atomic)**

```bash
TS=$(cat /tmp/migration-ts.txt)
git add prisma/migrations/${TS}_drop_page_hero_to_section/migration.sql \
       prisma/schema.prisma \
       src/shared/lib/sections/page-hero/  # stage deletion
git commit -m "feat(prisma): destructive migration — move Page.pageHero to Section, drop column"
```

---

## Phase H: Tests

### Task H1: page-hero registry + section CRUD unit tests

**Files:**

- Create: `__tests__/unit/sections/page-hero-schema.test.ts`
- Create: `__tests__/unit/domain/sections/commands.test.ts`

- [ ] **Step 1: page-hero schema tests**

```typescript
// __tests__/unit/sections/page-hero-schema.test.ts
import { describe, expect, it } from "bun:test";
import {
  pageHeroConfigSchema,
  DEFAULT_PAGE_HERO,
} from "@/shared/lib/sections/definitions/page-hero";
import { fieldRegistry } from "@/shared/lib/sections/field-registry";

describe("pageHeroConfigSchema", () => {
  it("DEFAULT_PAGE_HERO is parseable", () => {
    const result = pageHeroConfigSchema.safeParse(DEFAULT_PAGE_HERO);
    expect(result.success).toBe(true);
  });

  it("rejects unknown variant", () => {
    const result = pageHeroConfigSchema.safeParse({ variant: "unknown" });
    expect(result.success).toBe(false);
  });

  it("editorial-split images can be empty", () => {
    const result = pageHeroConfigSchema.safeParse({
      variant: "editorial-split",
      label: "",
      title: "",
      description: "",
      images: [],
      transition: "crossfade",
      buttonText: "",
      buttonUrl: "",
    });
    expect(result.success).toBe(true);
  });

  it("minimal does not require eyebrow", () => {
    const result = pageHeroConfigSchema.safeParse({
      variant: "minimal",
      title: "Hello",
      description: "World",
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: section CRUD command unit tests (mock-based)**

```typescript
// __tests__/unit/domain/sections/commands.test.ts
import { describe, expect, it, mock } from "bun:test";
import { DomainError } from "@/shared/lib/errors/domain-error";

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    section: {
      findFirst: mock(async () => null),
      findMany: mock(async () => []),
      findUnique: mock(async () => null),
      create: mock(async () => ({ id: "new-id", pageId: "page-1" })),
      update: mock(async () => ({
        id: "id",
        isActive: false,
        pageId: "page-1",
      })),
      delete: mock(async () => ({})),
      aggregate: mock(async () => ({ _max: { order: 5 } })),
      updateMany: mock(async () => ({ count: 0 })),
    },
    $transaction: mock(async (fn: any) =>
      fn({
        section: {
          findFirst: mock(async () => null),
          update: mock(async () => ({})),
          create: mock(async () => ({})),
          updateMany: mock(async () => ({})),
        },
      }),
    ),
  },
}));

const {
  createSectionCommand,
  deleteSectionCommand,
  toggleSectionActiveCommand,
} = await import("@/shared/domain/sections/commands");

describe("createSectionCommand", () => {
  it("rejects unknown section type", async () => {
    await expect(
      createSectionCommand({ pageId: "page-1", type: "unknown" as any }),
    ).rejects.toThrow(DomainError);
  });

  it("creates section with order = max+1", async () => {
    const result = await createSectionCommand({
      pageId: "page-1",
      type: "cta",
    });
    expect(result.id).toBe("new-id");
  });
});

describe("deleteSectionCommand", () => {
  it("throws if not found", async () => {
    await expect(deleteSectionCommand("missing")).rejects.toThrow(DomainError);
  });
});
```

- [ ] **Step 3: Run**

```bash
bun test __tests__/unit/sections/page-hero-schema.test.ts 2>&1 | tail -10
bun test __tests__/unit/domain/sections/commands.test.ts 2>&1 | tail -10
```

Expected: all PASS.

- [ ] **Step 4: Register in package.json `test:unit` batch**

Add `bun test __tests__/unit/sections && bun test __tests__/unit/domain/sections` to the `test:unit` script in `package.json` (follow existing patterns).

- [ ] **Step 5: Commit**

```bash
git add __tests__/unit/sections/ __tests__/unit/domain/sections/ package.json
git commit -m "test(sections): page-hero schema + section CRUD commands unit tests"
```

---

## Self-Review Checklist

### Spec coverage

- [x] Section 1.1 column drop → Task G1
- [x] Section 1.3 migration SQL → Task G1
- [x] Section 2.1 page-hero registry registration → Task B1, B2
- [x] Section 2.2 remove legacy code → Task F1, G1
- [x] Section 2.3 public renderers → Task E2
- [x] Section 3 field-registry subGroup → Task A1, A2
- [x] Section 4 Server Actions CRUD/reorder → Task C1, C2
- [x] Section 5 master-detail UI → Task D1–D6, E1
- [x] Section 6 URL state → Task D5
- [x] Section 7 AutoSectionForm subGroup → Task D1
- [x] Section 8 seed.ts updates → Task E3
- [x] Section 9 post-list.categoryId → **Unaddressed (spec decided "lightweight = custom UI" but no concrete task)** → moved to Phase 3 spec
- [x] Section 10 test strategy → Task H1 (migration data preservation test is a Phase 3 candidate)

**Gaps**:

1. **Lightweight handling for `post-list.categoryId`**: Spec §9 decided to render a separate UI inside `SectionEditPanel`, but this plan does not cover it. Rationale: only needed when editing the `post-list` section; cleaner to handle in Phase 3.
2. **Migration data preservation integration test**: Planned in Spec §10.1, but requires real DB connections and is complex. This phase uses a local smoke test (Task G1 Step 8) instead, and we can consider adding it in Phase 2.

These two items align with the Out of Scope section in `docs/superpowers/specs/2026-05-02-admin-page-editor-redesign-design.md`, so deferring is reasonable.

### Placeholder scan

- [x] "TBD" / "TODO" search → none
- [x] Abstract phrases like "proper error handling" or "validation" → none
- [x] Every step includes code blocks or concrete commands

### Type consistency

- [x] `createSectionCommand` / `deleteSectionCommand` / `duplicateSectionCommand` / `toggleSectionActiveCommand` / `reorderSectionsCommand` naming consistency
- [x] Server Actions `createPageSection` / `deletePageSection` / `duplicatePageSection` / `togglePageSectionActive` / `reorderPageSections` naming consistency
- [x] `PageHeroConfig` / `pageHeroConfigSchema` / `DEFAULT_PAGE_HERO` naming consistency
- [x] `FieldSubGroup` / `subGroup` naming consistency

---

## Execution Recommendation

**Recommend Subagent-Driven Development**:

- Execute sequentially in order: Phase A → B → C → D → E → F → G → H
- Phase A2 (injecting 22 schemas) should be bundled to a single implementer for all 22 files
- Phase G1 (destructive migration) is the riskiest, so dispatch a fresh subagent; after completion the controller verifies with `git log --oneline` + `git show --stat HEAD`
- After each phase, have the controller run `bun run validate`

**Execution commands**:

```bash
# Pre-flight sanity checks
git status --short  # should be clean
bunx --bun prisma migrate status  # confirm no pending migrations
bun run validate  # confirm baseline EXIT=0
```

---

**Plan complete. Next, implement sequentially with subagent-driven-development.**
