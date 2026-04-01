# Dynamic Section Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 全公開ページをセクション単位で管理画面から編集可能にし、CLI が新セクションタイプを自由に追加できる動的セクションアーキテクチャを構築する。

**Architecture:** `SectionType` Prisma enum を `String` に変更し、`PageContent` モデルを廃止。ファイルベースのセクションレジストリ（1ディレクトリ = 1タイプ）に移行し、Zod スキーマの `field` ヘルパーメタデータから管理画面フォームを自動生成する。全10固定ページを `Page` + `Section` に統一。

**Tech Stack:** Next.js 16, Prisma 7, Zod 4, React 19, Tailwind CSS 4, Tabler Icons, bun:test

**Spec:** `docs/superpowers/specs/2026-03-31-dynamic-section-architecture-design.md`

---

## File Structure

### New Files

```
src/shared/lib/sections/
├── types.ts                    # SectionDefinition, SectionProps, SectionMetadata, FieldMeta 型
├── field-helpers.ts            # field.text(), field.select() 等の Zod + メタデータヘルパー
├── registry.ts                 # 全セクション定義集約、getSectionDefinition(), validateSectionConfig()
└── definitions/                # 1ディレクトリ = 1セクションタイプ
    ├── hero/
    │   ├── schema.ts
    │   └── metadata.ts
    ├── hero-parallax/
    │   ├── schema.ts
    │   └── metadata.ts
    ├── custom/
    │   ├── schema.ts
    │   └── metadata.ts
    ├── concept/
    │   ├── schema.ts
    │   └── metadata.ts
    ├── space-list/
    │   ├── schema.ts
    │   └── metadata.ts
    ├── space-showcase/
    │   ├── schema.ts
    │   └── metadata.ts
    ├── news-list/
    │   ├── schema.ts
    │   └── metadata.ts
    ├── post-list/
    │   ├── schema.ts
    │   └── metadata.ts
    ├── faq-list/
    │   ├── schema.ts
    │   └── metadata.ts
    ├── features/
    │   ├── schema.ts
    │   └── metadata.ts
    ├── testimonial/
    │   ├── schema.ts
    │   └── metadata.ts
    ├── gallery/
    │   ├── schema.ts
    │   └── metadata.ts
    ├── cta/
    │   ├── schema.ts
    │   └── metadata.ts
    ├── contact-form/
    │   ├── schema.ts
    │   └── metadata.ts
    ├── map/
    │   ├── schema.ts
    │   └── metadata.ts
    ├── embed/
    │   ├── schema.ts
    │   └── metadata.ts
    └── instagram/
        ├── schema.ts
        └── metadata.ts

src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/
├── auto-section-form.tsx       # Zod スキーマからフォーム自動生成
└── field-renderers.tsx         # 各 field タイプの UI レンダラー

__tests__/unit/domain/sections/
├── field-helpers.test.ts
├── registry.test.ts
└── auto-form-meta.test.ts
```

### Files to Delete

```
src/app/(public)/_shared/lib/content/schemas.ts
src/app/(public)/_shared/lib/content/types.ts
src/app/(public)/_shared/lib/content/defaults.ts
src/app/(public)/_shared/lib/content/queries.ts
src/app/(public)/_shared/lib/content/schemas/space-list.ts
src/shared/domain/page-content/queries.ts
src/app/(public)/_components/homepage/concept-section.tsx
src/app/(public)/_components/homepage/features-section.tsx
src/app/(public)/_components/homepage/hero-section.tsx
src/app/(admin)/.../_sections/_components/config-forms/ConceptConfigForm.tsx
src/app/(admin)/.../_sections/_components/config-forms/ContactFormConfigForm.tsx
src/app/(admin)/.../_sections/_components/config-forms/CtaConfigForm.tsx
src/app/(admin)/.../_sections/_components/config-forms/CustomConfigForm.tsx
src/app/(admin)/.../_sections/_components/config-forms/EmbedConfigForm.tsx
src/app/(admin)/.../_sections/_components/config-forms/FaqListConfigForm.tsx
src/app/(admin)/.../_sections/_components/config-forms/FeaturesConfigForm.tsx
src/app/(admin)/.../_sections/_components/config-forms/GalleryConfigForm.tsx
src/app/(admin)/.../_sections/_components/config-forms/HeroConfigForm.tsx
src/app/(admin)/.../_sections/_components/config-forms/HeroParallaxConfigForm.tsx
src/app/(admin)/.../_sections/_components/config-forms/InstagramConfigForm.tsx
src/app/(admin)/.../_sections/_components/config-forms/MapConfigForm.tsx
src/app/(admin)/.../_sections/_components/config-forms/NewsListConfigForm.tsx
src/app/(admin)/.../_sections/_components/config-forms/PostListConfigForm.tsx
src/app/(admin)/.../_sections/_components/config-forms/SpaceListConfigForm.tsx
src/app/(admin)/.../_sections/_components/config-forms/SpaceShowcaseConfigForm.tsx
src/app/(admin)/.../_sections/_components/config-forms/TestimonialConfigForm.tsx
src/app/(admin)/.../_sections/_components/config-forms/index.ts
src/app/(admin)/.../_sections/_components/config-forms/shared.tsx
```

### Files to Modify (Major)

```
prisma/schema.prisma                                    # enum → String, PageContent 削除
prisma/seed.ts                                          # PageContent seed → Section seed
src/shared/lib/validations/section.ts                   # 大幅リファクタ → registry ベース
src/shared/lib/validations/section-defaults.ts          # 廃止 → definitions/ に分散
src/shared/lib/validations/section-metadata.ts          # 廃止 → definitions/ に分散
src/shared/lib/constants/default-page-sections.ts       # SectionType enum → string
src/shared/domain/sections/queries.ts                   # SectionType → string
src/app/(public)/_shared/components/sections/SectionRenderer.tsx  # registry ベース
src/app/(public)/page.tsx                               # PageContent → sections
src/app/(public)/contact/page.tsx                       # PageContent → sections
src/app/(public)/faq/page.tsx                           # PageContent → sections
src/app/(public)/news/page.tsx                          # PageContent → sections
src/app/(public)/posts/page.tsx                         # PageContent → sections
src/app/(public)/reservation/page.tsx                   # PageContent → sections
src/app/(public)/spaces/page.tsx                        # PageContent → sections
src/app/(public)/about/page.tsx                         # PageContent hero 削除
src/app/(public)/privacy/page.tsx                       # PageContent hero 削除
src/app/(public)/terms/page.tsx                         # PageContent hero 削除
```

---

## Task 1: 型定義 — `types.ts`

**Files:**

- Create: `src/shared/lib/sections/types.ts`
- Test: `__tests__/unit/domain/sections/registry.test.ts`

- [ ] **Step 1: Create types.ts**

```typescript
// src/shared/lib/sections/types.ts
import type { z } from "zod";

/** フィールドメタデータ — Zod .describe() に JSON エンコードして埋め込む */
export interface FieldMeta {
  readonly fieldType: FieldType;
  readonly label: string;
  readonly placeholder?: string;
  readonly suffix?: string;
  readonly helpText?: string;
}

export type FieldType =
  | "text"
  | "textarea"
  | "richtext"
  | "number"
  | "boolean"
  | "select"
  | "color"
  | "image"
  | "url"
  | "icon"
  | "array"
  | "group";

/** セクション定義（1タイプにつき1つ） */
export interface SectionDefinition<TConfig = unknown> {
  readonly type: string;
  readonly configSchema: z.ZodType<TConfig>;
  readonly metadata: SectionMetadata;
}

export interface SectionMetadata {
  readonly label: string;
  readonly description: string;
  readonly icon: string;
  readonly category: SectionCategory;
}

export type SectionCategory =
  | "hero"
  | "content"
  | "list"
  | "functional"
  | "media";

/** 公開ページセクションコンポーネントの props */
export interface SectionProps<TConfig> {
  readonly config: TConfig;
  readonly design: SectionDesign;
  readonly section: {
    readonly id: string;
    readonly type: string;
    readonly title: string | null;
    readonly contentHtml: string;
    readonly contentJson: unknown;
    readonly isActive: boolean;
  };
}

/** セクションデザイン（全タイプ共通ビジュアル設定） */
export interface SectionDesign {
  readonly backgroundColor?: string;
  readonly padding?: string;
  readonly containerWidth?: string;
}
```

- [ ] **Step 2: Run type-check**

```bash
bun run type-check
```

Expected: PASS（新規ファイルのみ、参照なし）

- [ ] **Step 3: Commit**

```bash
git add src/shared/lib/sections/types.ts
git commit -m "feat(sections): add type definitions for dynamic section architecture"
```

---

## Task 2: field ヘルパー — `field-helpers.ts`

**Files:**

- Create: `src/shared/lib/sections/field-helpers.ts`
- Create: `__tests__/unit/domain/sections/field-helpers.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/unit/domain/sections/field-helpers.test.ts
import { describe, expect, test } from "bun:test";
import { field, extractFieldMeta } from "@/shared/lib/sections/field-helpers";

describe("field helpers", () => {
  test("field.text creates string schema with metadata", () => {
    const schema = field.text("タイトル", { default: "Hello" });
    const result = schema.safeParse(undefined);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("Hello");
  });

  test("field.text metadata is extractable", () => {
    const schema = field.text("タイトル", { placeholder: "入力してください" });
    const meta = extractFieldMeta(schema);
    expect(meta).toEqual({
      fieldType: "text",
      label: "タイトル",
      placeholder: "入力してください",
    });
  });

  test("field.number enforces min/max", () => {
    const schema = field.number("透過度", { min: 0, max: 100, default: 50 });
    expect(schema.safeParse(undefined).data).toBe(50);
    expect(schema.safeParse(150).success).toBe(false);
    expect(schema.safeParse(-1).success).toBe(false);
  });

  test("field.select restricts to options", () => {
    const schema = field.select("レイアウト", {
      options: [
        { value: "grid", label: "グリッド" },
        { value: "list", label: "リスト" },
      ] as const,
      default: "grid",
    });
    expect(schema.safeParse(undefined).data).toBe("grid");
    expect(schema.safeParse("grid").success).toBe(true);
    expect(schema.safeParse("invalid").success).toBe(false);
  });

  test("field.boolean defaults to false", () => {
    const schema = field.boolean("表示する");
    expect(schema.safeParse(undefined).data).toBe(false);
  });

  test("field.image creates string schema", () => {
    const schema = field.image("背景画像");
    const meta = extractFieldMeta(schema);
    expect(meta?.fieldType).toBe("image");
  });

  test("field.array creates array schema", () => {
    const schema = field.array("ボタン", {
      fields: {
        text: field.text("テキスト"),
        url: field.url("URL"),
      },
    });
    const result = schema.safeParse(undefined);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual([]);
  });
});

describe("extractFieldMeta", () => {
  test("returns undefined for schema without metadata", () => {
    const { z } = await import("zod");
    const plain = z.string();
    expect(extractFieldMeta(plain)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test __tests__/unit/domain/sections/field-helpers.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement field-helpers.ts**

```typescript
// src/shared/lib/sections/field-helpers.ts
import { z } from "zod";
import type { FieldMeta, FieldType } from "./types";

/**
 * Zod スキーマの .describe() にフィールドメタデータを JSON 埋め込みする。
 * NOTE: .describe() は同一の ZodType を返すが TS の型が ZodDefault<...> 等に
 * ラップされるため、戻り型の同一性を型レベルで表現できない。
 * type-safety.md の許可例外（境界ヘルパー）として `as T` を使用。
 */
function withMeta<T extends z.ZodType>(schema: T, meta: FieldMeta): T {
  // Zod 4: describe は同じインスタンスを返す
  return schema.describe(JSON.stringify(meta)) as T;
}

/** .describe() から FieldMeta を復元する */
export function extractFieldMeta(schema: z.ZodType): FieldMeta | undefined {
  const desc = schema.description;
  if (!desc) return undefined;
  try {
    const parsed = JSON.parse(desc) as Record<string, unknown>;
    if (
      typeof parsed["fieldType"] === "string" &&
      typeof parsed["label"] === "string"
    ) {
      return parsed as unknown as FieldMeta;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export const field = {
  text(label: string, opts?: { placeholder?: string; default?: string }) {
    const base = z.string().default(opts?.default ?? "");
    return withMeta(base, {
      fieldType: "text",
      label,
      placeholder: opts?.placeholder,
    });
  },

  textarea(label: string, opts?: { placeholder?: string; default?: string }) {
    const base = z.string().default(opts?.default ?? "");
    return withMeta(base, {
      fieldType: "textarea",
      label,
      placeholder: opts?.placeholder,
    });
  },

  number(
    label: string,
    opts?: { min?: number; max?: number; default?: number; suffix?: string },
  ) {
    let schema = z.number();
    if (opts?.min !== undefined) schema = schema.min(opts.min);
    if (opts?.max !== undefined) schema = schema.max(opts.max);
    const base = schema.default(opts?.default ?? 0);
    return withMeta(base, { fieldType: "number", label, suffix: opts?.suffix });
  },

  boolean(label: string, opts?: { default?: boolean }) {
    const base = z.boolean().default(opts?.default ?? false);
    return withMeta(base, { fieldType: "boolean", label });
  },

  select<T extends string>(
    label: string,
    opts: {
      options: readonly { value: T; label: string }[];
      default: NoInfer<T>;
    },
  ) {
    const values = opts.options.map((o) => o.value) as [T, ...T[]];
    const base = z.enum(values).default(opts.default);
    return withMeta(base, { fieldType: "select", label });
  },

  color(label: string, opts?: { default?: string }) {
    const base = z.string().default(opts?.default ?? "");
    return withMeta(base, { fieldType: "color", label });
  },

  image(label: string, opts?: { default?: string }) {
    const base = z.string().default(opts?.default ?? "");
    return withMeta(base, { fieldType: "image", label });
  },

  url(label: string, opts?: { default?: string; placeholder?: string }) {
    const base = z
      .string()
      .url({ error: "有効なURLを入力してください" })
      .or(z.literal(""))
      .default(opts?.default ?? "");
    return withMeta(base, {
      fieldType: "url",
      label,
      placeholder: opts?.placeholder,
    });
  },

  icon(label: string, opts?: { default?: string }) {
    const base = z.string().default(opts?.default ?? "");
    return withMeta(base, { fieldType: "icon", label });
  },

  array<T extends z.ZodRawShape>(
    label: string,
    opts: { fields: T; maxItems?: number },
  ) {
    let base = z.array(z.object(opts.fields));
    if (opts.maxItems) base = base.max(opts.maxItems);
    return withMeta(base.default([]), { fieldType: "array", label });
  },

  group<T extends z.ZodRawShape>(label: string, fields: T) {
    return withMeta(z.object(fields), { fieldType: "group", label });
  },
} as const;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test __tests__/unit/domain/sections/field-helpers.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/sections/field-helpers.ts __tests__/unit/domain/sections/field-helpers.test.ts
git commit -m "feat(sections): add field helpers with Zod metadata integration"
```

---

## Task 3: Hero セクション定義（テンプレート）

**Files:**

- Create: `src/shared/lib/sections/definitions/hero/schema.ts`
- Create: `src/shared/lib/sections/definitions/hero/metadata.ts`

- [ ] **Step 1: Create hero/schema.ts**

現行 `section.ts` の `heroConfigSchema`（行 48-90 付近）を field ヘルパーベースに書き換え。

```typescript
// src/shared/lib/sections/definitions/hero/schema.ts
import { z } from "zod";
import { field } from "../../field-helpers";

const ctaButtonSchema = z.object({
  text: field.text("ボタンテキスト", { default: "詳しく見る" }),
  url: field.url("リンク先", { placeholder: "/spaces" }),
  variant: field.select("スタイル", {
    options: [
      { value: "primary", label: "プライマリ" },
      { value: "secondary", label: "セカンダリ" },
      { value: "outline", label: "アウトライン" },
    ] as const,
    default: "primary",
  }),
  openInNewTab: field.boolean("新しいタブで開く"),
});

export const heroConfigSchema = z.object({
  title: field.text("タイトル", { default: "Welcome" }),
  subtitle: field.textarea("サブタイトル"),
  backgroundImageUrl: field.image("背景画像"),
  buttons: field.array("ボタン", {
    fields: ctaButtonSchema.shape,
    maxItems: 3,
  }),
  height: field.select("高さ", {
    options: [
      { value: "auto", label: "自動" },
      { value: "md", label: "中（500px）" },
      { value: "lg", label: "大（700px）" },
      { value: "fullscreen", label: "全画面" },
    ] as const,
    default: "md",
  }),
  variant: field.select("バリアント", {
    options: [
      { value: "standard", label: "標準" },
      { value: "gradient", label: "グラデーション" },
      { value: "dark", label: "ダーク" },
    ] as const,
    default: "standard",
  }),
  overlay: field.boolean("オーバーレイ", { default: true }),
  overlayOpacity: field.number("オーバーレイ透過度", {
    min: 0,
    max: 100,
    default: 50,
  }),
  videoUrl: field.url("動画URL"),
});

export type HeroConfig = z.infer<typeof heroConfigSchema>;
```

- [ ] **Step 2: Create hero/metadata.ts**

```typescript
// src/shared/lib/sections/definitions/hero/metadata.ts
import type { SectionMetadata } from "../../types";

export const heroMetadata: SectionMetadata = {
  label: "ヒーロー",
  description: "ページ上部のメインビジュアルセクション",
  icon: "IconPhoto",
  category: "hero",
};
```

- [ ] **Step 3: Run type-check**

```bash
bun run type-check
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/shared/lib/sections/definitions/hero/
git commit -m "feat(sections): add hero section definition with field helpers"
```

---

## Task 4: 残り 16 セクション定義

**Files:**

- Create: 16 ディレクトリ x 2 ファイル（schema.ts + metadata.ts）

各定義は Task 3 のパターンに従い、現行 `section.ts` / `section-metadata.ts` の値を field ヘルパーベースに移行する。

- [ ] **Step 1: hero-parallax 定義を作成**

`src/shared/lib/sections/definitions/hero-parallax/schema.ts` — 現行 `heroParallaxConfigSchema` を移行。追加フィールド: `parallaxSpeed`, `overlayGradient`, `scrollIndicator`, `contentPosition`。

`src/shared/lib/sections/definitions/hero-parallax/metadata.ts` — label: "パララックスヒーロー", icon: "IconArrowsVertical", category: "hero"

- [ ] **Step 2: content セクション定義を作成**（custom, concept, gallery）

`definitions/custom/` — sectionLabel, maxWidth, backgroundColor, padding。NOTE: contentJson/contentHtml は Section モデルフィールドのため config に含めない。

`definitions/concept/` — sectionLabel, heading, body, imageUrl, imagePosition(left/right), textAlign, layout(side-by-side/stacked), imageAspect。

`definitions/gallery/` — sectionLabel, title, images(array of {url, alt, caption}), layout, columns, gap, enableLightbox, imageAspect, hoverEffect。

- [ ] **Step 3: list セクション定義を作成**（space-list, space-showcase, news-list, post-list, faq-list）

共通パターン: sectionLabel, title, maxItems, showViewAllLink, viewAllText, viewAllUrl, layout, columns。

`definitions/faq-list/` — 追加: items(array of {question, answer}), variant(accordion/collapse), initialOpen(none/first/all)。

- [ ] **Step 4: functional セクション定義を作成**（cta, contact-form, map, embed）

`definitions/cta/` — sectionLabel, title, description, buttons(array), backgroundColor, variant。

`definitions/contact-form/` — sectionLabel, title, description, showNameField, showPhoneField, showSubjectField, submitButtonText, variant。

`definitions/map/` — sectionLabel, title, address, latitude, longitude, zoom(1-20), showAddressBelow。

`definitions/embed/` — sectionLabel, title, embedUrl, embedCode, aspectRatio, maxWidth。

- [ ] **Step 5: media セクション定義を作成**（features, testimonial, instagram）

`definitions/features/` — sectionLabel, title, items(array of {icon, title, description}), columns(1-6), layout。

`definitions/testimonial/` — sectionLabel, title, items(array of {content, authorName, authorTitle, authorImageUrl, rating}), layout, showRating, variant。

`definitions/instagram/` — sectionLabel, title, columns(3-6), count(6-12), gap。

- [ ] **Step 6: Run type-check**

```bash
bun run type-check
```

- [ ] **Step 7: Commit**

```bash
git add src/shared/lib/sections/definitions/
git commit -m "feat(sections): add all 17 section definitions with field helpers"
```

---

## Task 5: レジストリ実装

**Files:**

- Create: `src/shared/lib/sections/registry.ts`
- Create: `__tests__/unit/domain/sections/registry.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/unit/domain/sections/registry.test.ts
import { describe, expect, test } from "bun:test";
import {
  getSectionDefinition,
  getAllSectionDefinitions,
  getSectionDefinitionsByCategory,
  validateSectionConfig,
  getDefaultConfig,
} from "@/shared/lib/sections/registry";

describe("section registry", () => {
  test("getSectionDefinition returns hero definition", () => {
    const def = getSectionDefinition("hero");
    expect(def).toBeDefined();
    expect(def?.type).toBe("hero");
    expect(def?.metadata.label).toBe("ヒーロー");
    expect(def?.metadata.category).toBe("hero");
  });

  test("getSectionDefinition returns undefined for unknown type", () => {
    expect(getSectionDefinition("nonexistent")).toBeUndefined();
  });

  test("getAllSectionDefinitions returns all 17 types", () => {
    const defs = getAllSectionDefinitions();
    expect(defs.length).toBe(17);
  });

  test("getSectionDefinitionsByCategory groups correctly", () => {
    const grouped = getSectionDefinitionsByCategory();
    expect(grouped["hero"]?.length).toBe(2); // hero, hero-parallax
    expect(grouped["content"]?.length).toBeGreaterThan(0);
  });

  test("validateSectionConfig validates hero config", () => {
    const result = validateSectionConfig("hero", { title: "Test" });
    expect(result.success).toBe(true);
  });

  test("validateSectionConfig fails for unknown type", () => {
    const result = validateSectionConfig("nonexistent", {});
    expect(result.success).toBe(false);
  });

  test("getDefaultConfig returns defaults for hero", () => {
    const config = getDefaultConfig("hero");
    expect(config["title"]).toBe("Welcome");
    expect(config["overlay"]).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test __tests__/unit/domain/sections/registry.test.ts
```

- [ ] **Step 3: Implement registry.ts**

```typescript
// src/shared/lib/sections/registry.ts
import type { SectionDefinition, SectionCategory } from "./types";

// Hero
import { heroConfigSchema } from "./definitions/hero/schema";
import { heroMetadata } from "./definitions/hero/metadata";
import { heroParallaxConfigSchema } from "./definitions/hero-parallax/schema";
import { heroParallaxMetadata } from "./definitions/hero-parallax/metadata";

// Content
import { customConfigSchema } from "./definitions/custom/schema";
import { customMetadata } from "./definitions/custom/metadata";
import { conceptConfigSchema } from "./definitions/concept/schema";
import { conceptMetadata } from "./definitions/concept/metadata";
import { galleryConfigSchema } from "./definitions/gallery/schema";
import { galleryMetadata } from "./definitions/gallery/metadata";

// List
import { spaceListConfigSchema } from "./definitions/space-list/schema";
import { spaceListMetadata } from "./definitions/space-list/metadata";
import { spaceShowcaseConfigSchema } from "./definitions/space-showcase/schema";
import { spaceShowcaseMetadata } from "./definitions/space-showcase/metadata";
import { newsListConfigSchema } from "./definitions/news-list/schema";
import { newsListMetadata } from "./definitions/news-list/metadata";
import { postListConfigSchema } from "./definitions/post-list/schema";
import { postListMetadata } from "./definitions/post-list/metadata";
import { faqListConfigSchema } from "./definitions/faq-list/schema";
import { faqListMetadata } from "./definitions/faq-list/metadata";

// Functional
import { ctaConfigSchema } from "./definitions/cta/schema";
import { ctaMetadata } from "./definitions/cta/metadata";
import { contactFormConfigSchema } from "./definitions/contact-form/schema";
import { contactFormMetadata } from "./definitions/contact-form/metadata";
import { mapConfigSchema } from "./definitions/map/schema";
import { mapMetadata } from "./definitions/map/metadata";
import { embedConfigSchema } from "./definitions/embed/schema";
import { embedMetadata } from "./definitions/embed/metadata";

// Media
import { featuresConfigSchema } from "./definitions/features/schema";
import { featuresMetadata } from "./definitions/features/metadata";
import { testimonialConfigSchema } from "./definitions/testimonial/schema";
import { testimonialMetadata } from "./definitions/testimonial/metadata";
import { instagramConfigSchema } from "./definitions/instagram/schema";
import { instagramMetadata } from "./definitions/instagram/metadata";

const definitions: Record<string, SectionDefinition> = {
  hero: {
    type: "hero",
    configSchema: heroConfigSchema,
    metadata: heroMetadata,
  },
  "hero-parallax": {
    type: "hero-parallax",
    configSchema: heroParallaxConfigSchema,
    metadata: heroParallaxMetadata,
  },
  custom: {
    type: "custom",
    configSchema: customConfigSchema,
    metadata: customMetadata,
  },
  concept: {
    type: "concept",
    configSchema: conceptConfigSchema,
    metadata: conceptMetadata,
  },
  gallery: {
    type: "gallery",
    configSchema: galleryConfigSchema,
    metadata: galleryMetadata,
  },
  "space-list": {
    type: "space-list",
    configSchema: spaceListConfigSchema,
    metadata: spaceListMetadata,
  },
  "space-showcase": {
    type: "space-showcase",
    configSchema: spaceShowcaseConfigSchema,
    metadata: spaceShowcaseMetadata,
  },
  "news-list": {
    type: "news-list",
    configSchema: newsListConfigSchema,
    metadata: newsListMetadata,
  },
  "post-list": {
    type: "post-list",
    configSchema: postListConfigSchema,
    metadata: postListMetadata,
  },
  "faq-list": {
    type: "faq-list",
    configSchema: faqListConfigSchema,
    metadata: faqListMetadata,
  },
  cta: { type: "cta", configSchema: ctaConfigSchema, metadata: ctaMetadata },
  "contact-form": {
    type: "contact-form",
    configSchema: contactFormConfigSchema,
    metadata: contactFormMetadata,
  },
  map: { type: "map", configSchema: mapConfigSchema, metadata: mapMetadata },
  embed: {
    type: "embed",
    configSchema: embedConfigSchema,
    metadata: embedMetadata,
  },
  features: {
    type: "features",
    configSchema: featuresConfigSchema,
    metadata: featuresMetadata,
  },
  testimonial: {
    type: "testimonial",
    configSchema: testimonialConfigSchema,
    metadata: testimonialMetadata,
  },
  instagram: {
    type: "instagram",
    configSchema: instagramConfigSchema,
    metadata: instagramMetadata,
  },
};

export function getSectionDefinition(
  type: string,
): SectionDefinition | undefined {
  return definitions[type];
}

export function getAllSectionDefinitions(): SectionDefinition[] {
  return Object.values(definitions);
}

export function getSectionDefinitionsByCategory(): Record<
  SectionCategory,
  SectionDefinition[]
> {
  const result = {} as Record<SectionCategory, SectionDefinition[]>;
  for (const def of Object.values(definitions)) {
    const cat = def.metadata.category;
    (result[cat] ??= []).push(def);
  }
  return result;
}

export function validateSectionConfig(type: string, config: unknown) {
  const def = definitions[type];
  if (!def)
    return { success: false as const, error: `Unknown section type: ${type}` };
  return def.configSchema.safeParse(config);
}

export function getDefaultConfig(type: string): Record<string, unknown> {
  const def = definitions[type];
  if (!def) return {};
  const result = def.configSchema.safeParse({});
  return result.success ? (result.data as Record<string, unknown>) : {};
}

/** レジストリにセクション定義を追加（CLI 拡張用） */
export function registerSectionDefinition(def: SectionDefinition): void {
  definitions[def.type] = def;
}
```

- [ ] **Step 4: Run test**

```bash
bun test __tests__/unit/domain/sections/registry.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/sections/registry.ts __tests__/unit/domain/sections/registry.test.ts
git commit -m "feat(sections): add section registry with 17 definitions"
```

---

## Task 6: Prisma スキーマ変更

**Files:**

- Modify: `prisma/schema.prisma` (lines 87-110: SectionType enum, line 940: Section.type, lines 1659-1671: PageContent)

- [ ] **Step 1: SectionType enum を削除、Section.type を String に変更**

`prisma/schema.prisma` を編集:

1. `SectionType` enum（行 87-110）を削除
2. `Section` モデルの `type SectionType` を `type String @db.VarChar(64)` に変更
3. `PageContent` モデル（行 1659-1671）を削除
4. `@@map("page_contents")` に対応するテーブルは DROP TABLE で削除

- [ ] **Step 2: マイグレーション生成**

```bash
bunx --bun prisma migrate dev --name dynamic-section-types
```

マイグレーション SQL に以下が含まれることを確認:

- `ALTER TABLE "sections"` で `type` カラムを VARCHAR(64) に変更
- 既存データの enum → 小文字ケバブケース変換（`UPDATE sections SET type = ...`）
- `DROP TABLE "page_contents"`
- `DROP TYPE "SectionType"` (enum 削除)

- [ ] **Step 3: Seed を確認**

```bash
bun prisma/seed.ts
```

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(prisma): migrate SectionType enum to String, drop PageContent model"
```

---

## Task 7: セクションクエリ・default-page-sections のリファクタ

**Files:**

- Modify: `src/shared/domain/sections/queries.ts`
- Modify: `src/shared/lib/constants/default-page-sections.ts`

- [ ] **Step 1: default-page-sections.ts を更新**

`SectionType.HERO` → `"hero"`, `SectionType.CTA` → `"cta"` 等、全 enum 参照を文字列に変更。`import { SectionType } from "@generated/prisma/client"` を削除。

- [ ] **Step 2: queries.ts を更新**

`PublicSection` 型の `type` を `string` に変更（Prisma 生成型が自動的に `string` になる）。`SectionType` import を削除。

- [ ] **Step 3: Run type-check and tests**

```bash
bun run validate
bun test __tests__/unit/domain/sections/
```

- [ ] **Step 4: Commit**

```bash
git add src/shared/domain/sections/queries.ts src/shared/lib/constants/default-page-sections.ts
git commit -m "refactor(sections): replace SectionType enum with string literals"
```

---

## Task 8: SectionRenderer のレジストリベース化

**Files:**

- Modify: `src/app/(public)/_shared/components/sections/SectionRenderer.tsx`

- [ ] **Step 1: SectionRenderer をレジストリから動的ディスパッチに変更**

switch 文を削除し、`getSectionDefinition()` + コンポーネントマップに変更。既存のセクションコンポーネント（`_components/` 内）はそのまま使用。

```typescript
// SectionRenderer.tsx — 概要
import { getSectionDefinition, getDefaultConfig } from "@/shared/lib/sections/registry";
import { parseSectionDesign } from "@/shared/lib/validations/section-design";

// コンポーネントマップ（既存コンポーネントを import）
const componentMap: Record<string, React.ComponentType<any>> = {
  "hero": StandardHeroSection,
  "hero-parallax": HeroSection,
  "custom": CustomSection,
  // ... 全17タイプ
};

export function SectionRenderer({ section }: { section: PublicSection }) {
  if (!section.isActive) return null;
  const def = getSectionDefinition(section.type);
  if (!def) return null;
  const Component = componentMap[section.type];
  if (!Component) return null;

  const parseResult = def.configSchema.safeParse(section.config);
  const config = parseResult.success ? parseResult.data : getDefaultConfig(section.type);
  const design = parseSectionDesign(section.design);

  return <Component config={config} design={design} section={section} />;
}
```

- [ ] **Step 2: 既存のデータ取得ロジックを維持**

list セクション（space-list, news-list, post-list, faq-list）はデータ取得が必要。SectionRenderer 内のデータ取得ロジック（`getShowcaseSpaces()`, `getPublishedNews()` 等）は、コンポーネントマップではなく switch で維持するか、各コンポーネントの Server Component 内でデータ取得する。

- [ ] **Step 3: Run validate**

```bash
bun run validate
```

- [ ] **Step 4: Commit**

```bash
git add src/app/(public)/_shared/components/sections/SectionRenderer.tsx
git commit -m "refactor(sections): migrate SectionRenderer to registry-based dispatch"
```

---

## Task 9: 管理画面の SectionType 参照を更新

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/SectionTypeIcon.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionSidebarItem.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionMasterDetail.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionDetailHeader.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/AddSectionDialog.tsx`

- [ ] **Step 1: 全ファイルの `SectionType` import を削除**

各ファイルで `import { SectionType } from "@generated/prisma/client"` を削除し、文字列リテラルまたはレジストリの `getSectionDefinition()` / `getAllSectionDefinitions()` に置換。

- [ ] **Step 2: AddSectionDialog をレジストリベースに**

`getSectionDefinitionsByCategory()` からセクションタイプのリストを動的生成。

- [ ] **Step 3: SectionTypeIcon をレジストリベースに**

`getSectionDefinition(type)?.metadata.icon` でアイコンを取得。

- [ ] **Step 4: Run validate**

```bash
bun run validate
```

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(admin)/admin/(dashboard)/pages/'
git commit -m "refactor(admin): replace SectionType enum with registry in section UI"
```

---

## Task 10: AutoSectionForm（自動フォーム生成）

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/field-renderers.tsx`

- [ ] **Step 1: field-renderers.tsx を作成**

各 `FieldType` に対応する React コンポーネント。管理画面の既存 UI コンポーネント（`Input`, `Textarea`, `Select`, `Switch` 等）を使用。

- text → `<Input>`
- textarea → `<Textarea>`
- number → `<Input type="number">`
- boolean → `<Switch>`
- select → `<Select>`
- image → メディアピッカー（既存 `useMediaPicker` 使用）
- color → `<Input type="color">` + テキスト入力
- url → `<Input type="url">`
- icon → `<Input>` (Tabler icon name)
- array → DnD リスト（`useFieldArray` + dnd-kit）
- group → `<Collapsible>` ラッパー

- [ ] **Step 2: auto-section-form.tsx を作成**

Zod スキーマの shape を走査し、各フィールドの `extractFieldMeta()` から適切な field-renderer を選択してレンダリング。

- [ ] **Step 3: 管理画面のセクション設定パネルで AutoSectionForm を使用**

`SectionDetailPanel` 等で、タイプ別 config form の lazy import を `AutoSectionForm` に置換。CUSTOM タイプのみ Lexical エディタを別途表示。

- [ ] **Step 4: Run validate**

```bash
bun run validate
```

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(admin)/admin/(dashboard)/pages/'
git commit -m "feat(admin): add AutoSectionForm with schema-driven field rendering"
```

---

## Task 11: 手書き config-form 削除

**Files:**

- Delete: 19 ファイル（config-forms/ ディレクトリ全体）

- [ ] **Step 1: config-forms/ を削除**

全19ファイルを削除。import 元（`index.ts` の lazy import）は Task 10 で AutoSectionForm に置換済み。

- [ ] **Step 2: Run validate**

```bash
bun run validate
```

- [ ] **Step 3: Commit**

```bash
git rm -r 'src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/config-forms/'
git commit -m "refactor(admin): remove hand-written config forms (replaced by AutoSectionForm)"
```

---

## Task 12: 固定ページ移行 — Already Section-Based（about, privacy, terms）

**Files:**

- Modify: `src/app/(public)/about/page.tsx`
- Modify: `src/app/(public)/privacy/page.tsx`
- Modify: `src/app/(public)/terms/page.tsx`

- [ ] **Step 1: about/page.tsx から PageContent 依存を削除**

`getPageContent()` 呼び出しを削除。hero セクション（HERO タイプ）は既に sections に含まれているか、DEFAULT_PAGE_SECTIONS から取得される。`SectionRenderer` が hero を含む全セクションをレンダリング。

```typescript
// AFTER: about/page.tsx
export default async function AboutPage(): Promise<ReactElement> {
  await connection();
  const sections = await getPageSectionsWithFallback("about");

  return (
    <>
      {sections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
      <SiteCTA />
    </>
  );
}
```

- [ ] **Step 2: privacy/page.tsx, terms/page.tsx も同様に更新**

- [ ] **Step 3: Run validate**

```bash
bun run validate
```

- [ ] **Step 4: Commit**

```bash
git add 'src/app/(public)/about/page.tsx' 'src/app/(public)/privacy/page.tsx' 'src/app/(public)/terms/page.tsx'
git commit -m "refactor(public): remove PageContent dependency from about/privacy/terms pages"
```

---

## Task 13: 固定ページ移行 — Simple Pages（contact, faq, news, posts, reservation, spaces）

**Files:**

- Modify: 6 ファイル（各ページの page.tsx）

- [ ] **Step 1: contact/page.tsx を移行**

`getPageContent()` → `getPageSectionsWithFallback("contact")`。hero セクションを `SectionRenderer` で描画し、ContactForm は page.tsx 内にそのまま残す。

```typescript
// AFTER: contact/page.tsx
export default async function ContactPage({ searchParams }: Props): Promise<ReactElement> {
  await connection();
  const params = await searchParams;
  const defaultSubject = typeof params["subject"] === "string" ? params["subject"].slice(0, 200) : undefined;

  const [sections, turnstileSiteKey] = await Promise.all([
    getPageSectionsWithFallback("contact"),
    getTurnstileSiteKey(),
  ]);

  const heroSection = sections.find((s) => s.type === "hero" || s.type === "hero-parallax");
  const trailingSections = sections.filter((s) => s !== heroSection && s.type !== "hero" && s.type !== "hero-parallax");

  return (
    <>
      {heroSection && <SectionRenderer section={heroSection} />}

      <section className="py-[var(--spacing-section)]">
        <Container>
          <div className="grid gap-12 lg:grid-cols-[1fr_360px] lg:gap-16">
            <ContactForm turnstileSiteKey={turnstileSiteKey} defaultSubject={defaultSubject} />
            <div className="lg:sticky lg:top-[calc(var(--header-height)+2rem)] lg:self-start">
              <ScrollReveal delay={0.2}>
                <Suspense fallback={null}>
                  <BusinessInfo />
                </Suspense>
              </ScrollReveal>
            </div>
          </div>
        </Container>
      </section>

      {trailingSections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </>
  );
}
```

- [ ] **Step 2: faq, news, posts, reservation, spaces を同パターンで移行**

各ページで hero セクションを SectionRenderer に委譲し、ページ固有コンテンツ（フォーム、リスト、ウィザード）はそのまま維持。末尾のセクション（CTA 等）も SectionRenderer で描画。

- [ ] **Step 3: Run validate**

```bash
bun run validate
```

- [ ] **Step 4: Commit**

```bash
git add 'src/app/(public)/contact/page.tsx' 'src/app/(public)/faq/page.tsx' 'src/app/(public)/news/page.tsx' 'src/app/(public)/posts/page.tsx' 'src/app/(public)/reservation/page.tsx' 'src/app/(public)/spaces/page.tsx'
git commit -m "refactor(public): migrate 6 fixed pages from PageContent to sections"
```

---

## Task 14: ホームページ移行

**Files:**

- Modify: `src/app/(public)/page.tsx`
- Keep: `src/app/(public)/_components/homepage/space-showcase.tsx`（SpaceShowcase は動的データのため維持）

- [ ] **Step 1: homepage を sections ベースに移行**

```typescript
// AFTER: src/app/(public)/page.tsx
export default async function HomePage(): Promise<ReactElement> {
  await connection();

  const [webSiteData, sections] = await Promise.all([
    getWebSiteJsonLdData(),
    getPageSectionsWithFallback("home"),
  ]);

  return (
    <>
      <WebSiteJsonLd name={webSiteData.name} description={webSiteData.description} url={webSiteData.url} />

      {sections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </>
  );
}
```

NOTE: SpaceShowcase は `space-showcase` セクションタイプとして SectionRenderer 内でデータ取得・描画される。homepage 専用コンポーネント（concept-section.tsx, features-section.tsx, hero-section.tsx）は既存の `_components/` セクションコンポーネントに統合済みのため削除可能。

- [ ] **Step 2: homepage 専用コンポーネントを削除**

```bash
git rm src/app/(public)/_components/homepage/concept-section.tsx
git rm src/app/(public)/_components/homepage/features-section.tsx
git rm src/app/(public)/_components/homepage/hero-section.tsx
```

`space-showcase.tsx` は維持（`_components/SpaceShowcase.tsx` が SectionRenderer から呼ばれる）。

- [ ] **Step 3: default-page-sections.ts に "home" エントリを追加**

```typescript
home: [
  { type: "hero-parallax", config: { title: "...", ... }, order: 0, ... },
  { type: "concept", config: { heading: "...", ... }, order: 1, ... },
  { type: "space-showcase", config: { ... }, order: 2, ... },
  { type: "features", config: { ... }, order: 3, ... },
  { type: "cta", config: { ... }, order: 4, ... },
],
```

- [ ] **Step 4: Run validate && build**

```bash
bun run validate && bun run build:skip-env
```

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(public)/page.tsx' 'src/app/(public)/_components/homepage/' src/shared/lib/constants/default-page-sections.ts
git commit -m "refactor(public): migrate homepage to section-based architecture"
```

---

## Task 15: Seed 移行

**Files:**

- Modify: `prisma/seed.ts`

- [ ] **Step 1: seedPageContent() を削除**

`seedPageContent()` 関数（行 2529-2610）を削除。`seedAll()` / `seedDemo()` からの呼び出しも削除。defaultHomepageContent 等の import を削除。

- [ ] **Step 2: seedHomepageSections() を新フォーマットに更新**

enum 値（`"HERO_PARALLAX"`）を文字列（`"hero-parallax"`）に変更。

- [ ] **Step 3: システムページのセクション seed を追加**

`DEFAULT_PAGE_SECTIONS` を import し、各システムページのセクションを seed する関数 `seedSystemPageSections()` を追加。

- [ ] **Step 4: Run seed**

```bash
bun prisma/seed.ts
```

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts
git commit -m "refactor(seed): migrate from PageContent to section-based seeding"
```

---

## Task 16: PageContent 関連ファイル削除

**Files:**

- Delete: `src/app/(public)/_shared/lib/content/` (5 files)
- Delete: `src/shared/domain/page-content/` (1 file)

- [ ] **Step 1: ファイル削除**

```bash
git rm -r 'src/app/(public)/_shared/lib/content/'
git rm -r src/shared/domain/page-content/
```

- [ ] **Step 2: 残存 import がないことを確認**

```bash
bun run validate
```

- [ ] **Step 3: Commit**

```bash
git commit -m "refactor: remove PageContent model and all related files"
```

---

## Task 17: 旧 validation ファイルのリファクタ

**Files:**

- Modify: `src/shared/lib/validations/section.ts` — 大幅削減（registry に委譲）
- Delete or Modify: `src/shared/lib/validations/section-defaults.ts` — 不要部分を削除
- Delete or Modify: `src/shared/lib/validations/section-metadata.ts` — 不要部分を削除

- [ ] **Step 1: section.ts をスリム化**

`sectionConfigSchemas` マップ、17個の個別スキーマ定義、型ガード群を削除。registry の `validateSectionConfig()` に委譲する thin wrapper のみ残す。CRUD スキーマ（`createSectionSchema`, `updateSectionSchema`）は維持。

- [ ] **Step 2: section-defaults.ts をスリム化**

`defaultSectionConfigs`, `getSafeConfig()`, 17個の getter 関数を削除。registry の `getDefaultConfig()` に委譲。`parseSectionDesign()` は維持（design は共通構造のため）。

- [ ] **Step 3: section-metadata.ts をスリム化**

`sectionTypeLabels`, `sectionTypeDescriptions`, `sectionTypeIcons`, `sectionTypeCategories` を削除。registry の `getSectionDefinition()?.metadata` に委譲。

- [ ] **Step 4: section-parsers.ts を更新**

`SectionType` enum 参照を文字列に変更。

- [ ] **Step 5: Run validate && build**

```bash
bun run validate && bun run build:skip-env
```

- [ ] **Step 6: Commit**

```bash
git add src/shared/lib/validations/
git commit -m "refactor(validations): slim down section files, delegate to registry"
```

---

## Task 18: 全体検証

- [ ] **Step 1: type-check + lint**

```bash
bun run validate
```

- [ ] **Step 2: 全テスト実行**

```bash
bun run test
```

- [ ] **Step 3: ビルド**

```bash
bun run build:skip-env
```

- [ ] **Step 4: 修正があればコミット**

---

## Task 19: ルール・ドキュメント更新

**Files:**

- Modify: `CLAUDE.md`
- Modify: `.claude/rules/gotchas.md` — PageContent 関連の記述を更新
- Modify: `.claude/rules/server-actions.md` — PageContent 参照を削除
- Create or Modify: `.claude/skills/create-section-type/SKILL.md` — 新スキル

- [ ] **Step 1: CLAUDE.md のキーファイル表を更新**

`src/shared/lib/sections/registry.ts` を追加。`PageContent` 関連の記述を削除。

- [ ] **Step 2: gotchas.md の "Page-First Architecture" セクションを更新**

"`PageContent` モデルと `Page`/`Section` モデルは共存" → "`PageContent` は廃止。全ページが `Page` + `Section` で管理" に変更。

- [ ] **Step 3: create-section-type スキルを作成**

CLIが新セクションタイプを追加するためのスキル。definitions/ にディレクトリ作成 + registry.ts に登録 + セクションコンポーネント作成。

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md .claude/rules/ .claude/skills/
git commit -m "docs: update rules and add create-section-type skill for dynamic sections"
```

---

## Summary

| Task | 内容                       | 推定規模                   |
| ---- | -------------------------- | -------------------------- |
| 1    | 型定義                     | 小                         |
| 2    | field ヘルパー + テスト    | 中                         |
| 3    | Hero 定義（テンプレート）  | 小                         |
| 4    | 残り 16 定義               | 大                         |
| 5    | レジストリ + テスト        | 中                         |
| 6    | Prisma スキーマ変更        | 中（マイグレーション注意） |
| 7    | クエリ・定数のリファクタ   | 中                         |
| 8    | SectionRenderer リファクタ | 中                         |
| 9    | 管理画面の enum 参照更新   | 中                         |
| 10   | AutoSectionForm 作成       | 大                         |
| 11   | 手書き config-form 削除    | 小                         |
| 12   | About/Privacy/Terms 移行   | 小                         |
| 13   | 6 固定ページ移行           | 中                         |
| 14   | ホームページ移行           | 中                         |
| 15   | Seed 移行                  | 中                         |
| 16   | PageContent ファイル削除   | 小                         |
| 17   | 旧 validation リファクタ   | 大                         |
| 18   | 全体検証                   | 小                         |
| 19   | ドキュメント更新           | 小                         |
