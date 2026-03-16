# Component-Driven Section Architecture Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prisma `SectionType` enum を廃止し、`componentId: String` + コンポーネントレジストリ駆動のセクションアーキテクチャに全面移行する

**Architecture:** 各セクションを自己完結した `definition.ts`（Zod スキーマ + メタ + コンポーネント参照）で定義し、レジストリに集約。管理画面フォームは Zod 4 `.meta()` から自動生成。エフェクト層で Three.js/PixiJS を任意セクションにオーバーレイ可能にする。

**Tech Stack:** Next.js 16 / React 19 / TypeScript 6.0 / Zod 4 / Prisma 7 / GSAP / Three.js / PixiJS

**Spec:** `docs/superpowers/specs/2026-03-11-component-driven-sections-design.md`

---

## File Structure

### New Files (~50)

```
src/shared/lib/sections/
├── types.ts                      # SectionDefinition, FieldUIHint, SectionComponentProps, ComponentLoader, ServerComponentLoader, SectionDataLoader
├── component-ids.ts              # StandardComponentId as const + type
├── registry.ts                   # registerSection() + getSectionDefinition() + lookup 関数
└── effects/
    ├── types.ts                  # EffectId, EffectDefinition, EffectLayer
    └── schemas.ts                # sectionEffectConfigSchema, pageEffectConfigSchema

src/shared/lib/sections/schema-utils.ts  # extractFieldDefinitions (Zod → FieldDefinition[])

src/app/(public)/_shared/components/sections/standard/
├── hero/definition.ts + index.ts
├── hero-parallax/definition.ts + index.ts
├── custom/definition.ts + index.ts
├── concept/definition.ts + index.ts
├── space-list/definition.ts + index.ts
├── space-showcase/definition.ts + index.ts
├── news-list/definition.ts + index.ts
├── post-list/definition.ts + index.ts
├── faq-list/definition.ts + index.ts
├── features/definition.ts + index.ts
├── testimonial/definition.ts + index.ts
├── gallery/definition.ts + index.ts
├── cta/definition.ts + index.ts
├── contact-form/definition.ts + index.ts
├── map/definition.ts + index.ts
├── embed/definition.ts + index.ts
└── instagram/definition.ts + index.ts

src/app/(public)/_shared/components/effects/
├── registry.ts                   # effectRegistry
├── EffectOverlayRenderer.tsx     # セクション単位エフェクト描画
└── PageEffectRenderer.tsx        # ページ単位エフェクト描画

src/app/(admin)/admin/(dashboard)/_shared/components/
├── schema-form/
│   ├── SchemaForm.tsx            # メイン
│   ├── FieldRenderer.tsx         # fieldType ディスパッチ
│   ├── ConditionalWrapper.tsx    # visibleWhen 条件表示
│   └── fields/
│       ├── AutoTextField.tsx
│       ├── AutoTextareaField.tsx
│       ├── AutoNumberField.tsx
│       ├── AutoSliderField.tsx
│       ├── AutoSelectField.tsx
│       ├── AutoSwitchField.tsx
│       ├── AutoColorField.tsx
│       ├── MediaPickerField.tsx
│       ├── MultiMediaPickerField.tsx
│       ├── CTAButtonEditorField.tsx
│       └── IconSelectField.tsx
└── effect-editor/
    ├── EffectSelector.tsx
    └── EffectParamsForm.tsx
```

### Modified Files (~25)

```
prisma/schema.prisma                                          # SectionType enum → componentId String + effectConfig
src/shared/lib/validations/section.ts                         # 大幅リファクタ → registry 委譲
src/shared/lib/validations/enums.ts                           # isValidSectionType 削除
src/shared/lib/constants/default-page-sections.ts             # SectionType → componentId
src/shared/domain/sections/commands.ts                        # SectionType → componentId
src/shared/domain/sections/queries.ts                         # PublicSection.type → componentId
src/shared/domain/sections/admin-queries.ts                   # type → componentId
src/shared/domain/pages/system-pages.ts                       # SectionType → componentId
src/app/(admin)/.../actions/page-section.ts                   # SectionType → componentId
src/app/(admin)/.../actions/homepage-settings.ts              # SectionType → componentId
src/app/(admin)/.../queries/homepage-settings.ts              # type → componentId
src/app/(admin)/.../queries/page-section.ts                   # type → componentId
src/app/(admin)/.../sections/.../AddSectionDialog.tsx         # レジストリベースに書き換え
src/app/(admin)/.../edit/.../SectionDetailPanel.tsx           # SchemaForm に移行
src/app/(admin)/.../edit/.../SectionDetailHeader.tsx          # アイコンをレジストリから取得
src/app/(admin)/.../edit/.../SectionSidebarItem.tsx           # アイコンをレジストリから取得
src/app/(public)/_shared/components/sections/SectionRenderer.tsx  # switch → レジストリベース
src/app/(public)/layout.tsx                                   # ExperienceShell 追加
src/app/(public)/page.tsx                                     # ExperienceShell 削除
__tests__/unit/lib/validations/section.test.ts                # レジストリベースに更新
__tests__/unit/lib/validations/section-design.test.ts         # 影響なし（設計は共通）
__tests__/integration/actions/admin/page-section.test.ts      # componentId に更新
```

### Deleted Files (~20)

```
src/app/(admin)/.../sections/_components/config-forms/HeroConfigForm.tsx
src/app/(admin)/.../sections/_components/config-forms/HeroParallaxConfigForm.tsx
src/app/(admin)/.../sections/_components/config-forms/CustomConfigForm.tsx
src/app/(admin)/.../sections/_components/config-forms/ConceptConfigForm.tsx
src/app/(admin)/.../sections/_components/config-forms/SpaceListConfigForm.tsx
src/app/(admin)/.../sections/_components/config-forms/SpaceShowcaseConfigForm.tsx
src/app/(admin)/.../sections/_components/config-forms/NewsListConfigForm.tsx
src/app/(admin)/.../sections/_components/config-forms/PostListConfigForm.tsx
src/app/(admin)/.../sections/_components/config-forms/FaqListConfigForm.tsx
src/app/(admin)/.../sections/_components/config-forms/FeaturesConfigForm.tsx
src/app/(admin)/.../sections/_components/config-forms/TestimonialConfigForm.tsx
src/app/(admin)/.../sections/_components/config-forms/GalleryConfigForm.tsx
src/app/(admin)/.../sections/_components/config-forms/CtaConfigForm.tsx
src/app/(admin)/.../sections/_components/config-forms/ContactFormConfigForm.tsx
src/app/(admin)/.../sections/_components/config-forms/MapConfigForm.tsx
src/app/(admin)/.../sections/_components/config-forms/EmbedConfigForm.tsx
src/app/(admin)/.../sections/_components/config-forms/InstagramConfigForm.tsx
src/app/(admin)/.../sections/_components/config-forms/index.ts
src/app/(admin)/.../sections/_components/config-forms/shared.tsx
src/app/(admin)/.../sections/_components/SectionTypeIcon.tsx
```

---

## Chunk 1: Foundation — DB Migration + Type System

### Task 1: Prisma Schema Migration

**Files:**

- Modify: `prisma/schema.prisma` (Section model lines ~878-895, SectionType enum lines ~76-95)
- Create: Migration SQL (auto-generated by `prisma migrate dev`)

**Context:** 現在の Section モデルは `type SectionType` enum カラムを持つ。これを `componentId String` に変換し、`effectConfig Json` を追加する。Page モデルにも `effectConfig Json` を追加。SectionType enum を完全削除。

**Important:** @prisma-migration スキルを使用すること。マイグレーション後は `bun run db:generate` で Prisma Client を再生成。

- [ ] **Step 1: prisma/schema.prisma を編集**

Section モデル（`schema.prisma:879-899`）の変更点のみ:

1. `type SectionType` → `componentId String` に変更
2. `effectConfig Json @default("{}")` を追加
3. `@@index([type])` → `@@index([componentId])` に変更

```prisma
/// 統一セクション（ホームページ + カスタムページ共通）
/// pageId = null でホームページセクション判別
model Section {
  id          String      @id @default(uuid())
  pageId      String? // null = ホームページ
  componentId String   // 旧: type SectionType → kebab-case 文字列
  order       Int         @default(0) // 表示順序（DnDで変更可能）
  isActive    Boolean     @default(true) // ON/OFF制御
  title       String? // セクション見出し（表示用）
  contentHtml String?     @db.Text @map("content") // HTMLキャッシュ（CUSTOM等で使用）
  contentJson Json? // Lexical EditorState JSON（プライマリ）
  config      Json        @default("{}") // タイプ別設定（Zodで型安全）
  design      Json        @default("{}") // ビジュアル設定（共通）
  effectConfig Json       @default("{}") // セクション単位のエフェクト設定（NEW）
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  // Relations
  page Page? @relation(fields: [pageId], references: [id], onDelete: Cascade)

  @@index([pageId, order, isActive])
  @@index([componentId])
  @@map("sections")
}
```

Page モデルに `effectConfig` を追加（既存フィールドの後に 1 行追加のみ）:

```prisma
  effectConfig Json       @default("{}") // ページ単位のエフェクト設定（NEW）
```

`enum SectionType { ... }` ブロック（`schema.prisma:76-95`）を完全削除。

**重要:** 実際のスキーマの既存フィールド名・`@default`・`@map` を一切変更しないこと。変更は `type` → `componentId` と `effectConfig` 追加と `@@index` 変更のみ。

- [ ] **Step 2: マイグレーション SQL を確認・編集**

`bunx --bun prisma migrate dev --name component-driven-sections --create-only` で SQL のみ生成し、**適用前に手動編集**する。

Prisma が自動生成する SQL は enum → text 変換で `USING` 句が不足する可能性がある。以下の完全な SQL を確認・追記:

```sql
-- Step 1: effectConfig カラム追加
ALTER TABLE "sections" ADD COLUMN "effectConfig" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "pages" ADD COLUMN "effectConfig" JSONB NOT NULL DEFAULT '{}';

-- Step 2: type → componentId に変換（enum → TEXT は USING 句が必須）
ALTER TABLE "sections" ALTER COLUMN "type" TYPE TEXT USING "type"::TEXT;

-- Step 3: UPPER_SNAKE_CASE → kebab-case に変換
UPDATE "sections" SET "type" = LOWER(REPLACE("type", '_', '-'));

-- Step 4: カラム名変更
ALTER TABLE "sections" RENAME COLUMN "type" TO "componentId";

-- Step 5: インデックス更新
DROP INDEX IF EXISTS "sections_type_idx";
CREATE INDEX "sections_componentId_idx" ON "sections"("componentId");

-- Step 6: SectionType enum 削除
DROP TYPE "SectionType";
```

**注意:** Prisma が自動生成する内容と手動 SQL を比較し、重複や欠落がないことを確認すること。

- [ ] **Step 3: db-migration-reviewer でレビュー**

Run: `db-migration-reviewer` サブエージェントでマイグレーション SQL をレビュー

- [ ] **Step 4: マイグレーション適用 + Prisma Client 再生成**

Run: `bunx --bun prisma migrate dev` + `bun run db:generate`

- [ ] **Step 5: 型チェック実行（失敗を確認）**

Run: `bun run type-check`
Expected: SectionType への参照が大量にエラーになる（これは正常 — 以降のタスクで修正する）

- [ ] **Step 6: コミット**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "refactor!: replace SectionType enum with componentId String + add effectConfig"
```

---

### Task 2: Core Type Definitions

**Files:**

- Create: `src/shared/lib/sections/types.ts`
- Create: `src/shared/lib/sections/component-ids.ts`

**Context:** Spec §コア型定義 と §ComponentId に基づく。`as` 型アサーション禁止。`as const` + `satisfies` のみ使用。

- [ ] **Step 1: テスト作成 — component-ids**

Create: `__tests__/unit/lib/sections/component-ids.test.ts`

```typescript
import { describe, expect, test } from "bun:test";
import { StandardComponentId } from "@/shared/lib/sections/component-ids";

describe("StandardComponentId", () => {
  test("all values are kebab-case strings", () => {
    for (const value of Object.values(StandardComponentId)) {
      expect(value).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  test("contains all 17 standard section types", () => {
    expect(Object.keys(StandardComponentId)).toHaveLength(17);
  });

  test("values are unique", () => {
    const values = Object.values(StandardComponentId);
    expect(new Set(values).size).toBe(values.length);
  });
});
```

- [ ] **Step 2: テスト実行（失敗確認）**

Run: `bun test __tests__/unit/lib/sections/component-ids.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: component-ids.ts 実装**

Create: `src/shared/lib/sections/component-ids.ts`

```typescript
/**
 * 標準セクションの識別子（Prisma SectionType enum の代替）
 *
 * DB の componentId カラムに格納される kebab-case 文字列。
 * Prisma の mapped enum パターン（as const + 型エイリアス）に準拠。
 */
export const StandardComponentId = {
  HERO: "hero",
  HERO_PARALLAX: "hero-parallax",
  CUSTOM: "custom",
  CONCEPT: "concept",
  SPACE_LIST: "space-list",
  SPACE_SHOWCASE: "space-showcase",
  NEWS_LIST: "news-list",
  POST_LIST: "post-list",
  FAQ_LIST: "faq-list",
  FEATURES: "features",
  TESTIMONIAL: "testimonial",
  GALLERY: "gallery",
  CTA: "cta",
  CONTACT_FORM: "contact-form",
  MAP: "map",
  EMBED: "embed",
  INSTAGRAM: "instagram",
} as const;

export type StandardComponentId =
  (typeof StandardComponentId)[keyof typeof StandardComponentId];

/**
 * 全 componentId の型（標準 + カスタム）。
 * レジストリの keyof で実際の ID を制約する。
 */
export type SectionComponentId = string;
```

- [ ] **Step 4: テスト実行（成功確認）**

Run: `bun test __tests__/unit/lib/sections/component-ids.test.ts`
Expected: PASS

- [ ] **Step 5: types.ts 実装**

Create: `src/shared/lib/sections/types.ts`

Spec §コア型定義 の内容をそのまま実装。`FieldUIHint`, `SectionComponentProps`, `ComponentLoader`, `ServerComponentLoader`, `SectionDataLoader`, `SectionDefinition`, `SectionCategory` を定義。

**重要:** `SectionDesign` 型は既存の `src/shared/lib/validations/section-design.ts` から `import type` する。新規定義しない。

- [ ] **Step 6: コミット**

```bash
git add src/shared/lib/sections/ __tests__/unit/lib/sections/
git commit -m "feat(sections): add core type definitions and component IDs"
```

---

### Task 3: Effect Layer Types & Schemas

**Files:**

- Create: `src/shared/lib/sections/effects/types.ts`
- Create: `src/shared/lib/sections/effects/schemas.ts`

**Context:** Spec §エフェクト層 に基づく。

- [ ] **Step 1: テスト作成 — effect schemas**

Create: `__tests__/unit/lib/sections/effects/schemas.test.ts`

```typescript
import { describe, expect, test } from "bun:test";
import {
  sectionEffectConfigSchema,
  pageEffectConfigSchema,
} from "@/shared/lib/sections/effects/schemas";

describe("sectionEffectConfigSchema", () => {
  test("parses empty object to default", () => {
    const result = sectionEffectConfigSchema.parse({});
    expect(result).toEqual({ overlays: [] });
  });

  test("parses valid overlay config", () => {
    const input = {
      overlays: [{ effectId: "pixi-grain", params: { intensity: 0.05 } }],
    };
    const result = sectionEffectConfigSchema.parse(input);
    expect(result.overlays).toHaveLength(1);
    expect(result.overlays[0].effectId).toBe("pixi-grain");
  });
});

describe("pageEffectConfigSchema", () => {
  test("parses empty object to defaults", () => {
    const result = pageEffectConfigSchema.parse({});
    expect(result).toEqual({ background: null, overlay: null });
  });
});
```

- [ ] **Step 2: テスト実行（失敗確認）**

Run: `bun test __tests__/unit/lib/sections/effects/schemas.test.ts`
Expected: FAIL

- [ ] **Step 3: effects/types.ts + effects/schemas.ts 実装**

Spec §エフェクト層 の内容をそのまま実装。

- [ ] **Step 4: テスト実行（成功確認）**

Run: `bun test __tests__/unit/lib/sections/effects/schemas.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/shared/lib/sections/effects/ __tests__/unit/lib/sections/effects/
git commit -m "feat(sections): add effect layer types and schemas"
```

---

### Task 4: Schema Utils — extractFieldDefinitions

**Files:**

- Create: `src/shared/lib/sections/schema-utils.ts`

**Context:** Spec §管理画面: スキーマ駆動フォーム の `extractFieldDefinitions()` を実装。`z.toJSONSchema()` + `.meta()` カスタムキーからフィールド定義を抽出。`as` 型アサーション禁止 — ランタイム型ガードのみ使用。

- [ ] **Step 1: テスト作成 — extractFieldDefinitions**

Create: `__tests__/unit/lib/sections/schema-utils.test.ts`

```typescript
import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { extractFieldDefinitions } from "@/shared/lib/sections/schema-utils";

describe("extractFieldDefinitions", () => {
  test("extracts basic string field", () => {
    const schema = z.object({
      title: z.string().default("").meta({ description: "タイトル" }),
    });
    const fields = extractFieldDefinitions(schema);
    expect(fields).toHaveLength(1);
    expect(fields[0].name).toBe("title");
    expect(fields[0].label).toBe("タイトル");
    expect(fields[0].fieldType).toBe("text");
  });

  test("extracts number field with min/max", () => {
    const schema = z.object({
      speed: z.number().min(0).max(1).default(0.3).meta({
        description: "速度",
        fieldType: "slider",
      }),
    });
    const fields = extractFieldDefinitions(schema);
    expect(fields[0].fieldType).toBe("slider");
    expect(fields[0].min).toBe(0);
    expect(fields[0].max).toBe(1);
  });

  test("extracts enum field as select", () => {
    const schema = z.object({
      position: z.enum(["left", "center", "right"]).default("center").meta({
        description: "位置",
      }),
    });
    const fields = extractFieldDefinitions(schema);
    expect(fields[0].fieldType).toBe("select");
    expect(fields[0].enumValues).toEqual(["left", "center", "right"]);
  });

  test("extracts boolean field as switch", () => {
    const schema = z.object({
      enabled: z.boolean().default(true).meta({
        description: "有効",
        fieldType: "switch",
      }),
    });
    const fields = extractFieldDefinitions(schema);
    expect(fields[0].fieldType).toBe("switch");
  });

  test("extracts custom fieldType from meta", () => {
    const schema = z.object({
      image: z.string().default("").meta({
        description: "画像",
        fieldType: "media",
      }),
    });
    const fields = extractFieldDefinitions(schema);
    expect(fields[0].fieldType).toBe("media");
  });

  test("extracts visibleWhen from meta", () => {
    const schema = z.object({
      mode: z.enum(["auto", "manual"]).default("auto").meta({
        description: "モード",
      }),
      manualValue: z
        .string()
        .default("")
        .meta({
          description: "手動値",
          visibleWhen: { field: "mode", value: "manual" },
        }),
    });
    const fields = extractFieldDefinitions(schema);
    expect(fields[1].visibleWhen).toEqual({
      field: "mode",
      value: "manual",
    });
  });

  test("returns empty array for non-object schema", () => {
    const schema = z.string();
    const fields = extractFieldDefinitions(schema);
    expect(fields).toEqual([]);
  });
});
```

- [ ] **Step 2: テスト実行（失敗確認）**

Run: `bun test __tests__/unit/lib/sections/schema-utils.test.ts`
Expected: FAIL

- [ ] **Step 3: schema-utils.ts 実装**

`z.toJSONSchema()` の出力を走査。カスタム `.meta()` キーは JSON Schema の各 property オブジェクトに含まれる（Zod 4 仕様）。型安全なアクセスにはランタイム型ガード関数を使用:

```typescript
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}
```

- [ ] **Step 4: テスト実行（成功確認）**

Run: `bun test __tests__/unit/lib/sections/schema-utils.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/shared/lib/sections/schema-utils.ts __tests__/unit/lib/sections/schema-utils.test.ts
git commit -m "feat(sections): implement extractFieldDefinitions with Zod 4 meta"
```

---

## Chunk 2: Standard Section Definitions + Registry

### Task 5: Create definition.ts for all 17 standard sections

**Files:**

- Create: 17 × `definition.ts` + 17 × `index.ts` in `src/app/(public)/_shared/components/sections/standard/`

**Context:** 既存の config スキーマは `src/shared/lib/validations/section.ts` にある。各 definition.ts は:

1. 既存スキーマに `.meta()` を追加した新バージョンを定義
2. メタデータ（label, description, icon, category）を `section.ts` の `sectionTypeLabels` / `sectionTypeDescriptions` / `sectionTypeIcons` / `sectionTypeCategories` から転記
3. コンポーネント参照は既存の `src/app/(public)/_components/XxxSection.tsx` を指す
4. リスト系セクション（space-list, space-showcase, news-list, post-list, faq-list）には `dataLoader` を定義

**17 セクションの対応表:**

| componentId    | 既存コンポーネント  | component.type | dataLoader           |
| -------------- | ------------------- | -------------- | -------------------- |
| hero           | StandardHeroSection | server         | -                    |
| hero-parallax  | HeroSection         | client         | -                    |
| custom         | CustomSection       | server         | -                    |
| concept        | ConceptSection      | server         | -                    |
| space-list     | SpaceListSection    | server         | getShowcaseSpaces    |
| space-showcase | SpaceShowcase       | server         | getShowcaseSpaces    |
| news-list      | NewsListSection     | server         | getPublishedNews     |
| post-list      | PostListSection     | server         | getPublishedPosts    |
| faq-list       | FaqListSection      | server         | getPublishedFaqItems |
| features       | FeaturesSection     | server         | -                    |
| testimonial    | TestimonialSection  | server         | -                    |
| gallery        | GallerySection      | server         | -                    |
| cta            | CTASection          | server         | -                    |
| contact-form   | ContactFormSection  | server         | -                    |
| map            | MapSection          | client         | -                    |
| embed          | EmbedSection        | server         | -                    |
| instagram      | InstagramSection    | client-only    | -                    |

**注意:** 既存コンポーネントは `src/app/(public)/_components/` にある（`@/public/` エイリアスは `_shared/` にマップされるため直接使えない）。definition.ts の `component.load()` は既存コンポーネントへの **相対パス** を使用する。コンポーネント自体の移動・リファクタは本計画の対象外。

**SectionComponentProps 互換性:** 既存コンポーネントの props シグネチャは `SectionComponentProps<T>` 形式ではない（例: `CustomSection` は `content` prop が別）。各 definition.ts で薄いアダプター関数を定義し、`extraData` から既存 props に変換する。アダプターは同一ファイル内のインライン関数で良い。

**パターン例（hero-parallax）:**

```typescript
// src/app/(public)/_shared/components/sections/standard/hero-parallax/definition.ts
import { z } from "zod";
import type { SectionDefinition } from "@/shared/lib/sections/types";
import {
  createCtaButtonItemSchema,
  createSafeUrlSchema,
} from "@/shared/lib/validations/section-design";

const safeUrlSchema = createSafeUrlSchema(500);
const ctaButtonItemSchema = createCtaButtonItemSchema(safeUrlSchema);

// 既存 heroParallaxConfigSchema + .meta() UI hints
export const heroParallaxConfigSchema = z.object({
  tagline: z
    .string()
    .max(50, { error: "タグラインは50文字以内です" })
    .default("Luxury Rental Space")
    .meta({
      description: "タグライン",
      fieldType: "text",
      placeholder: "Luxury Rental Space",
    }),
  title: z
    .string()
    .max(100, { error: "タイトルは100文字以内です" })
    .default("洗練された空間で 特別なひとときを")
    .meta({
      description: "メインタイトル",
      fieldType: "text",
    }),
  // ... 残りフィールド（既存スキーマ + .meta() 追加）
});

export type HeroParallaxConfig = z.output<typeof heroParallaxConfigSchema>;

export const heroParallaxDefinition: SectionDefinition<
  typeof heroParallaxConfigSchema
> = {
  id: "hero-parallax",
  meta: {
    label: "パララックスヒーロー",
    description:
      "パララックス効果付きヒーロー。スクロールに連動した奥行きのある表現。",
    icon: "Layers",
    category: "hero",
  },
  configSchema: heroParallaxConfigSchema,
  defaultConfig: heroParallaxConfigSchema.parse({}),
  component: {
    type: "client",
    // 既存コンポーネントへの相対パス（_components/ は _shared/ の外にある）
    load: () => import("../../../../_components/HeroSection"),
    // NOTE: 既存 HeroSection を移動するまでは一時的に _components/HeroSection を参照
  },
  effects: {
    supportsOverlay: true,
    requiresExperienceShell: false,
  },
};
```

**index.ts パターン:**

```typescript
export { heroParallaxDefinition, heroParallaxConfigSchema } from "./definition";
export type { HeroParallaxConfig } from "./definition";
```

- [ ] **Step 1: hero-parallax definition を作成（パターン確立）**

Create:

- `src/app/(public)/_shared/components/sections/standard/hero-parallax/definition.ts`
- `src/app/(public)/_shared/components/sections/standard/hero-parallax/index.ts`

既存の `heroParallaxConfigSchema`（`section.ts:124-157`）の各フィールドに `.meta()` を追加。

- [ ] **Step 2: hero definition を作成**

Create: `standard/hero/definition.ts` + `index.ts`

既存 `heroConfigSchema`（`section.ts:91-121`）を移行。注意: `.transform()` パターン（legacyCTA → buttons 統合）があるため、新スキーマでは transform なしの clean バージョンにする（破壊的変更 OK）。

- [ ] **Step 3: 残り 15 セクションの definition を作成**

Create: `standard/{custom,concept,space-list,space-showcase,news-list,post-list,faq-list,features,testimonial,gallery,cta,contact-form,map,embed,instagram}/definition.ts` + `index.ts`

各セクションの既存スキーマ（`section.ts`）を `.meta()` 付きに移行。

**リスト系セクションの dataLoader 例（space-list）:**

```typescript
import { getShowcaseSpaces } from "@/shared/domain/sections/queries";

export const spaceListDefinition: SectionDefinition<
  typeof spaceListConfigSchema
> = {
  // ...
  dataLoader: async (config) => {
    const spaces = await getShowcaseSpaces(
      config.maxItems,
      config.showOnlyPublished,
    );
    return {
      spaces: spaces.map((s) => ({
        id: s.id,
        slug: s.slug,
        name: s.name,
        description: s.description,
        capacity: s.capacity,
        hourlyPrice: s.hourlyPrice,
        area: s.area,
        mainImageUrl: s.mainImageUrl,
      })),
    };
  },
  // ...
};
```

- [ ] **Step 4: 全 definition の configSchema.parse({}) が成功することを確認**

Task 6 のレジストリテストで網羅的に検証するが、この段階で簡易確認を行う:

```bash
bun -e "
const glob = new Bun.Glob('src/app/(public)/_shared/components/sections/standard/*/definition.ts');
for await (const path of glob.scan('.')) {
  const mod = await import('./' + path);
  const defKey = Object.keys(mod).find(k => k.endsWith('Definition'));
  if (defKey) {
    const def = mod[defKey];
    def.configSchema.parse({});
    console.log('OK:', def.id);
  }
}
"
```

Expected: 全 17 セクションで OK が出力される

- [ ] **Step 5: 型チェック**

Run: `bun run type-check`
Expected: definition.ts 自体はエラーなし（他ファイルのエラーは後続タスクで対応）

- [ ] **Step 5: コミット**

```bash
git add 'src/app/(public)/_shared/components/sections/standard/'
git commit -m "feat(sections): create definition.ts for all 17 standard sections"
```

---

### Task 6: Section Registry

**Files:**

- Create: `src/shared/lib/sections/registry.ts` (レジストリ本体 — lookup 関数 + `registerSection()` API)
- Create: `src/app/(public)/_shared/lib/sections/register-standard-sections.ts` (全 17 definition を登録)

**Context:** Spec §セクションレジストリ。全 17 definition を集約し、lookup 関数を提供。

**⚠️ Import 方向の解決 — `registerSection()` API パターン:**

`src/shared/` は `src/app/(public)/` を import できない。解決策:

1. **`src/shared/lib/sections/registry.ts`** — レジストリ本体。`registerSection()` で definition を登録する API と、`getSectionDefinition()` 等の lookup 関数を export。**import 方向違反なし**（`src/shared/` 内で完結）。
2. **`src/app/(public)/_shared/lib/sections/register-standard-sections.ts`** — public 側で全 17 definition を import し、`registerSection()` で登録するブートストラップファイル。SectionRenderer や layout.tsx の初期化時に呼ぶ。
3. **admin 側** — `@/shared/lib/sections/registry` から lookup 関数のみ import。definition は公開ページ側で登録済み（Server Component tree の評価順で先に登録される）。ただし admin 単独実行時（管理画面プレビュー等）にも動作するよう、admin 側にも `register-standard-sections` の import を入れる。

- [ ] **Step 1: テスト作成**

Create: `__tests__/unit/lib/sections/registry.test.ts`

```typescript
// bootstrap: 全 definition を registry に登録
import "@/public/lib/sections/register-standard-sections";

import { describe, expect, test } from "bun:test";
import {
  getSectionDefinition,
  getRegisteredComponentIds,
  getSectionsByCategory,
} from "@/shared/lib/sections/registry";
import { StandardComponentId } from "@/shared/lib/sections/component-ids";

describe("sectionRegistry", () => {
  test("all 17 standard sections are registered", () => {
    const ids = getRegisteredComponentIds();
    expect(ids.length).toBeGreaterThanOrEqual(17);
    for (const id of Object.values(StandardComponentId)) {
      expect(ids).toContain(id);
    }
  });

  test("getSectionDefinition returns definition for valid id", () => {
    const def = getSectionDefinition("hero-parallax");
    if (!def) throw new Error("Expected hero-parallax definition to exist");
    expect(def.id).toBe("hero-parallax");
    expect(def.meta.label).toBeTruthy();
  });

  test("getSectionDefinition returns undefined for unknown id", () => {
    expect(getSectionDefinition("nonexistent")).toBeUndefined();
  });

  test("getSectionsByCategory groups correctly", () => {
    const categories = getSectionsByCategory();
    expect(categories.length).toBeGreaterThanOrEqual(5);
    const heroCategory = categories.find((c) => c.category === "hero");
    if (!heroCategory) throw new Error("Expected hero category to exist");
    expect(heroCategory.sections.length).toBeGreaterThanOrEqual(2);
  });

  test("all definitions have valid configSchema", () => {
    for (const id of getRegisteredComponentIds()) {
      const def = getSectionDefinition(id);
      if (!def) throw new Error(`Expected definition for ${id} to exist`);
      // configSchema.parse({}) should not throw (all fields have .default())
      expect(() => def.configSchema.parse({})).not.toThrow();
    }
  });
});
```

- [ ] **Step 2: テスト実行（失敗確認）**

Run: `bun test __tests__/unit/lib/sections/registry.test.ts`
Expected: FAIL

- [ ] **Step 3: registry.ts 実装**

Create: `src/shared/lib/sections/registry.ts`

```typescript
import type { SectionDefinition, SectionCategory } from "./types";

// ---- Mutable registry (populated by registerSection()) ----
const sectionRegistry = new Map<string, SectionDefinition>();

/** definition を登録する。public 側の bootstrap ファイルから呼ばれる。 */
export function registerSection(definition: SectionDefinition): void {
  sectionRegistry.set(definition.id, definition);
}

/** definition を取得。未登録なら undefined。 */
export function getSectionDefinition(
  componentId: string,
): SectionDefinition | undefined {
  return sectionRegistry.get(componentId);
}

/** 登録済み全 componentId を取得。 */
export function getRegisteredComponentIds(): string[] {
  return [...sectionRegistry.keys()];
}

const CATEGORY_ORDER: readonly SectionCategory[] = [
  "hero",
  "content",
  "list",
  "interactive",
  "media",
  "utility",
];

/** カテゴリ別にグループ化して返す。 */
export function getSectionsByCategory() {
  const groups = new Map<
    SectionCategory,
    { category: SectionCategory; sections: SectionDefinition[] }
  >();
  for (const cat of CATEGORY_ORDER) {
    groups.set(cat, { category: cat, sections: [] });
  }
  for (const def of sectionRegistry.values()) {
    const group = groups.get(def.meta.category);
    if (group) group.sections.push(def);
  }
  return [...groups.values()].filter((g) => g.sections.length > 0);
}
```

- [ ] **Step 3b: register-standard-sections.ts 作成**

Create: `src/app/(public)/_shared/lib/sections/register-standard-sections.ts`

```typescript
import { registerSection } from "@/shared/lib/sections/registry";
// 全 17 definition を import
import { heroDefinition } from "../../components/sections/standard/hero";
import { heroParallaxDefinition } from "../../components/sections/standard/hero-parallax";
// ... 残り 15 definition
// 登録
registerSection(heroDefinition);
registerSection(heroParallaxDefinition);
// ... 残り 15
```

**このファイルは SectionRenderer.tsx の先頭で `import "@/public/lib/sections/register-standard-sections"` として副作用 import する。** admin 側でも同様のブートストラップを `register-admin-sections.ts` として作成する（admin 側は component.load を使わないため、meta + configSchema のみの軽量版でも可）。

- [ ] **Step 4: テスト実行（成功確認）**

Run: `bun test __tests__/unit/lib/sections/registry.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/shared/lib/sections/registry.ts __tests__/unit/lib/sections/registry.test.ts
git commit -m "feat(sections): implement section registry with all 17 standard sections"
```

---

## Chunk 3: Domain Layer + Server Actions Migration

### Task 7: Migrate Domain Layer (queries + commands)

**Files:**

- Modify: `src/shared/domain/sections/queries.ts` (~201 lines)
- Modify: `src/shared/domain/sections/admin-queries.ts` (~235 lines)
- Modify: `src/shared/domain/sections/commands.ts` (~377 lines)
- Modify: `src/shared/db/enums.ts` (1 line)

**Context:** `SectionType` enum の全参照を `componentId: string` に変更。Prisma の `where: { type: ... }` を `where: { componentId: ... }` に。`PublicSection` 型の `type` フィールドを `componentId` に。

- [ ] **Step 1: enums.ts から SectionType の再エクスポートを削除**

`src/shared/db/enums.ts` は `export * from "@generated/prisma/enums"` の 1 行。Prisma Client 再生成後は SectionType が存在しないため自動的に消える。追加対応不要。

- [ ] **Step 2: queries.ts の PublicSection 型を更新**

`PublicSection` 型の `type: SectionType` → `componentId: string` に変更。Prisma select の `type: true` → `componentId: true` に。

**追加:** `effectConfig` フィールドを `PublicSection` 型と Prisma select に追加（Task 1 で DB カラム追加済み）:

```typescript
// PublicSection 型に追加
effectConfig: JsonValue | null;
// Prisma select に追加
effectConfig: true,
```

- [ ] **Step 3: admin-queries.ts を更新**

同様に Prisma select/where の `type` → `componentId` 変更。

- [ ] **Step 4: commands.ts を更新**

`createHomepageSectionCommand` 等の `type: SectionType` パラメータを `componentId: string` に。Prisma の `data: { type: ... }` → `data: { componentId: ... }` に。

- [ ] **Step 5: 型チェック**

Run: `bun run type-check`
Expected: ドメイン層のエラーは解消。呼び出し元（Actions, UI）にまだエラーあり。

**注意:** `system-pages.ts`, `default-page-sections.ts`, `enums.ts` の `SectionType` 参照エラーはこの時点では正常 — Task 8 で修正する。

- [ ] **Step 6: コミット**

```bash
git add src/shared/domain/sections/ src/shared/db/enums.ts
git commit -m "refactor(sections): migrate domain layer from SectionType to componentId"
```

---

### Task 8: Migrate Validation Layer

**Files:**

- Modify: `src/shared/lib/validations/section.ts` (~1544 lines)
- Modify: `src/shared/lib/validations/enums.ts` (~574 lines)
- Modify: `src/shared/lib/constants/default-page-sections.ts` (~256 lines)
- Modify: `src/shared/domain/pages/system-pages.ts` (~172 lines)

**Context:** `section.ts` の大規模リファクタ。`SectionType` 依存の Record 型マッピング（`sectionConfigSchemas`, `sectionTypeLabels`, `sectionTypeDescriptions`, `sectionTypeIcons`, `sectionTypeCategories` 等）をレジストリに委譲。個別の config スキーマ export は definition.ts に移行済みなので、互換性のために re-export するか、呼び出し元を直接更新する。

- [ ] **Step 1: section.ts の SectionType 依存箇所を更新**

このタスクでは **SectionType 型参照の解消** に集中する。大規模な削除は Task 15 で行う:

- `createSectionSchema`, `updateSectionSchema` の `type: z.nativeEnum(SectionType)` → `componentId: z.string()` に変更
- `sectionConfigSchemas` Record の型を `Record<SectionType, ...>` → `Record<string, ...>` に一時変更（Task 15 で削除）
- `getSafeConfig` の `type: SectionType` パラメータ → `componentId: string` に変更（Task 15 で削除）
- `SectionType` import を全て除去

**注意:** メタデータ Record（`sectionTypeLabels` 等）と `getXxxConfig` 関数の完全削除は Task 15 で実施。この段階では型エラーの解消のみ。

- [ ] **Step 2: enums.ts の isValidSectionType を削除**

`src/shared/lib/validations/enums.ts` の `isValidSectionType` 関数と `VALID_SECTION_TYPES` Set を削除。

代替: レジストリの `getSectionDefinition(id) !== undefined` で検証。

- [ ] **Step 3: default-page-sections.ts を更新**

`SectionType.HERO` → `StandardComponentId.HERO` (`"hero"`) に全置換。`DefaultSectionDef.type` → `componentId` に。

- [ ] **Step 4: system-pages.ts を更新**

`SectionType` 参照を `StandardComponentId` に変更。

- [ ] **Step 5: 既存テスト更新**

`__tests__/unit/lib/validations/section.test.ts` を更新:

- `SectionType` 参照をレジストリベースに
- `getSafeConfig` テストを `getSectionDefinition(id).configSchema.parse()` に

- [ ] **Step 6: テスト実行**

Run: `bun test __tests__/unit/lib/validations/`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add src/shared/lib/validations/ src/shared/lib/constants/ src/shared/domain/pages/ __tests__/
git commit -m "refactor(sections): migrate validation layer to registry-based lookups"
```

---

### Task 9: Migrate Server Actions

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/page-section.ts` (~219 lines)
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/homepage-settings.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/queries/homepage-settings.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/queries/page-section.ts`

**Context:** Server Actions の `type: SectionType` パラメータを `componentId: string` に変更。バリデーションはレジストリの `configSchema` を使用。

- [ ] **Step 1: page-section.ts を更新**

`createPageSection` の input から `type: SectionType` → `componentId: string` に。
`getSectionDefinition(componentId)` でスキーマを取得し、config をバリデーション。

```typescript
// Before
const configSchema = sectionConfigSchemas[input.type];
// After
const definition = getSectionDefinition(input.componentId);
if (!definition) throw new Error(`Unknown section: ${input.componentId}`);
const validConfig = definition.configSchema.parse(input.config);
```

- [ ] **Step 2: homepage-settings.ts を更新**

同様に `SectionType` → `componentId` 変更。

- [ ] **Step 3: クエリファイルを更新**

`type` → `componentId` の select/where 変更。

- [ ] **Step 4: 統合テスト更新**

`__tests__/integration/actions/admin/page-section.test.ts` を `componentId` ベースに更新。

- [ ] **Step 5: テスト実行**

Run: `bun test __tests__/integration/actions/admin/page-section.test.ts`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add 'src/app/(admin)/' __tests__/integration/
git commit -m "refactor(sections): migrate server actions from SectionType to componentId"
```

---

## Chunk 4: Public Rendering — SectionRenderer + Effects

### Task 10: Rewrite SectionRenderer

**Files:**

- Modify: `src/app/(public)/_shared/components/sections/SectionRenderer.tsx` (~256 lines → ~60 lines)

**Context:** Spec §SectionRenderer の再設計。256 行の switch 文をレジストリベースの動的ディスパッチに書き換え。Server Component のまま。

- [ ] **Step 1: SectionRenderer を書き換え**

**⚠️ `dynamic()` はモジュールスコープで事前ビルドする。** レンダー関数内で呼ぶと毎回新しいコンポーネント ID が生成され、React の reconciliation が壊れる（フリッカー + state 喪失）。

```typescript
// 副作用 import: 全 17 standard section を registry に登録
import "@/public/lib/sections/register-standard-sections";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import {
  getSectionDefinition,
  getRegisteredComponentIds,
} from "@/shared/lib/sections/registry";
import { parseSectionDesign } from "@/shared/lib/validations/section-design";
import { sectionEffectConfigSchema } from "@/shared/lib/sections/effects/schemas";
import { SectionWrapper } from "./SectionWrapper";
import type { PublicSection } from "@/shared/domain/sections/queries";

// ---- Module scope: Client Component map を一度だけビルド ----
const clientComponentMap: Record<string, ReturnType<typeof dynamic>> = {};
for (const id of getRegisteredComponentIds()) {
  const def = getSectionDefinition(id);
  if (!def || def.component.type === "server") continue;
  clientComponentMap[id] =
    def.component.type === "client-only"
      ? dynamic(def.component.load, { ssr: false })
      : dynamic(def.component.load);
}

export async function SectionRenderer({
  section,
}: {
  readonly section: PublicSection;
}) {
  const definition = getSectionDefinition(section.componentId);
  if (!definition) {
    if (process.env["NODE_ENV"] === "development") {
      console.warn(`Unknown section componentId: ${section.componentId}`);
    }
    return null;
  }

  const config = definition.configSchema.parse(section.config);
  const design = parseSectionDesign(section.design);
  const effectConfig = sectionEffectConfigSchema.parse(
    section.effectConfig ?? {},
  );

  // dataLoader がある場合（リスト系セクション等）
  const extraData = definition.dataLoader
    ? await definition.dataLoader(config)
    : {};

  // セクションレベルの共通フィールド（contentHtml, title 等）も渡す
  const sectionFields = {
    title: section.title,
    contentHtml: section.contentHtml,
  };

  let rendered: React.ReactNode;
  if (definition.component.type === "server") {
    const { default: ServerComp } = await definition.component.load();
    rendered = (
      <ServerComp
        config={config}
        design={design}
        extraData={extraData}
        section={sectionFields}
      />
    );
  } else {
    const ClientComp = clientComponentMap[section.componentId];
    if (!ClientComp) return null;
    rendered = (
      <Suspense fallback={null}>
        <ClientComp
          config={config}
          design={design}
          extraData={extraData}
          section={sectionFields}
        />
      </Suspense>
    );
  }

  return <SectionWrapper design={design}>{rendered}</SectionWrapper>;
}
```

**SectionComponentProps にセクションレベルフィールドを追加:** 既存の `CustomSection` 等は `content`/`title` をセクションレベルで受け取る。`SectionComponentProps` の `section` プロパティ経由で `title`, `contentHtml` を渡す。Types 定義（Task 2）の `SectionComponentProps` に以下を追加:

```typescript
/** セクションテーブルの共通フィールド（config 外） */
export type SectionFields = {
  readonly title: string | null;
  readonly contentHtml: string | null;
};

export type SectionComponentProps<TConfig = Record<string, unknown>> = {
  readonly config: TConfig;
  readonly design: SectionDesign;
  readonly extraData?: Record<string, unknown>;
  readonly section?: SectionFields; // セクションレベル共通フィールド
};
```

既存コンポーネントは `section.title` / `section.contentHtml` 経由でアクセスするように段階的に更新する。

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`

- [ ] **Step 3: ローカルで動作確認**

Run: `bun dev` → ブラウザでホームページを確認。全セクションが正常に表示されることを確認。

- [ ] **Step 4: コミット**

```bash
git add 'src/app/(public)/_shared/components/sections/SectionRenderer.tsx'
git commit -m "refactor(sections): rewrite SectionRenderer to registry-based dispatch"
```

---

### Task 11: ExperienceShell to Layout + Effect Renderers

**Files:**

- Modify: `src/app/(public)/layout.tsx` (~253 lines)
- Modify: `src/app/(public)/page.tsx` (~51 lines)
- Create: `src/app/(public)/_shared/components/effects/EffectOverlayRenderer.tsx`
- Create: `src/app/(public)/_shared/components/effects/PageEffectRenderer.tsx`
- Create: `src/app/(public)/_shared/components/effects/registry.ts`

**Context:** ExperienceShell を page.tsx から layout.tsx に移動し、全公開ページで利用可能にする。エフェクトレジストリとレンダラーを追加。

- [ ] **Step 1: page.tsx から ExperienceShell を削除**

`src/app/(public)/page.tsx` から `ExperienceShell` import と JSX ラッピングを削除。セクション描画のみ残す。

- [ ] **Step 2: layout.tsx に ExperienceShell を追加**

`src/app/(public)/layout.tsx` で `<ExperienceShell>` を `<AriaLiveProvider>` 直下（Header/main/Footer を全て内包する位置）に追加。Header のスクロール連動アニメーション（hide/show）や Footer が SmoothScrollProvider / ScrollOrchestratorProvider のコンテキスト外になるのを防ぐ:

```tsx
<AriaLiveProvider>
  <ExperienceShell>
    <SkipLink />
    <AnnouncementBarWrapper ... />
    <Header ... />
    <main id="main-content" className="flex-1" ...>
      {/* NuqsAdapter は Suspense 内に維持（nuqs-patterns.md 準拠） */}
      <Suspense fallback={null}>
        <NuqsAdapter>{children}</NuqsAdapter>
      </Suspense>
    </main>
    <Footer ... />
  </ExperienceShell>
  <DynamicContent />
</AriaLiveProvider>
```

**注意:** `ExperienceShell` は `"use client"` のため、Header/Footer が Server Component の場合でも `children` として渡す分には問題ない（Server → Client の children パスは Next.js がサポート）。

- [ ] **Step 3: エフェクトレジストリ作成**

Create: `src/app/(public)/_shared/components/effects/registry.ts`
Spec §エフェクトレジストリ の内容を実装。既存 Three.js/PixiJS コンポーネントを登録。

- [ ] **Step 4: EffectOverlayRenderer 作成**

Create: `src/app/(public)/_shared/components/effects/EffectOverlayRenderer.tsx`

セクション単位のオーバーレイエフェクトを描画する Client Component。`effectConfig.overlays` を走査して `next/dynamic` で各エフェクトをロード。

- [ ] **Step 5: PageEffectRenderer 作成**

Create: `src/app/(public)/_shared/components/effects/PageEffectRenderer.tsx`

ページ単位のエフェクト（背景 Three.js + オーバーレイ PixiJS）を描画。**`PageEffectRenderer` は Server Component** として `page.tsx` / `[...segments]/page.tsx` に配置し、props 経由で `effectConfig` を渡す（layout.tsx ではページ固有データにアクセスできないため）:

```tsx
// page.tsx 内での使用例
<PageEffectRenderer effectConfig={page.effectConfig} />
<SectionRenderer section={section} />
```

`PageEffectRenderer` は内部で `next/dynamic` を使って Client Component（Three.js Canvas / PixiJS Canvas）を遅延ロードする。

- [ ] **Step 6: 動作確認**

Run: `bun dev` → ホームページ + カスタムページ（`/about` 等）でセクションが正常表示されることを確認。

- [ ] **Step 7: コミット**

```bash
git add 'src/app/(public)/'
git commit -m "feat(sections): move ExperienceShell to layout + add effect renderers"
```

---

## Chunk 5: Admin UI — SchemaForm + Migration

### Task 12: SchemaForm Implementation

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/schema-form/SchemaForm.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/schema-form/FieldRenderer.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/schema-form/ConditionalWrapper.tsx`
- Create: 11 × field components in `schema-form/fields/`

**Context:** Spec §管理画面: スキーマ駆動フォーム。`extractFieldDefinitions()` の出力を元にフォームを自動生成。

**各フィールドコンポーネント:**
| fieldType | ファイル | 使用する UI | 備考 |
|---|---|---|---|
| text | AutoTextField.tsx | Input | - |
| textarea | AutoTextareaField.tsx | Textarea | rows prop |
| url | AutoTextField.tsx | Input type="url" | text と共用可 |
| number | AutoNumberField.tsx | Input type="number" | min/max |
| slider | AutoSliderField.tsx | Slider | min/max/step |
| select | AutoSelectField.tsx | Select | enumValues |
| switch | AutoSwitchField.tsx | Switch | - |
| color | AutoColorField.tsx | ColorPicker | CSS 変数名入力 |
| media | MediaPickerField.tsx | useSingleMediaPicker | 既存ラッパー |
| media-multiple | MultiMediaPickerField.tsx | useMultipleMediaPicker | 既存ラッパー |
| cta-buttons | CTAButtonEditorField.tsx | CTAButtonEditor | 既存ラッパー |
| icon-select | IconSelectField.tsx | LucideIcon select | 新規 |

- [ ] **Step 1: SchemaForm.tsx 作成**

Spec §SchemaForm の内容を実装。`react-hook-form` + `standardSchemaResolver` + `extractFieldDefinitions`。

- [ ] **Step 2: FieldRenderer.tsx 作成**

`fieldType` に基づいて適切なフィールドコンポーネントを返す switch。

- [ ] **Step 3: ConditionalWrapper.tsx 作成**

`visibleWhen` による条件表示。`useWatch` で監視フィールドの値を取得し、条件を評価。

- [ ] **Step 4: 基本フィールド（text, textarea, number, select, switch, slider）作成**

- [ ] **Step 5: カスタムフィールド（media, cta-buttons, color, icon-select）作成**

MediaPickerField, CTAButtonEditorField は既存コンポーネントのラッパー。

- [ ] **Step 6: FieldRenderer テスト作成**

Create: `__tests__/unit/admin/components/schema-form/FieldRenderer.test.ts`

`extractFieldDefinitions` の出力を渡して、各 `fieldType` に対応するフィールドコンポーネントが返されることをテスト。

- [ ] **Step 7: 型チェック + テスト実行**

Run: `bun run type-check && bun test __tests__/unit/admin/components/schema-form/`

- [ ] **Step 8: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/_shared/components/schema-form/' __tests__/unit/admin/components/schema-form/
git commit -m "feat(admin): implement SchemaForm with Zod 4 meta-driven field generation"
```

---

### Task 13: Migrate Admin UI Components

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionDetailPanel.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionDetailHeader.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionSidebarItem.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionMasterDetail.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/sections/_components/AddSectionDialog.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/settings/_components/homepage/HomepageTab.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/settings/_components/homepage/SectionEditor.tsx`

**Context:** `configFormRegistry` を SchemaForm に置換。`SectionType` 参照をレジストリベースに。Spec の変更ファイルリストに含まれる全 admin UI ファイルを対象にする。

- [ ] **Step 1: SectionDetailPanel を更新**

`configFormRegistry[section.type]` → `SchemaForm` + `getSectionDefinition(section.componentId).configSchema`。

- [ ] **Step 2: AddSectionDialog を更新**

`SectionType` のリストではなく `getSectionsByCategory()` を使用。アイコンは `definition.meta.icon` から取得。

- [ ] **Step 3: SectionDetailHeader を更新**

`SectionTypeIcon` コンポーネント → レジストリの `definition.meta.icon` から Lucide アイコンを動的解決。

- [ ] **Step 4: SectionSidebarItem を更新**

同様にアイコンをレジストリから取得。

- [ ] **Step 5: SectionMasterDetail を更新**

`SectionType` 参照を `componentId` ベースに。セクション一覧のフィルタ・ソートで `type` → `componentId`。

- [ ] **Step 6: HomepageTab + SectionEditor を更新**

ホームページ設定の `SectionType` 参照を `componentId` + レジストリベースに。`SectionEditor` は SchemaForm を使用。

- [ ] **Step 7: 型チェック + lint**

Run: `bun run validate`

- [ ] **Step 8: 動作確認**

Run: `bun dev` → 管理画面で以下を確認:

- カスタムページのセクション編集が機能すること
- ホームページ設定のセクション編集が機能すること
- 全セクションタイプの追加・編集・削除が動作すること

- [ ] **Step 9: コミット**

```bash
git add 'src/app/(admin)/'
git commit -m "refactor(admin): migrate section UI to registry-based SchemaForm"
```

---

### Task 14: Effect Editor UI

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/effect-editor/EffectSelector.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/effect-editor/EffectParamsForm.tsx`

**Context:** セクション編集画面の「エフェクト」タブ。エフェクトレジストリから選択可能なエフェクトを表示し、パラメータを SchemaForm で編集。

- [ ] **Step 1: EffectSelector.tsx 作成**

エフェクトレジストリから選択可能なエフェクト一覧を表示。`layer: "overlay"` のみフィルタ（セクション単位）。

- [ ] **Step 2: EffectParamsForm.tsx 作成**

選択されたエフェクトの `schema` を SchemaForm に渡してパラメータ編集 UI を生成。

- [ ] **Step 3: SectionDetailPanel にエフェクトタブを追加**

Tabs コンポーネントに「エフェクト」タブを追加。

- [ ] **Step 4: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/_shared/components/effect-editor/'
git commit -m "feat(admin): add effect editor UI with schema-driven params form"
```

---

## Chunk 6: Cleanup + Tests + CLI Skill

### Task 15: Delete Old Files

**Files:**

- Delete: 17 × config form files + `index.ts` + `shared.tsx` (~20 files)
- Delete: `SectionTypeIcon.tsx`

**Context:** SchemaForm に移行完了後、旧フォームファイルを削除。

- [ ] **Step 1: config-forms/ ディレクトリを削除**

`git rm -r 'src/app/(admin)/admin/(dashboard)/pages/[slug]/sections/_components/config-forms/'`

- [ ] **Step 2: SectionTypeIcon.tsx を削除**

`git rm 'src/app/(admin)/admin/(dashboard)/pages/[slug]/sections/_components/SectionTypeIcon.tsx'`

- [ ] **Step 3: section.ts の不要エクスポートを整理**

`src/shared/lib/validations/section.ts` から:

- 17 個の `getXxxConfig` 関数を削除（definition.ts に移行済み）
- `sectionConfigSchemas`, `defaultSectionConfigs`, `sectionConfigParsers` Record を削除
- `sectionTypeLabels` 等のメタデータ Record を削除

ファイルは大幅に縮小（~1544 行 → ~200 行）。残すのは:

- `createSectionSchema`, `updateSectionSchema`, `updateSectionOrderSchema`
- 共通 Zod ヘルパー（`safeUrlSchema`, `ctaButtonItemSchema` 等）
- re-export（`sectionDesignSchema`, `parseSectionDesign` 等）

- [ ] **Step 4: 型チェック + lint で参照漏れ確認**

Run: `bun run validate`
Expected: 削除したシンボルへの参照がないことを確認

- [ ] **Step 5: コミット**

```bash
git add src/shared/lib/validations/section.ts
git commit -m "refactor(sections): delete 19 legacy config form files and unused type maps"
```

**注意:** Step 1-2 の `git rm` で削除ファイルは既にステージング済み。

---

### Task 16: Update Tests

**Files:**

- Modify: `__tests__/unit/lib/validations/section.test.ts`
- Modify: `__tests__/integration/actions/admin/page-section.test.ts`
- Modify: `__tests__/unit/lib/validations/homepage-section.test.ts`

**Context:** テストを新アーキテクチャに適合。

- [ ] **Step 1: section.test.ts を更新**

`SectionType` ベースのテストをレジストリベースに:

- `sectionConfigSchemas[SectionType.HERO]` → `getSectionDefinition("hero")?.configSchema`（null guard 付き）
- `defaultSectionConfigs[SectionType.HERO]` → `getSectionDefinition("hero")?.defaultConfig`
- 各タイプのスキーマバリデーションテストはそのまま維持（スキーマ取得方法のみ変更）

- [ ] **Step 2: page-section.test.ts を更新**

`type: SectionType.HERO_PARALLAX` → `componentId: "hero-parallax"` に変更。

- [ ] **Step 3: homepage-section.test.ts を更新**

同様に `SectionType` → `componentId` 変更。

- [ ] **Step 4: 全テスト実行**

Run: `bun run test:all`
Expected: ALL PASS

- [ ] **Step 5: コミット**

```bash
git add __tests__/
git commit -m "test(sections): update all section tests to registry-based architecture"
```

---

### Task 17: Full Validation + Build

**Files:** None (verification only)

- [ ] **Step 1: 型チェック + lint**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 2: ビルド**

Run: `bun run build`
Expected: PASS

- [ ] **Step 3: 全テスト**

Run: `bun run test:all`
Expected: ALL PASS

- [ ] **Step 4: 最終コミット（必要な場合）**

修正が必要だった場合のみコミット。

---

### Task 18: CLI Skill — create-custom-section

**Files:**

- Create: `.claude/skills/create-custom-section/SKILL.md`

**Context:** Spec §CLI スキル: create-custom-section。Claude Code のスキルとして `create-custom-section` を作成。ユーザーが「多層パララックスで高級感のある Hero を作って」等と指示すると:

1. `standard/` ではなく `custom/` 配下にセクションフォルダを生成
2. `definition.ts` + コンポーネント `.tsx` + `index.ts` を生成
3. `registry.ts` にエントリ追加

- [ ] **Step 1: スキルファイル作成**

```markdown
---
name: create-custom-section
description: カスタムセクションコンポーネントを CLI で生成する
---

# Create Custom Section

## Overview

カスタムセクションをコンポーネントレジストリに追加する。
GSAP / Three.js / PixiJS / 多層パララックスを自由に使用可能。

## Steps

1. ユーザーの要件を確認（デザイン、アニメーション、必要なフィールド）
2. `src/app/(public)/_shared/components/sections/custom/<name>/` を作成
3. `definition.ts` — Zod スキーマ + メタ + コンポーネント参照
4. `<ComponentName>.tsx` — セクション本体（GSAP / Three.js / PixiJS 自由）
5. `index.ts` — barrel export
6. `src/app/(public)/_shared/lib/sections/register-standard-sections.ts` に `registerSection()` エントリ追加（注意: `src/shared/lib/sections/registry.ts` はレジストリ本体であり直接編集しない）
7. 動作確認（`bun dev` + 管理画面でセクション追加）

## Template

(Spec §生成テンプレート の内容)

## Checklist

- [ ] definition.ts の全フィールドに `.default()` + `.meta()` があること
- [ ] configSchema.parse({}) が throw しないこと
- [ ] registry.ts にエントリが追加されていること
- [ ] `bun run validate` が PASS すること
```

- [ ] **Step 2: コミット**

```bash
git add .claude/skills/create-custom-section/
git commit -m "feat: add create-custom-section CLI skill"
```

---

## Summary

| Chunk | Tasks | 内容                                                           |
| ----- | ----- | -------------------------------------------------------------- |
| 1     | 1-4   | DB Migration + 型基盤 + エフェクトスキーマ + schema-utils      |
| 2     | 5-6   | 17 標準セクション definition + レジストリ                      |
| 3     | 7-9   | ドメイン層 + バリデーション層 + Server Actions 移行            |
| 4     | 10-11 | SectionRenderer 書き換え + ExperienceShell 移動 + エフェクト層 |
| 5     | 12-14 | SchemaForm + 管理画面 UI 移行 + エフェクトエディタ             |
| 6     | 15-18 | 旧ファイル削除 + テスト更新 + 全体検証 + CLI スキル            |

**依存関係:**

- Chunk 1 → Chunk 2 → Chunk 3 → Chunk 4（直列）
- Chunk 5 は Chunk 3 完了後に開始可能（Chunk 4 と並列可能だが、動作確認は Chunk 4 完了後）
- Chunk 6 は全 Chunk 完了後
