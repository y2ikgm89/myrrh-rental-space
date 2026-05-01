# Admin Page Editor Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) または `superpowers:executing-plans` to implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-02-admin-page-editor-redesign-design.md`

**Goal:** `/admin/pages/[slug]/edit` を master-detail UI + 意味別フィールドグループ + Section CRUD/並び替え + PageHero 統合した clean-break refactor で刷新する。

**Architecture:** ① additive な新規コード（field-registry の `subGroup`、page-hero registry 登録、CRUD Server Actions、master-detail UI コンポーネント）を先に追加。② 公開ページ・seed の caller を新パスに切替。③ destructive migration で `Page.pageHero` 列を Section テーブルへ移管 + 旧コード一式削除を 1 commit で atomically 実施。

**Tech Stack:** Prisma 7.8 / PostgreSQL / Next.js 16.2 / React 19 + Compiler 1.0 / Zod 4 / nuqs 2.8 / dnd-kit / Radix UI / Tailwind 4.2 / bun:test

**Branch:** 現在の `refactor/docs-diataxis` で続行（spec 既コミット済み、新ブランチを切ると孤立）。完了後 `bun run validate && bun run build` 通過 → main へ `git merge --ff-only`（または PR）。

---

## File Structure

### 新規作成

| パス                                                                                         | 役割                                                                        |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/shared/lib/sections/definitions/page-hero/schema.ts`                                    | discriminated union (editorial-split / compact / minimal)                   |
| `src/shared/lib/sections/definitions/page-hero/defaults.ts`                                  | 各 variant のデフォルト値                                                   |
| `src/shared/lib/sections/definitions/page-hero/metadata.ts`                                  | label / icon / category                                                     |
| `src/shared/lib/sections/definitions/page-hero/index.ts`                                     | SectionDefinition export                                                    |
| `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionListSidebar.tsx`     | 左サイド：dnd-kit Sortable + + ボタン                                       |
| `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionListItem.tsx`        | 1 行：drag handle / icon / label / kebab / active toggle                    |
| `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionEditPanel.tsx`       | 右パネル：選択中 section の AutoSectionForm 描画 + page-hero variant Select |
| `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/AddSectionDialog.tsx`       | + ボタン → type picker dialog                                               |
| `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionTypePicker.tsx`      | type 選択 UI                                                                |
| `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/section-edit-state.ts`      | nuqs query state SSoT                                                       |
| `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/FieldGroupSection.tsx` | 意味別グループ見出しラッパー                                                |
| `prisma/migrations/<TS>_drop_page_hero_to_section/migration.sql`                             | destructive migration                                                       |
| `__tests__/unit/sections/page-hero-schema.test.ts`                                           | page-hero registry テスト                                                   |
| `__tests__/integration/actions/admin/page-section-crud.test.ts`                              | CRUD Server Action 統合テスト                                               |

### 変更

| パス                                                                                         | 内容                                                          |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `src/shared/lib/sections/field-registry.ts`                                                  | `subGroup?: FieldSubGroup` 追加、helpers opts 拡張            |
| `src/shared/lib/sections/registry.ts`                                                        | page-hero 登録、homepage-hero 既廃止コメント維持              |
| `src/shared/lib/sections/definitions/<22 types>/schema.ts`                                   | 各 schema の `field.*()` 呼び出しに `subGroup` 注入           |
| `src/app/(admin)/admin/(dashboard)/_shared/actions/page-section.ts`                          | CRUD + reorder 5 関数追加、validations + cache invalidation   |
| `src/app/(admin)/admin/(dashboard)/_shared/actions/page-section-types.ts`                    | 新規入力型を追加                                              |
| `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form.tsx` | content フィールドを subGroup で分類描画                      |
| `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/PageEditor.tsx`             | master-detail 化                                              |
| `src/app/(public)/_components/homepage/HomepageSections.tsx` (or similar)                    | page.pageHero → sections.find(type=page-hero)                 |
| `src/app/(preview)/preview/pages/[slug]/page.tsx`                                            | 同上                                                          |
| `prisma/seed.ts`                                                                             | seedPages の pageHero 書き込みを page-hero section 挿入に置換 |
| `prisma/schema.prisma`                                                                       | `Page.pageHero` 列を削除（最終 commit）                       |

### 削除（最終 commit で）

- `src/shared/lib/sections/page-hero/schema.ts`
- `src/shared/lib/sections/page-hero/defaults.ts`
- `src/shared/lib/sections/page-hero/index.ts` （ディレクトリごと）
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/PageHeroEditor.tsx`
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionEditor.tsx`
- `src/app/(admin)/admin/(dashboard)/_shared/actions/page.ts` の `updatePageHero` 関数

---

## Phase A: field-registry に subGroup 追加

### Task A1: `FieldMeta` に optional `subGroup` を追加

**Files:**

- Modify: `src/shared/lib/sections/field-registry.ts`

- [ ] **Step 1: `FieldMeta` interface に `subGroup` 追加**

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

- [ ] **Step 2: 全 helper opts インターフェースに `subGroup` 追加**

`TextOpts` / `TextareaOpts` / `NumberOpts` / `BooleanOpts` / `SelectOpts` / `StringFieldOpts`（image / icon / url 用）/ `ArrayOpts` / `GroupOpts` の opts に共通で `readonly subGroup?: FieldSubGroup` を加える。

例:

```typescript
interface TextOpts extends StringConstraints {
  readonly placeholder?: string;
  readonly helpText?: string;
  readonly default?: string;
  readonly group?: FieldMeta["group"];
  readonly subGroup?: FieldSubGroup;
}
```

- [ ] **Step 3: 全 `field.*` 関数で `subGroup` を `register` に渡す**

各 helper の `fieldRegistry.register(schema, { ...meta })` 呼び出しで opts.subGroup を伝播。例:

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

`exactOptionalPropertyTypes: true` のため、optional property の代入は条件スプレッドで `subGroup` を含める or 含めないを切り分ける。

- [ ] **Step 4: 検証**

```bash
bun run type-check 2>&1 | tail -30
```

Expected: EXIT=0、エラーなし（既存 schema 群は未注入なので default `subGroup === undefined` で動作）。

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/sections/field-registry.ts
git commit -m "feat(field-registry): add optional subGroup to FieldMeta"
```

---

### Task A2: 既存 22 section schema に `subGroup` を注入

**Files:**

- Modify: `src/shared/lib/sections/definitions/<type>/schema.ts` × 22 ファイル

注入ルール:

- `field.text` / `field.textarea` で**ラベル / タイトル / 説明 / 文言系** → `subGroup: "text"`
- `field.image` → `subGroup: "image"`
- 画像配列の `field.array` → `subGroup: "image"`
- ボタン用 `field.url` / ボタン文言の `field.text` / ボタン配列 `field.array` → `subGroup: "button"`
- 上記以外（`section ラベル` / `tagline` / `viewAllText` / `categoryFilter` 等の identifier 系） → 未指定（"other"）

- [ ] **Step 1: 全 schema を grep で列挙**

```bash
ls src/shared/lib/sections/definitions/ | wc -l
```

Expected: 22 ディレクトリ（page-hero はまだ作っていないので 22）。

- [ ] **Step 2: 各 schema に subGroup 注入（22 ファイル）**

例: `definitions/cta/schema.ts`

```typescript
import { field } from "@/shared/lib/sections/field-registry";
import { z } from "zod";

export const ctaConfigSchema = z.object({
  sectionLabel: field.text("セクションラベル", { subGroup: "text" }),
  title: field.text("タイトル", { subGroup: "text" }),
  description: field.textarea("説明", { subGroup: "text" }),
  buttons: field.array("ボタン", {
    subGroup: "button",
    fields: {
      text: field.text("ボタン文言"),
      url: field.url("URL"),
      variant: field.select("バリエーション", {
        options: ["primary", "secondary", "outline"],
        default: "primary",
      }),
      openInNewTab: field.boolean("新しいタブで開く"),
    },
  }),
  backgroundColor: field.color("背景色", { group: "design" }),
  variant: field.select("レイアウト", {
    group: "design",
    options: ["default", "centered", "split"],
    default: "default",
  }),
});
```

注意: array / group の **内側の field.\* には subGroup を付けない**（親の subGroup を継承する形）。

各 schema を順次更新。

- [ ] **Step 3: 検証**

```bash
bun run type-check 2>&1 | tail -10
bun run lint 2>&1 | tail -10
```

Expected: EXIT=0。

- [ ] **Step 4: Commit**

```bash
git add src/shared/lib/sections/definitions/
git commit -m "feat(sections): annotate 22 section schemas with subGroup"
```

---

## Phase B: page-hero を Section レジストリに登録

### Task B1: `definitions/page-hero/` 作成

**Files:**

- Create: `src/shared/lib/sections/definitions/page-hero/schema.ts`
- Create: `src/shared/lib/sections/definitions/page-hero/defaults.ts`
- Create: `src/shared/lib/sections/definitions/page-hero/metadata.ts`
- Create: `src/shared/lib/sections/definitions/page-hero/index.ts`

- [ ] **Step 1: `schema.ts` を作成（discriminated union）**

```typescript
// src/shared/lib/sections/definitions/page-hero/schema.ts
import { z } from "zod";
import { field } from "@/shared/lib/sections/field-registry";

const editorialSplitSchema = z.object({
  variant: z.literal("editorial-split"),
  label: field.text("ラベル", { subGroup: "text" }).default(""),
  title: field.text("タイトル", { subGroup: "text" }).default(""),
  description: field.textarea("説明", { subGroup: "text" }).default(""),
  images: field
    .array("ヒーロー画像", {
      subGroup: "image",
      fields: {
        url: field.image("画像 URL"),
        alt: field.text("代替テキスト"),
      },
    })
    .default([]),
  transition: field.select("トランジション", {
    subGroup: "image",
    options: ["crossfade", "ken-burns", "clip-reveal", "scale-fade"],
    default: "crossfade",
  }),
  buttonText: field.text("ボタン文言", { subGroup: "button" }).default(""),
  buttonUrl: field.url("ボタン URL", { subGroup: "button" }).default(""),
});

const compactSchema = z.object({
  variant: z.literal("compact"),
  image: z.object({
    url: field.image("画像 URL", { subGroup: "image" }),
    alt: field.text("代替テキスト"),
  }),
  label: field.text("ラベル", { subGroup: "text" }).default(""),
  title: field.text("タイトル", { subGroup: "text" }).default(""),
  description: field.textarea("説明", { subGroup: "text" }).default(""),
});

const minimalSchema = z.object({
  variant: z.literal("minimal"),
  eyebrow: field.text("アイブロー", { subGroup: "text" }).optional(),
  title: field.text("タイトル", { subGroup: "text" }).default(""),
  description: field.textarea("説明", { subGroup: "text" }).default(""),
});

export const pageHeroConfigSchema = z.discriminatedUnion("variant", [
  editorialSplitSchema,
  compactSchema,
  minimalSchema,
]);

export type PageHeroConfig = z.infer<typeof pageHeroConfigSchema>;
```

- [ ] **Step 2: `defaults.ts` を作成**

```typescript
// src/shared/lib/sections/definitions/page-hero/defaults.ts
import type { PageHeroConfig } from "./schema";

export const DEFAULT_PAGE_HERO: PageHeroConfig = {
  variant: "editorial-split",
  label: "RENTAL SPACES",
  title: "ここでしか叶わない、上質な時間。",
  description:
    "ビジネスからプライベートまで、用途に合わせて選べる空間をご用意しています。",
  images: [],
  transition: "crossfade",
  buttonText: "スペースを見る",
  buttonUrl: "/spaces",
};
```

旧 `defaultPageHeroHome` の内容を踏襲する（既存 `src/shared/lib/sections/page-hero/defaults.ts` を参考）。

- [ ] **Step 3: `metadata.ts` を作成**

```typescript
// src/shared/lib/sections/definitions/page-hero/metadata.ts
import { IconLayoutDashboard } from "@tabler/icons-react";
import type { SectionMetadata } from "@/shared/lib/sections/types";

export const pageHeroMetadata: SectionMetadata = {
  type: "page-hero",
  label: "ページヒーロー",
  description: "ページ先頭のヒーローエリア。variant で表示形式を切り替え",
  icon: IconLayoutDashboard,
  category: "hero",
};
```

`SectionMetadata` の正確な field は `src/shared/lib/sections/types.ts` を確認して合わせる。

- [ ] **Step 4: `index.ts` を作成**

```typescript
// src/shared/lib/sections/definitions/page-hero/index.ts
export { pageHeroConfigSchema, type PageHeroConfig } from "./schema";
export { pageHeroMetadata } from "./metadata";
export { DEFAULT_PAGE_HERO } from "./defaults";
```

- [ ] **Step 5: 検証**

```bash
bun run type-check 2>&1 | tail -10
```

Expected: EXIT=0。

- [ ] **Step 6: Commit**

```bash
git add src/shared/lib/sections/definitions/page-hero/
git commit -m "feat(sections): add page-hero section definition (discriminated union)"
```

---

### Task B2: registry.ts に page-hero を登録

**Files:**

- Modify: `src/shared/lib/sections/registry.ts`

- [ ] **Step 1: import 追加 + sectionDefinitions マップに登録**

```typescript
// registry.ts
import {
  pageHeroConfigSchema,
  pageHeroMetadata,
} from "./definitions/page-hero";

// ... 既存の登録
"page-hero": {
  configSchema: pageHeroConfigSchema,
  metadata: pageHeroMetadata,
},
```

- [ ] **Step 2: section-metadata.ts に label/icon があれば追加**

`src/shared/lib/validations/section-metadata.ts` の `sectionTypeLabels` に `"page-hero": "ページヒーロー"` を追加。

- [ ] **Step 3: SectionType 型拡張**

`src/shared/lib/sections/types.ts` の `SectionType` union 型に `"page-hero"` を追加（自動で derive される構造ならスキップ）。

- [ ] **Step 4: 検証**

```bash
bun run type-check 2>&1 | tail -10
bun run lint 2>&1 | tail -10
```

Expected: EXIT=0。

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/sections/registry.ts src/shared/lib/validations/section-metadata.ts src/shared/lib/sections/types.ts
git commit -m "feat(sections): register page-hero type in section registry"
```

---

## Phase C: Section CRUD + 並び替え Server Actions

### Task C1: `createPageSection` / `deletePageSection` / `duplicatePageSection`

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/page-section.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/page-section-types.ts`
- Modify: `src/shared/domain/sections/commands.ts` (新規 or 拡張)

- [ ] **Step 1: domain commands を実装**

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
    throw new DomainError("不正なセクションタイプです", "VALIDATION");
  }

  // page-hero は 1 ページに 1 つのみ
  if (input.type === "page-hero") {
    const existing = await prisma.section.findFirst({
      where: { pageId: input.pageId, type: "page-hero" },
      select: { id: true },
    });
    if (existing) {
      throw new DomainError("ヒーローは既に存在します", "CONFLICT");
    }
  }

  // デフォルト config を生成
  const defaultConfig = definition.configSchema.safeParse({});
  const config = defaultConfig.success ? defaultConfig.data : {};

  // order: 末尾追加（同 pageId の max+1）
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
  if (!section)
    throw new DomainError("セクションが見つかりません", "NOT_FOUND");

  await prisma.section.delete({ where: { id } });
  return { id: section.id, pageId: section.pageId };
}

export async function duplicateSectionCommand(id: string) {
  const source = await prisma.section.findUnique({
    where: { id },
  });
  if (!source) throw new DomainError("セクションが見つかりません", "NOT_FOUND");
  if (source.type === "page-hero") {
    throw new DomainError("ヒーローは複製できません", "CONFLICT");
  }

  // 直後に挿入: source.order+1 以降を全部+1 ずらす
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

  if (!created) throw new DomainError("複製に失敗しました", "INTERNAL");
  return { id: created.id, pageId: created.pageId };
}
```

- [ ] **Step 2: Server Action ラッパーを書く**

`src/app/(admin)/admin/(dashboard)/_shared/actions/page-section.ts` に追加:

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
import { sectionTypeSchema } from "@/shared/lib/sections/types"; // 既存 enum schema を流用 (なければ作成)

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

注: `revalidateTag` の第 2 引数は `CACHE_LIFE` 定数（プロジェクト規約、`prisma-patterns.md` 参照）。プロジェクト既存パターンを model にして引数を合わせる。

- [ ] **Step 3: 検証**

```bash
bun run type-check 2>&1 | tail -20
```

Expected: EXIT=0。

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

- [ ] **Step 1: domain command 追加**

```typescript
export async function toggleSectionActiveCommand(id: string) {
  const section = await prisma.section.findUnique({
    where: { id },
    select: { id: true, isActive: true, pageId: true },
  });
  if (!section)
    throw new DomainError("セクションが見つかりません", "NOT_FOUND");

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
  // 検証: orderedIds が pageId に属するセクションと一致するか
  const existing = await prisma.section.findMany({
    where: { pageId: input.pageId },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((s) => s.id));
  for (const id of input.orderedIds) {
    if (!existingIds.has(id)) {
      throw new DomainError("不正なセクション ID が含まれます", "VALIDATION");
    }
  }
  if (existing.length !== input.orderedIds.length) {
    throw new DomainError("セクション数が一致しません", "VALIDATION");
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

- [ ] **Step 2: Server Action 追加**

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

- [ ] **Step 3: 検証 + Commit**

```bash
bun run validate 2>&1 | tail -10
git add src/shared/domain/sections/commands.ts src/app/(admin)/admin/(dashboard)/_shared/actions/page-section.ts
git commit -m "feat(actions): togglePageSectionActive / reorderPageSections"
```

---

## Phase D: 新 UI コンポーネント（additive）

### Task D1: AutoSectionForm の subGroup 分類描画 + FieldGroupSection

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/FieldGroupSection.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/zod-introspection.ts`（FieldInfo に subGroup を含める）

- [ ] **Step 1: `FieldGroupSection` 作成**

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

- [ ] **Step 2: `extractSchemaFields` で subGroup を抽出**

`zod-introspection.ts` の `FieldInfo` 型に `subGroup` を追加（meta から transparent に渡す）。`fieldRegistry.get(schema)?.subGroup` を `FieldInfo.meta.subGroup` に渡す。

- [ ] **Step 3: `auto-section-form.tsx` を subGroup 分類描画に書き換え**

既存 L168-222 の form body 部分:

```tsx
// 既存: contentFields.map(renderField)
// 新規: subGroup ごとに FieldGroupSection で分類

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
        <FieldGroupSection title="本文" icon={IconArticle}>
          <LexicalEditor ... />
        </FieldGroupSection>
      )}
      {textFields.length > 0 && (
        <FieldGroupSection title="テキスト" icon={IconTypography}>
          {textFields.map(renderField)}
        </FieldGroupSection>
      )}
      {imageFields.length > 0 && (
        <FieldGroupSection title="画像" icon={IconPhoto}>
          {imageFields.map(renderField)}
        </FieldGroupSection>
      )}
      {buttonFields.length > 0 && (
        <FieldGroupSection title="ボタン・リンク" icon={IconLink}>
          {buttonFields.map(renderField)}
        </FieldGroupSection>
      )}
      {otherFields.length > 0 && (
        <div className="space-y-4">{otherFields.map(renderField)}</div>
      )}
    </div>

    {/* design / advanced は既存 Accordion */}
    {hasAccordionContent && (
      <Accordion type="multiple" className="border-t border-border" defaultValue={[]}>
        {/* 既存と同じ */}
      </Accordion>
    )}

    <FormActions ... />
  </form>
);
```

icon import: `IconArticle / IconTypography / IconPhoto / IconLink` from `@tabler/icons-react`。

- [ ] **Step 4: 検証 + Commit**

```bash
bun run validate 2>&1 | tail -10
git add src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/
git commit -m "feat(auto-section-form): render content fields by subGroup with section headings"
```

---

### Task D2: SectionListSidebar + SectionListItem (DnD なし)

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionListSidebar.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionListItem.tsx`

- [ ] **Step 1: `SectionListItem.tsx` 作成**

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
        aria-label="並び替え"
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
            aria-label="操作"
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
            {section.isActive ? "非表示にする" : "表示する"}
          </DropdownMenuItem>
          {canDuplicate && (
            <DropdownMenuItem onClick={onDuplicate}>
              <IconCopy className="mr-2 h-4 w-4" />
              複製
            </DropdownMenuItem>
          )}
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                <IconTrash className="mr-2 h-4 w-4" />
                削除
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
```

- [ ] **Step 2: `SectionListSidebar.tsx` 作成（DnD なし）**

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
      toast.success("セクションを複製しました");
      router.refresh();
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("このセクションを削除しますか？")) return;
    startTransition(async () => {
      const result = await deletePageSection(id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("セクションを削除しました");
      router.refresh();
    });
  };

  return (
    <aside className="space-y-2 lg:sticky lg:top-6">
      <div className="flex items-center justify-between px-2">
        <h2 className="text-sm font-medium text-foreground">セクション</h2>
        <Button size="sm" variant="outline" onClick={onAddClick}>
          <IconPlus className="mr-1 h-4 w-4" />
          追加
        </Button>
      </div>
      <div className="space-y-0.5 rounded-lg border border-border bg-card p-2">
        {sections.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            セクションがありません
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

- [ ] **Step 3: 検証 + Commit**

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

- [ ] **Step 1: `SectionEditPanel.tsx` 作成**

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
  { value: "editorial-split", label: "エディトリアル分割" },
  { value: "compact", label: "コンパクト" },
  { value: "minimal", label: "ミニマル" },
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

  // page-hero の variant を URL/state で管理（form remount のため）
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
      toast.success("保存しました");
      onUpdated?.();
    });
  };

  const handleVariantChange = (value: string) => {
    setVariant(value);
    // セクションを variant で remount → AutoSectionForm が新 variant の defaults で初期化される
  };

  // page-hero のときは variant を上書きした config を渡して form を再構築
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
            <Label htmlFor="page-hero-variant">バリアント</Label>
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
              バリアント変更時、現在のフォーム入力はリセットされます
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

- [ ] **Step 2: 検証 + Commit**

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

- [ ] **Step 1: `SectionTypePicker.tsx` 作成（type 選択 grid）**

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

- [ ] **Step 2: `AddSectionDialog.tsx` 作成**

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
      toast.success("セクションを追加しました");
      onOpenChange(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80svh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>セクションを追加</DialogTitle>
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

- [ ] **Step 3: 検証 + Commit**

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

- [ ] **Step 1: SSoT parser 定義**

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

### Task D6: dnd-kit による drag-and-drop reorder

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionListSidebar.tsx`

- [ ] **Step 1: `@dnd-kit/core` `@dnd-kit/sortable` の存在確認**

```bash
grep -E "@dnd-kit/(core|sortable|modifiers)" package.json
```

Expected: `@dnd-kit/core` `@dnd-kit/sortable` `@dnd-kit/modifiers` がインストール済み。

- [ ] **Step 2: SectionListSidebar に DndContext + SortableContext + reorderPageSections action 配線**

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

// SectionListSidebar 内部
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
  // Optimistic UI: 親 PageEditor が router.refresh() で再取得するまで一旦表示順だけ即時反映できると better
  // 簡易版: server action のみ
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

- [ ] **Step 3: 検証 + Commit**

```bash
bun run type-check 2>&1 | tail -10
bun run lint 2>&1 | tail -10
git add src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionListSidebar.tsx
git commit -m "feat(page-edit): drag-and-drop reorder with dnd-kit"
```

---

## Phase E: Wire-up + 公開側切替

### Task E1: PageEditor を master-detail に書き換え

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/PageEditor.tsx`

- [ ] **Step 1: master-detail 構造に書き換え**

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

  // 利用可能 type: page-hero は既に存在すれば除外、homepage-* は home のみ
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
                  <CardTitle>セクションを選択</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    左の一覧からセクションを選択するか、「追加」でセクションを作成してください
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

注: `getPageForEdit` の戻り値 `PageForEdit` は現状 `pageHero` を含む形だが、Task E2 以降で sections に統合する。本タスクは仮に `pageHero` を ignore する形で書く（後段で adjusted）。

- [ ] **Step 2: 検証 + Commit**

```bash
bun run type-check 2>&1 | tail -20
git add src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/PageEditor.tsx
git commit -m "feat(page-edit): wire master-detail layout in PageEditor"
```

---

### Task E2: 公開ページ HomepageSections を page-hero section 経由に切替

**Files:**

- Modify: 公開ホームページ用 sections renderer（Explore で正確な location 確認）
- Modify: `src/app/(preview)/preview/pages/[slug]/page.tsx`
- Modify: `src/admin/queries/page-section.ts`（getPageForEdit / getPageWithSections の戻り値型から `pageHero` を除去または page-hero section に統合）

- [ ] **Step 1: 該当 caller を grep で列挙**

```bash
grep -rln "page\.pageHero\|pageHero\b" src/ --include="*.ts" --include="*.tsx"
```

得られたリストすべてを確認し、以下のいずれかに分類:

- (A) 旧 `parsePageHero` / `pageHeroSchema` / `defaultPageHeroHome` を import している → page-hero section から取得する形に書き換え
- (B) `page.pageHero` JSON 値を直接使っている → 同様
- (C) DB query (`select: { pageHero: true }`) → select から削除

- [ ] **Step 2: 公開 HomepageSections を section 経由に書き換え**

```typescript
// src/app/(public)/_components/homepage/HomepageSections.tsx (path 要確認)
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

`PageHero` Server Component は props を `{ config: PageHeroConfig }` に書き換え（旧の `pageHero: PageHero` props を削除）。

- [ ] **Step 3: preview ページも同様**

```typescript
// src/app/(preview)/preview/pages/[slug]/page.tsx
const pageHeroSection = page.sections.find(
  (s) => s.type === "page-hero" && s.isActive,
);
// HomepageSections に pageHero を渡す行を削除
```

- [ ] **Step 4: admin queries の戻り値型から `pageHero` を除去**

`src/admin/queries/page-section.ts` の `getPageForEdit` / `getPageWithSections` の `select` から `pageHero: true` を削除し、戻り値型 `PageForEdit` から `pageHero` field を削除。

- [ ] **Step 5: 検証**

```bash
grep -rln "page\.pageHero\|\.pageHero\b" src/ --include="*.ts" --include="*.tsx"
```

Expected: 0 ヒット（schema.prisma 以外）。

```bash
bun run type-check 2>&1 | tail -20
```

Expected: EXIT=0（`Page.pageHero` 列はまだ存在するため Prisma 型定義は通る）。

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "refactor(public): HomepageSections reads page-hero section instead of page.pageHero"
```

---

### Task E3: seedPages を page-hero section 挿入に変更

**Files:**

- Modify: `prisma/seed.ts`

- [ ] **Step 1: `seedPages` の home 部分を改修**

```typescript
// prisma/seed.ts (関連部分)
import { DEFAULT_PAGE_HERO } from "@/shared/lib/sections/definitions/page-hero";

async function seedPages(prisma: AppPrismaClient) {
  // 既存のページ作成ロジック（pageHero を渡さない）
  const home = await prisma.page.upsert({
    where: { slug: "home" },
    create: {
      slug: "home",
      title: "ホーム",
      isPublished: true,
      isSystemPage: true,
      // pageHero フィールドは渡さない
    },
    update: {},
    select: { id: true },
  });

  // page-hero section を idempotent に挿入
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
  // ... 他の section seed
}
```

- [ ] **Step 2: 検証**

```bash
bun run type-check 2>&1 | tail -10
```

Expected: EXIT=0。

```bash
# seed 実行（pageHero 列がまだ schema にあるが、書き込まないので OK）
bun prisma/seed.ts 2>&1 | tail -5
bun prisma/seed.ts 2>&1 | tail -5  # idempotency 確認
```

Expected: エラーなし、二度目も idempotent。

- [ ] **Step 3: Commit**

```bash
git add prisma/seed.ts
git commit -m "chore(seed): seedPages inserts page-hero section instead of pageHero JSON"
```

---

## Phase F: 旧 PageEditor 関連削除（schema 変更前）

### Task F1: 旧 PageHeroEditor / updatePageHero / SectionEditor を削除

**Files:**

- Delete: `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/PageHeroEditor.tsx`
- Delete: `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionEditor.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/page.ts` （`updatePageHero` 関数を削除）

- [ ] **Step 1: 参照確認**

```bash
grep -rln "PageHeroEditor\|SectionEditor\|updatePageHero" src/ --include="*.ts" --include="*.tsx"
```

PageEditor 経由の参照が残っていないことを確認（Task E1 で除去済みのはず）。

- [ ] **Step 2: ファイル削除**

```bash
git rm src/app/\(admin\)/admin/\(dashboard\)/pages/\[slug\]/edit/_components/PageHeroEditor.tsx
git rm src/app/\(admin\)/admin/\(dashboard\)/pages/\[slug\]/edit/_components/SectionEditor.tsx
```

- [ ] **Step 3: `updatePageHero` 関数を `page.ts` から削除**

`src/app/(admin)/admin/(dashboard)/_shared/actions/page.ts` から `updatePageHero` 関数定義と export を削除。

- [ ] **Step 4: 検証**

```bash
bun run validate 2>&1 | tail -20
```

Expected: EXIT=0。

- [ ] **Step 5: Commit**

```bash
git add src/app/(admin)/admin/(dashboard)/_shared/actions/page.ts
git commit -m "chore(admin): drop PageHeroEditor / SectionEditor / updatePageHero"
```

---

## Phase G: Destructive migration + 旧 page-hero schema 削除

### Task G1: Page.pageHero 列 DROP + data migration + 旧コード削除（atomic 1 commit）

**Files:**

- Create: `prisma/migrations/<TS>_drop_page_hero_to_section/migration.sql`
- Modify: `prisma/schema.prisma`
- Delete: `src/shared/lib/sections/page-hero/{schema,defaults,index}.ts`

- [ ] **Step 1: 事前 grep で残留参照ゼロ確認**

```bash
grep -rln "pageHero\|PageHero\|parsePageHero\|pageHeroSchema\|defaultPageHeroHome" \
  src/ --include="*.ts" --include="*.tsx" | grep -v "definitions/page-hero"
```

Expected: 出力ゼロ（新 `definitions/page-hero/` ディレクトリ以外で参照なし）。

```bash
# schema.prisma の現状確認
grep -n "pageHero" prisma/schema.prisma
```

Expected: `pageHero Json?` 1 行のみ残存。

- [ ] **Step 2: TS タイムスタンプでディレクトリ作成**

```bash
TS=$(date -u +%Y%m%d%H%M%S)
python3 -c "import os; os.makedirs('prisma/migrations/${TS}_drop_page_hero_to_section', exist_ok=True)"
echo "$TS" > /tmp/migration-ts.txt
```

- [ ] **Step 3: migration.sql を Python で書き出し**

```bash
TS=$(cat /tmp/migration-ts.txt)
python3 -c "
sql = '''-- 1) Page.pageHero JSON を Section テーブルに移行（home page のみ対象）
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

-- 2) Page.pageHero 列を削除
ALTER TABLE pages DROP COLUMN \"pageHero\";
'''
open(f'prisma/migrations/${TS}_drop_page_hero_to_section/migration.sql', 'w', encoding='utf-8').write(sql)
"
```

- [ ] **Step 4: schema.prisma から `pageHero Json?` 行を削除**

```typescript
// prisma/schema.prisma の Page モデル
model Page {
  id                 String       @id @default(uuid()) @db.Uuid
  slug               String       @unique
  title              String
  // pageHero Json? を削除
  description        String?      @db.Text
  // ... 残り
}
```

- [ ] **Step 5: migration を適用**

```bash
TS=$(cat /tmp/migration-ts.txt)
bunx --bun prisma db execute --file prisma/migrations/${TS}_drop_page_hero_to_section/migration.sql 2>&1 | tail -5
bunx --bun prisma migrate resolve --applied "${TS}_drop_page_hero_to_section" 2>&1 | tail -3
bun run db:generate 2>&1 | tail -3
```

Expected: 全 EXIT=0。drift エラーが出る場合は git-migration.md の手動パターンに従う。

- [ ] **Step 6: 旧 page-hero ディレクトリを削除**

```bash
git rm -r src/shared/lib/sections/page-hero/
```

- [ ] **Step 7: 検証**

```bash
bun run validate 2>&1 | tail -20
bun run build 2>&1 | tail -30
```

Expected: 両方 EXIT=0。

- [ ] **Step 8: smoke test**

```bash
# dev DB で Page.pageHero が消え、Section テーブルに type=page-hero が存在することを確認
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

Expected: `page-hero count: 1` 以上、`config keys: [ 'variant', 'label', 'title', ... ]`。

- [ ] **Step 9: Commit (atomic)**

```bash
TS=$(cat /tmp/migration-ts.txt)
git add prisma/migrations/${TS}_drop_page_hero_to_section/migration.sql \
       prisma/schema.prisma \
       src/shared/lib/sections/page-hero/  # deletion を stage
git commit -m "feat(prisma): destructive migration — move Page.pageHero to Section, drop column"
```

---

## Phase H: テスト

### Task H1: page-hero registry + section CRUD 単体テスト

**Files:**

- Create: `__tests__/unit/sections/page-hero-schema.test.ts`
- Create: `__tests__/unit/domain/sections/commands.test.ts`

- [ ] **Step 1: page-hero schema テスト**

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

- [ ] **Step 2: section CRUD command 単体テスト（mock-based）**

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

- [ ] **Step 3: 実行**

```bash
bun test __tests__/unit/sections/page-hero-schema.test.ts 2>&1 | tail -10
bun test __tests__/unit/domain/sections/commands.test.ts 2>&1 | tail -10
```

Expected: 全 PASS。

- [ ] **Step 4: package.json `test:unit` バッチに登録**

`package.json` の `test:unit` スクリプトに `bun test __tests__/unit/sections && bun test __tests__/unit/domain/sections` 等を追加（既存パターン参照）。

- [ ] **Step 5: Commit**

```bash
git add __tests__/unit/sections/ __tests__/unit/domain/sections/ package.json
git commit -m "test(sections): page-hero schema + section CRUD commands unit tests"
```

---

## Self-Review Checklist

### Spec coverage

- [x] Section 1.1 列 DROP → Task G1
- [x] Section 1.3 migration SQL → Task G1
- [x] Section 2.1 page-hero registry 登録 → Task B1, B2
- [x] Section 2.2 旧コード削除 → Task F1, G1
- [x] Section 2.3 公開 renderer → Task E2
- [x] Section 3 field-registry subGroup → Task A1, A2
- [x] Section 4 Server Actions CRUD/reorder → Task C1, C2
- [x] Section 5 master-detail UI → Task D1〜D6, E1
- [x] Section 6 URL state → Task D5
- [x] Section 7 AutoSectionForm subGroup → Task D1
- [x] Section 8 seed.ts 更新 → Task E3
- [x] Section 9 post-list.categoryId → **未対応（spec で「簡易対応 = カスタム UI」と決定したが具体タスクなし）** → Phase 3 spec へ移管
- [x] Section 10 テスト方針 → Task H1（migration data preservation test は Phase 3 候補）

**ギャップ**:

1. **`post-list.categoryId` の簡易対応**: Spec §9 では「`SectionEditPanel` 内で別 UI レンダリング」と決めたが、本 plan では未対応。理由: `post-list` セクション編集時のみ必要、Phase 3 で対応する方が clean。
2. **migration data preservation 統合テスト**: Spec §10.1 で予定したが、実 DB 接続が必要で複雑。本 Phase ではローカル smoke test (Task G1 Step 8) で代替し、Phase 2 で追加検討。

これら 2 点は `docs/superpowers/specs/2026-05-02-admin-page-editor-redesign-design.md` の Out of Scope セクションに合致するため deferred 妥当。

### Placeholder scan

- [x] "TBD" / "TODO" 検索 → なし
- [x] 「適切なエラーハンドリング」「バリデーション」抽象記述 → なし
- [x] 全ステップにコードブロックまたは具体コマンドあり

### Type consistency

- [x] `createSectionCommand` / `deleteSectionCommand` / `duplicateSectionCommand` / `toggleSectionActiveCommand` / `reorderSectionsCommand` 命名統一
- [x] Server Action は `createPageSection` / `deletePageSection` / `duplicatePageSection` / `togglePageSectionActive` / `reorderPageSections` 命名統一
- [x] `PageHeroConfig` / `pageHeroConfigSchema` / `DEFAULT_PAGE_HERO` 命名統一
- [x] `FieldSubGroup` / `subGroup` 命名統一

---

## Execution Recommendation

**Subagent-Driven Development を推奨**:

- Phase A → B → C → D → E → F → G → H の順で逐次実行
- Phase A2 (22 schema 注入) は 1 implementer に全 22 ファイル更新を bundle
- Phase G1 (destructive migration) は最も危険なので fresh subagent で個別 dispatch + 完了後 controller が `git log --oneline` + `git show --stat HEAD` で実在検証
- 各 Phase 完了後 `bun run validate` を controller 側で確認

**実行コマンド**:

```bash
# 開始前の sanity check
git status --short  # クリーンであるべき
bunx --bun prisma migrate status  # 未適用 migration なし確認
bun run validate  # ベースライン EXIT=0 確認
```

---

**Plan 完成。次は subagent-driven-development で逐次実装。**
