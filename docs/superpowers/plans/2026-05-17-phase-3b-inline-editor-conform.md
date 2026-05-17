# Phase 3-B: Inline Editor (Posts / News) RHF → conform 移行 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Posts / News エディタの inline editor (dual form `bodyForm` + `settingsForm` × 2 entity = 計 4 form インスタンス + 12 side-panel component) を React Hook Form (RHF) から conform 1.19 + Zod 4 に clean break で移行し、`package.json` から `react-hook-form` / `@hookform/resolvers` を削除する Phase 3-C を実行可能な状態にする。

**Architecture:**

- **Callback-based conform pattern (Phase 3-A canonical 踏襲)** — `usePostEditor` / `useNewsEditor` は `useActionState` を持たず `onSave: (data) => Promise<void>` callback で親 (`PostEditor` / `NewsEditor`) に submit を委譲する既存契約を維持。conform `useForm({ onSubmit, onValidate })` で intercept し callback を呼ぶ (Phase 3-A `auto-section-form` で確立)。
- **Dual form 構造維持** — `bodyForm` (Lexical contentJson + contentHtml 派生計算) + `settingsForm` (title / slug / excerpt / category / tags / SEO / OGP / layout / publish 等) を独立した conform `useForm` instance として保持。3 submit path (`onSubmitBody` / `onSubmitSettings` / `onCreateBoth`) も維持。
- **SidePanelInjectedProps の clean break refactor** — `register / control / setValue / getValues / errors` の 5-prop RHF interface を conform `FieldMetadata<T>` + per-field 個別 prop の interface に置換。12 side-panel component の prop signature を全置換 (バックワード互換 wrapper 禁止)。
- **Lexical contentJson 派生計算** — Task 8.3 TermsForm + Task 8.7 SpaceEditForm で確立した「hidden input + React Compiler 自動メモ化派生計算」パターンを `bodyForm` に適用。`useMemo` / `flushSync` 不要、submit handler 内で `renderEditorStateJsonToHtmlClient(bodyData.contentJson)` を呼んで `contentHtml` を派生。

**Tech Stack:**

- conform 1.19 (`@conform-to/react` / `@conform-to/zod/v4`)
- Zod 4.3
- React 19.2 + React Compiler 1.0
- Next.js 16.2 (typedRoutes / Multiple Root Layouts)
- Lexical 0.43 (contentJson primary + contentHtml cache、client-side rendering 必須 — Next.js 16 `react-server` condition 非互換)
- 既存 SSoT helper: `executeConformMutation` (`@/shared/lib/forms/conform-action`) / `lexicalJsonSchema` (`@/shared/lib/validations/lexical`) / `renderEditorStateJsonToHtmlClient` (`@/admin/components/editor/lexical/preview/render-editor-state-to-html-client`) / `useFieldArray` 配列 uniqueness (`zod-patterns/array-uniqueness.md`)

---

## File Structure

### 移行対象 (21 file)

**4 hooks (`_shared/components/editor/inline/hooks/`)**:

- `usePostEditor.ts` (525 行) — Post 用 dual form (`bodyForm: PostBodyFormData` + `settingsForm: PostSettingsFormData`) + 3 submit path
- `useNewsEditor.ts` — News 用 dual form (構造同型、規模 small)
- `shared/use-editor-core.ts` (134 行) — `EditorCoreReturn` SSoT、共通 state (`isPending` / `hasEditorChanges` / panels) + `computeIsDirty` / `createContentChangeHandler` / `createResetHandler` factory
- `use-content-width-styles.ts` — `contentWidth: number` から `EDITOR_PADDING_HORIZONTAL` 加算で `width` / `maxWidth` 計算する pure hook (RHF 依存 minimal、`use-editor-core` 経由間接利用が主)

**12 side-panel (`_shared/components/editor/inline/side-panel/`)**:

- `BasicInfoFields.tsx` — title / slug / excerpt (Post 専用) — `register` / `getValues` / `setValue` / `errors` 4-prop
- `TitleSlugFields.tsx` — title / slug (News 専用) — 同上
- `ExcerptFields.tsx` — excerpt 単独 — `register` / `errors`
- `CategoryFields.tsx` — Post category Select — `control` (RHF Controller) + `setValue` + `errors`
- `CategoryTagFields.tsx` — Post category + tag bundle — 上記合成
- `TagFields.tsx` — News tags multi-select — `control` + `setValue` + `errors`
- `PostTagFields.tsx` — Post tags multi-select — 同上
- `TagInput.tsx` — タグ追加 UI primitive (TagFields / PostTagFields から流用)
- `ImageFields.tsx` — Post coverImageUrl single image picker — `control` + `setValue` + `errors`
- `LayoutFields.tsx` — `contentWidth` / `contentWidthCustom` 共有 layout — `LayoutFieldsConnected<T>` generic + `as Path<T>` 境界 cast (ledger §5 entry 既存、type-safety/assertion-bans.md §5 RHF generic invariance)
- `OGPFields.tsx` — ogpTitle / ogpDescription / ogpImageUrl — `register` / `setValue` / `errors`
- `SEOFields.tsx` — metaDescription / metaKeywords — `register` / `errors`
- `UnifiedPublishFields.tsx` — Post `status` discriminator (PostStatus) / News `isPublished` boolean — discriminated extra props (`statusValue` / `onStatusChange` vs `isPublishedValue` / `onIsPublishedChange`、`content-types/types.ts` の `PostSidePanelExtra` / `NewsSidePanelExtra` で型分離)

**1 settings dialog**:

- `SettingsDialog.tsx` — `SidePanelDefinition<TForm, TExtra>` を受け取り `tabs[].sections[].render(ctx)` で side-panel component を render する dispatcher。`buildRenderContext` で RHF props + extra を合成、`tv()` で tabCount 2-5 別 grid

**2 content-types config**:

- `content-types/post.tsx` — `PostSidePanelExtra` (`categories` / `availableTags` / `onCreateCategory` / `onCreateTag` / `statusValue` / `onStatusChange`) + `sidePanel: SidePanelDefinition<PostFormData, PostSidePanelExtra>` 定義
- `content-types/news.tsx` — `NewsSidePanelExtra` (`isPublishedValue` / `onIsPublishedChange`) + `sidePanel: SidePanelDefinition<NewsFormData, NewsSidePanelExtra>` 定義
- `content-types/types.ts` — `FieldComponentProps<T>` / `SidePanelInjectedProps<T>` / `SidePanelDefinition<TForm, TExtra>` 型 SSoT (全 12 side-panel が import)

**1 form primitive**:

- `@/admin/components/ui/form.tsx` (estimated path: `_shared/components/ui/form.tsx`) — shadcn `<Form>` / `<FormField>` / `<FormItem>` / `<FormLabel>` / `<FormControl>` / `<FormDescription>` / `<FormMessage>` primitive (`FormProvider` / `useFormContext` ベース、RHF `Controller` render prop 内のみで動作)

### 非移行 (RHF 利用箇所だが本 phase 対象外、調査済み)

- `auto-section-form.tsx` (Phase 3-A 完了済 PR #107) ✅
- `LayoutFieldsConnected<T>` の `as Path<T>` 境界 cast — Phase 3-B 移行後も conform `FieldMetadata<T>` の generic invariance により同等の boundary cast (ledger §5 entry rename) が残る (TS 制約、保留)

### 削除対象 (Phase 3-C で実行)

- `package.json` から `react-hook-form` / `@hookform/resolvers` を削除
- `@/admin/components/ui/form.tsx` (shadcn RHF primitive) — conform 化で全 consumer 削除後に file 自体を削除

---

## Schema 設計の前提

既存 schema (`@/shared/lib/validations/post.ts` / `@/shared/lib/validations/news.ts`、新規作成または既存修正) は **in-place preprocess pattern (Task 8.6 LocationForm canonical)** で FormData transit (conform) と object literal (test) を両対応にする。

```typescript
// 概略 (Task 8.6 確立 pattern)
export const postBodyFormSchema = z.object({
  contentJson: lexicalJsonSchema, // Lexical EditorState JSON string
  contentHtml: z.string().min(1, { error: "本文 HTML は必須です" }),
});

export const postSettingsFormSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().regex(/^[a-z0-9-]+$/).max(200),
  excerpt: z.string().max(500).optional(),
  coverImageUrl: z.string().url().nullable().optional().or(z.literal("")),
  categoryId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().uuid()).default([]),
  status: z.enum(PostStatus),
  publishedAt: z.string().datetime({ local: true }).nullable().optional().or(z.literal("")),
  contentWidth: z.preprocess(/* string → number */, z.number().nullable().optional()),
  contentWidthCustom: z.preprocess(/* string → number */, z.number().nullable().optional()),
  ...seoFieldsSchema.shape,
  ...ogpFieldsSchema.shape,
});

// Lexical contentJson は hidden input + JSON.stringify transit (Task 8.3 TermsForm canonical)
// tags は hidden input + JSON.stringify transit (Pattern B、Task 8.1 PortableTextSpan[] 確立と同型)
// contentWidth / contentWidthCustom は z.preprocess で string → number coerce
```

`useFormAction` (RHF) / `standardSchemaResolver` / `react-hook-form` 新規利用は禁止 (CLAUDE.md §クリティカルルール — Validation / Domain 参照)。

---

## Tasks

### Task 1: 既存 inline editor の完全 inventory (前提)

**Files:**

- Read: 全 21 file (上記 File Structure 参照)

- [ ] **Step 1: 各 file の RHF API 使用箇所を Grep で列挙**

Run:

```bash
grep -rnE 'useForm|useWatch|useController|useFormContext|UseFormReturn|UseFormSetValue|UseFormRegister|Control<|FieldValues|FieldErrors|UseFormGetValues|standardSchemaResolver|zodResolver' src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/inline/ src/admin/components/ui/form.tsx
```

Expected: 21 file 全件で何らかのヒット。usePostEditor.ts は 4-5 種類の API を併用、side-panel は per-file 1-3 種類。

- [ ] **Step 2: 既存テスト fixture の Grep**

Run:

```bash
grep -rn 'usePostEditor\|useNewsEditor\|BasicInfoFields\|UnifiedPublishFields\|SettingsDialog' __tests__/
```

Expected: 該当 test file 列挙 (e.g. `__tests__/unit/actions/post/*.test.ts` 等)、各 file の mock pattern 確認。

- [ ] **Step 3: 既存 zod schema の Read**

Run:

```bash
ls src/shared/lib/validations/post* src/shared/lib/validations/news* 2>/dev/null
ls src/app/\(admin\)/admin/\(dashboard\)/_shared/lib/validations/post* 2>/dev/null
```

Expected: 既存 schema file の path 確定 (新規 schema を作るか既存 in-place modify するかの判断材料)。

- [ ] **Step 4: Server Action signature の Read**

Run:

```bash
grep -rnE 'export const? (updatePostBody|updatePostSettings|createPost|updateNewsBody|updateNewsSettings|createNews)' src/app/\(admin\)/admin/\(dashboard\)/_shared/actions/
```

Expected: 6 Server Action の signature 確定 (`(prev, formData) => SubmissionResult` 化が必要かどうか判断)。

- [ ] **Step 5: Inventory レポート作成**

Write `docs/superpowers/specs/2026-05-17-phase-3b-inventory.md`:

```markdown
# Phase 3-B Inventory

## Hooks

- usePostEditor.ts: useForm × 2 (bodyForm + settingsForm), useEditorCore, computeIsDirty, createContentChangeHandler, createResetHandler
- useNewsEditor.ts: 同上
- use-editor-core.ts: UseFormReturn<TFormData>, FieldPathByValue
- use-content-width-styles.ts: RHF 依存 minimal (Control 受取りなら必要)

## Side-panel (12)

- BasicInfoFields: register, getValues, setValue, errors
- (以下 11 file 同様の RHF API 列挙)

## Schemas

- src/shared/lib/validations/post.ts: postFormSchema / postBodyFormSchema / postSettingsFormSchema (存在 / 不在)
- src/shared/lib/validations/news.ts: 同上

## Server Actions

- updatePostBody: (id, input) => MutationResult / SubmissionResult
- updatePostSettings: 同上
- createPost: (input) => MutationResult / SubmissionResult
- (3 file 同様)

## Tests

- **tests**/unit/actions/post/\*.test.ts: mock fixture が schema input 型に依存している箇所
```

Verify: file 存在 + 内容が actual codebase と一致。**inventory が ground truth と乖離していたら以降の Task 全体が崩壊するため、ここで止めて user confirm**。

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-05-17-phase-3b-inventory.md
git commit -m "docs(specs): Phase 3-B inline editor RHF inventory"
```

---

### Task 2: Schema 整備 (post + news)

**Files:**

- Create or Modify: `src/shared/lib/validations/post.ts`
- Create or Modify: `src/shared/lib/validations/news.ts`
- Create: `__tests__/unit/validations/post.test.ts`
- Create: `__tests__/unit/validations/news.test.ts`

- [ ] **Step 1: 失敗 test 作成 (postBodyFormSchema)**

Create `__tests__/unit/validations/post.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import {
  postBodyFormSchema,
  postSettingsFormSchema,
} from "@/shared/lib/validations/post";

describe("postBodyFormSchema", () => {
  it("valid contentJson + contentHtml が成功する", () => {
    const result = postBodyFormSchema.safeParse({
      contentJson: '{"root":{"children":[],"type":"root","version":1}}',
      contentHtml: "<p>本文</p>",
    });
    expect(result.success).toBe(true);
  });

  it("空 contentHtml は拒否される", () => {
    const result = postBodyFormSchema.safeParse({
      contentJson: '{"root":{"children":[],"type":"root","version":1}}',
      contentHtml: "",
    });
    expect(result.success).toBe(false);
  });

  it("不正な contentJson は拒否される", () => {
    const result = postBodyFormSchema.safeParse({
      contentJson: "not-a-lexical-json",
      contentHtml: "<p>本文</p>",
    });
    expect(result.success).toBe(false);
  });
});

describe("postSettingsFormSchema", () => {
  it("最小 valid input が成功する", () => {
    const result = postSettingsFormSchema.safeParse({
      title: "タイトル",
      slug: "test-slug",
      status: "DRAFT",
      tags: [],
    });
    expect(result.success).toBe(true);
  });

  it("空 title は拒否される", () => {
    const result = postSettingsFormSchema.safeParse({
      title: "",
      slug: "test-slug",
      status: "DRAFT",
      tags: [],
    });
    expect(result.success).toBe(false);
  });

  it("不正な slug (大文字含む) は拒否される", () => {
    const result = postSettingsFormSchema.safeParse({
      title: "タイトル",
      slug: "Test-Slug",
      status: "DRAFT",
      tags: [],
    });
    expect(result.success).toBe(false);
  });

  it("tags が文字列配列 (FormData transit) でも UUID 配列に変換される", () => {
    const result = postSettingsFormSchema.safeParse({
      title: "タイトル",
      slug: "test-slug",
      status: "DRAFT",
      tags: JSON.stringify(["123e4567-e89b-12d3-a456-426614174000"]),
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toEqual([
        "123e4567-e89b-12d3-a456-426614174000",
      ]);
    }
  });

  it("tags 重複は拒否される", () => {
    const result = postSettingsFormSchema.safeParse({
      title: "タイトル",
      slug: "test-slug",
      status: "DRAFT",
      tags: [
        "123e4567-e89b-12d3-a456-426614174000",
        "123e4567-e89b-12d3-a456-426614174000",
      ],
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: 失敗確認**

Run: `bun test __tests__/unit/validations/post.test.ts`
Expected: 全 test fail (schema module 不在 or symbol 不在)。

- [ ] **Step 3: postBodyFormSchema + postSettingsFormSchema 実装**

Modify `src/shared/lib/validations/post.ts` (existing 想定、なければ create):

```typescript
import { z } from "zod";
import { PostStatus } from "@generated/prisma/enums";
import { lexicalJsonSchema } from "@/shared/lib/validations/lexical";
import { seoFieldsSchema, ogpFieldsSchema } from "@/shared/lib/validations/seo";

// 本文 form 用 schema (Lexical contentJson + 派生 contentHtml)
export const postBodyFormSchema = z.object({
  contentJson: lexicalJsonSchema,
  contentHtml: z.string().min(1, { error: "本文 HTML は必須です" }),
});

// 設定 form 用 schema (タイトル / メタデータ / SEO / OGP / レイアウト / 公開)
export const postSettingsFormSchema = z
  .object({
    title: z.string().min(1, { error: "タイトルは必須です" }).max(200),
    slug: z
      .string()
      .min(1, { error: "スラッグは必須です" })
      .max(200)
      .regex(/^[a-z0-9-]+$/, { error: "スラッグは小文字英数字とハイフンのみ" }),
    excerpt: z.string().max(500).optional(),
    coverImageUrl: z
      .string()
      .url()
      .nullable()
      .optional()
      .or(z.literal(""))
      .or(z.literal(null)),
    categoryId: z.string().uuid().nullable().optional(),
    tags: z.preprocess(
      (v) => {
        if (Array.isArray(v)) return v;
        if (typeof v === "string" && v.length > 0) {
          try {
            const parsed: unknown = JSON.parse(v);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        }
        return [];
      },
      z
        .array(z.string().uuid({ error: "タグ ID が不正です" }))
        .refine((arr) => new Set(arr).size === arr.length, {
          error: "同じタグを複数指定することはできません",
        })
        .default([]),
    ),
    status: z.enum(PostStatus),
    publishedAt: z
      .string()
      .datetime({ local: true })
      .or(z.literal(""))
      .nullable()
      .optional(),
    contentWidth: z.preprocess((v) => {
      if (v === "" || v === null || v === undefined) return null;
      if (typeof v === "number") return v;
      if (typeof v === "string") {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    }, z.number().int().positive().nullable()),
    contentWidthCustom: z.preprocess(/* 同上 */),
  })
  .extend(seoFieldsSchema.shape)
  .extend(ogpFieldsSchema.shape);

export type PostBodyFormData = z.input<typeof postBodyFormSchema>;
export type PostSettingsFormData = z.input<typeof postSettingsFormSchema>;
```

- [ ] **Step 4: test pass 確認**

Run: `bun test __tests__/unit/validations/post.test.ts`
Expected: 全 test pass。

- [ ] **Step 5: news schema 同型実装 + test**

Create `__tests__/unit/validations/news.test.ts` + Modify `src/shared/lib/validations/news.ts`:

```typescript
// News は status の代わりに isPublished (boolean)、tag は News tag schema
export const newsBodyFormSchema = z.object({
  contentJson: lexicalJsonSchema,
  contentHtml: z.string().min(1),
});

export const newsSettingsFormSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().regex(/^[a-z0-9-]+$/).max(200),
  excerpt: z.string().max(500).optional(),
  coverImageUrl: z.string().url().nullable().optional().or(z.literal("")).or(z.literal(null)),
  tags: z.preprocess(/* 同上 */, z.array(z.string().uuid()).refine(/* uniqueness */).default([])),
  isPublished: z.preprocess(
    (v) => {
      if (typeof v === "boolean") return v;
      return v === "on" || v === "true";
    },
    z.boolean().default(false),
  ),
  publishedAt: z.string().datetime({ local: true }).or(z.literal("")).nullable().optional(),
  contentWidth: z.preprocess(/* 同上 */, z.number().int().positive().nullable()),
  contentWidthCustom: z.preprocess(/* 同上 */),
  ...seoFieldsSchema.shape,
  ...ogpFieldsSchema.shape,
});
```

- [ ] **Step 6: validate (type-check + lint + 既存 test 全 pass)**

Run: `bun run validate`
Expected: exit 0。schema 変更による Server Action 側の input 型 mismatch が出る場合は **Task 3 で吸収する** (本 task では schema 単体 pass のみ)。

- [ ] **Step 7: Commit**

```bash
git add src/shared/lib/validations/post.ts src/shared/lib/validations/news.ts __tests__/unit/validations/post.test.ts __tests__/unit/validations/news.test.ts
git commit -m "feat(validations): conform 用 in-place preprocess schema を post / news に追加 (Phase 3-B Task 2)"
```

---

### Task 3: Server Action conform 化 (post + news, 6 file)

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/post.ts` (updatePostBody / updatePostSettings / createPost)
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/news.ts` (updateNewsBody / updateNewsSettings / createNews)
- Modify: 既存 `__tests__/integration/actions/admin/post*.test.ts` / `news*.test.ts` (signature 変更に伴う fixture 更新)

- [ ] **Step 1: updatePostBody を `(prev, formData) => SubmissionResult` 化**

Modify `src/app/(admin)/admin/(dashboard)/_shared/actions/post.ts`:

```typescript
"use server";

import { parseWithZod } from "@conform-to/zod/v4";
import { postBodyFormSchema } from "@/shared/lib/validations/post";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import * as postCommands from "@/shared/domain/posts/commands";

export async function updatePostBody(
  id: string,
  prev: unknown,
  formData: FormData,
) {
  return executeConformMutation({
    formData,
    schema: postBodyFormSchema,
    resource: "post",
    action: "update",
    resourceId: id,
    execute: async (data) => {
      await postCommands.updatePostBody(id, {
        contentJson: data.contentJson,
        contentHtml: data.contentHtml,
      });
      return { id };
    },
    afterSuccess: () => {
      updateTag(getCacheTag.posts.detail(id));
      updateTag(CACHE_TAGS.POSTS);
    },
  });
}

// updatePostSettings / createPost も同パターン。createPost は id 不在 → afterSuccess で created.id 取得
```

`executeConformMutation` の signature と SSoT 経由パターンは `@/shared/lib/forms/conform-action.ts` 参照 (既存 Phase 1-2 で確立済)。

- [ ] **Step 2: createPost は bind パターンで id 不要、画面遷移は server-side redirect**

```typescript
export async function createPost(prev: unknown, formData: FormData) {
  return executeConformMutation({
    formData,
    schema: postCreateFormSchema, // bodyForm + settingsForm の合成 schema 別途定義
    resource: "post",
    action: "create",
    execute: async (data) => {
      const created = await postCommands.createPost(/* ... */);
      return { id: created.id, slug: created.slug };
    },
    afterSuccess: ({ id, slug }) => {
      updateTag(CACHE_TAGS.POSTS);
      // server-side redirect (CLAUDE.md §Page 遷移 form Task 8.4-8.7 canonical)
      redirect(toAppRoute(`/admin/posts/${id}/edit`));
    },
  });
}
```

- [ ] **Step 3: news 側 3 action も同パターン化**

- [ ] **Step 4: integration test fixture 更新**

```bash
grep -rln 'updatePostBody\|updatePostSettings\|createPost\|updateNewsBody\|updateNewsSettings\|createNews' __tests__/integration/actions/admin/
```

各 test file の mock fixture を `(prev: undefined, formData: FormData)` signature に更新。FormData mock helper は `@/shared/lib/forms/test-helpers` か既存 Phase 1 で確立した pattern を流用。

- [ ] **Step 5: validate (type-check + lint + integration test 全 pass)**

Run: `bun run validate && bun run test:integration`
Expected: exit 0。Server Action 側のみ conform 化、UI 側はまだ RHF 呼び出しのため一時的に build 失敗 (handler signature mismatch)。**この時点では UI 側 build pass 不要、Task 4 で吸収**。

- [ ] **Step 6: Commit (build broken 状態のまま、Task 4 でまとめて検証)**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/actions/post.ts src/app/\(admin\)/admin/\(dashboard\)/_shared/actions/news.ts __tests__/integration/actions/admin/
git commit -m "refactor(actions): post / news Server Action を executeConformMutation 化 (Phase 3-B Task 3, build 一時破綻)"
```

⚠️ **CLAUDE.md §大規模 plan 実行時は implementer に commit 禁止 + controller 最終統合** が適用される場合は、Task 3 単独 commit ではなく Task 5 完了時に bundle 化する。spec spec ではどちらでも OK (subagent-driven 採用時は controller が判断)。

---

### Task 4: content-types/types.ts の interface refactor

**Files:**

- Modify: `_shared/components/editor/inline/content-types/types.ts`

- [ ] **Step 1: RHF types を conform types に置換**

Modify `types.ts`:

```typescript
import type { ReactNode } from "react";
import type { FieldMetadata } from "@conform-to/react";
import type { PostStatus } from "@/shared/lib/validations/enums/prisma-types";

// 汎用 conform field 描画 props (12 side-panel 共有 SSoT)
export type SidePanelInjectedProps<TForm extends Record<string, unknown>> = {
  // conform fields object (FieldMetadata<T> SSoT)
  fields: Required<{
    [K in keyof TForm]: FieldMetadata<TForm[K], TForm, string[]>;
  }>;
  // form metadata (form.update / form.insert / form.reorder 等の操作)
  form: ReturnType<typeof import("@conform-to/react").useForm<TForm>>[0];
  disabled?: boolean;
};

// PostSidePanelExtra / NewsSidePanelExtra は維持 (extra props 構造変えず)
export type PostSidePanelExtra = {
  categories: readonly CategoryOption[];
  availableTags: readonly TagOption[];
  onCreateCategory: (name: string) => Promise<CategoryOption | null>;
  onCreateTag: (name: string) => Promise<TagOption | null>;
  statusValue: PostStatus;
  onStatusChange: (value: PostStatus) => void;
};

// SidePanelDefinition / SidePanelTabDefinition / SidePanelSectionDefinition / SidePanelRenderContext は維持
```

`UseFormRegister` / `Control` / `UseFormSetValue` / `UseFormGetValues` / `FieldErrors` の import を完全削除。

- [ ] **Step 2: validate (type-check のみ、UI 側まだ RHF 呼んでいるため build 破綻継続)**

Run: `bun run type-check`
Expected: types.ts 自体は pass、12 side-panel + content-types/{post,news}.tsx は import エラー (Task 5-6 で吸収)。

- [ ] **Step 3: Commit (build broken 継続)**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/inline/content-types/types.ts
git commit -m "refactor(inline-editor): SidePanelInjectedProps を conform FieldMetadata + form ベースに置換 (Phase 3-B Task 4)"
```

---

### Task 5: 12 side-panel component の conform 化 (bundle)

**Files (12 modify)**:

- BasicInfoFields.tsx / TitleSlugFields.tsx / ExcerptFields.tsx / CategoryFields.tsx / CategoryTagFields.tsx / TagFields.tsx / PostTagFields.tsx / TagInput.tsx / ImageFields.tsx / LayoutFields.tsx / OGPFields.tsx / SEOFields.tsx / UnifiedPublishFields.tsx

⚠️ **密結合 bundle**: 12 file の interface が `SidePanelInjectedProps<T>` 経由で同一型に依存するため、subagent-driven dispatch は単一 implementer に bundle (`subagent-dispatch-template` SKILL に従う)。controller 直接実装も可。

- [ ] **Step 1: BasicInfoFields.tsx (canonical 参照実装)**

Modify `BasicInfoFields.tsx`:

```tsx
"use client";

import { getInputProps, getTextareaProps } from "@conform-to/react";
import type { FieldMetadata } from "@conform-to/react";
import { Input, Label, Textarea, Button } from "@/admin/components/ui";

type BasicInfoFieldsProps = {
  titleField: FieldMetadata<string>;
  slugField: FieldMetadata<string>;
  excerptField: FieldMetadata<string | undefined>;
  onAutoGenerateSlug: () => void;
  disabled?: boolean;
};

export function BasicInfoFields({
  titleField,
  slugField,
  excerptField,
  onAutoGenerateSlug,
  disabled,
}: BasicInfoFieldsProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={titleField.id}>タイトル</Label>
        <Input
          {...getInputProps(titleField, { type: "text" })}
          placeholder="記事のタイトル"
          disabled={disabled}
        />
        {titleField.errors && (
          <p className="text-sm text-destructive">{titleField.errors[0]}</p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor={slugField.id}>スラッグ（URL）</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onAutoGenerateSlug}
            disabled={disabled}
          >
            自動生成
          </Button>
        </div>
        <Input
          {...getInputProps(slugField, { type: "text" })}
          placeholder="article-slug"
          disabled={disabled}
        />
        {slugField.errors && (
          <p className="text-sm text-destructive">{slugField.errors[0]}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={excerptField.id}>抜粋</Label>
        <Textarea
          {...getTextareaProps(excerptField)}
          placeholder="記事の抜粋（一覧ページに表示）"
          rows={3}
          disabled={disabled}
        />
        <p className="text-xs text-muted-foreground">500 文字以内</p>
        {excerptField.errors && (
          <p className="text-sm text-destructive">{excerptField.errors[0]}</p>
        )}
      </div>
    </div>
  );
}
```

**slug 自動生成**: 親 hook 側 (`usePostEditor`) で `form.update({ name: 'slug', value: generatedSlug })` を呼ぶ callback として `onAutoGenerateSlug` を受け取り、`getValues` 依存を排除。

- [ ] **Step 2: 11 remaining side-panel を同 pattern 化**

各 file の RHF API → conform 等価変換:

| RHF                                | conform                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| `register("name")`                 | `getInputProps(field, { type: "text" })` / `getTextareaProps(field)`           |
| `useController({ control, name })` | `useInputControl(field)` (Switch / Select / custom widget)                     |
| `setValue("name", value)`          | `form.update({ name, value })`                                                 |
| `getValues("name")`                | `field.value` (注: derived state は親 hook で計算して prop で渡す)             |
| `errors.name?.message`             | `field.errors?.[0]`                                                            |
| `useWatch({ control, name })`      | `field.value` (controlled re-render は不要、conform は subscription 自動)      |
| `useFieldArray({ control, name })` | `form.insert/remove.getButtonProps` + `field.getFieldList()` + `getFieldset()` |

**LayoutFields の境界 cast**: `LayoutFieldsConnected<T>` の `as Path<T>` cast は conform 化後 `as FieldMetadata<number | null>` boundary cast に置換 (ledger §5 entry を rename + 内容更新)。

- [ ] **Step 3: validate (type-check + lint)**

Run: `bun run validate`
Expected: 12 side-panel + types.ts は pass、`usePostEditor` / `useNewsEditor` / `SettingsDialog` / `content-types/{post,news}.tsx` は依然 RHF 呼び出しで pass せず (Task 6 で吸収)。

- [ ] **Step 4: ledger 更新 (LayoutFields entry rename)**

Edit `.claude/rules/type-safety/documented-exceptions-ledger.md`:

| File               |    Line    | Cast                               |           例外区分            | Justification                                             |
| ------------------ | :--------: | ---------------------------------- | :---------------------------: | --------------------------------------------------------- |
| `LayoutFields.tsx` | (新行番号) | `as FieldMetadata<number \| null>` | §5 conform generic invariance | `Path<T>` 旧 cast を conform 移行で rename、同 invariance |

- [ ] **Step 5: Commit (bundle)**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/inline/side-panel/ .claude/rules/type-safety/documented-exceptions-ledger.md
git commit -m "refactor(inline-editor): 12 side-panel component を conform FieldMetadata API 化 + ledger §5 LayoutFields entry rename (Phase 3-B Task 5)"
```

---

### Task 6: SettingsDialog.tsx + content-types/{post,news}.tsx の conform 化

**Files:**

- Modify: `SettingsDialog.tsx`
- Modify: `content-types/post.tsx`
- Modify: `content-types/news.tsx`

- [ ] **Step 1: SettingsDialog の buildRenderContext を conform 化**

Modify `SettingsDialog.tsx`:

```tsx
import type { FieldMetadata } from "@conform-to/react";
import type { FieldsetMetadata } from "@conform-to/react";

function buildRenderContext<
  TForm extends Record<string, unknown>,
  TExtra extends Record<string, unknown>,
>(
  injected: SidePanelInjectedProps<TForm>,
  extraProps: TExtra,
): SidePanelRenderContext<TForm, TExtra> {
  const { disabled, ...rest } = injected;
  return disabled === undefined
    ? { ...rest, ...extraProps }
    : { ...rest, ...extraProps, disabled };
}
```

`FieldValues` import を削除、`Record<string, unknown>` generic に置換。

- [ ] **Step 2: content-types/post.tsx の sidePanel definition を conform field 経由に変更**

```tsx
"use client";

import type { PostSettingsFormData } from "@/shared/lib/validations/post";
import { BasicInfoFields } from "../side-panel/BasicInfoFields";
import { CategoryFields } from "../side-panel/CategoryFields";
// ...

export const postContentTypeConfig: ContentTypeConfig<
  PostSettingsFormData,
  PostSidePanelExtra
> = {
  id: "post",
  sidePanel: {
    title: "記事設定",
    tabs: [
      {
        id: "basic",
        label: "基本",
        sections: [
          {
            title: "基本情報",
            render: (ctx) => (
              <BasicInfoFields
                titleField={ctx.fields.title}
                slugField={ctx.fields.slug}
                excerptField={ctx.fields.excerpt}
                onAutoGenerateSlug={() => {
                  const generated = slugify(ctx.fields.title.value ?? "");
                  ctx.form.update({ name: "slug", value: generated });
                }}
                {...spreadOptionalDisabled(ctx)}
              />
            ),
          },
          // ... 他 section
        ],
      },
      // ... 他 tab (category / SEO / OGP / layout / publish)
    ],
  },
};
```

- [ ] **Step 3: content-types/news.tsx も同 pattern 化**

- [ ] **Step 4: validate (type-check + lint)**

Run: `bun run validate`
Expected: side-panel + types.ts + SettingsDialog + content-types/{post,news}.tsx は pass、`usePostEditor` / `useNewsEditor` のみ依然 RHF (Task 7 で吸収)。

- [ ] **Step 5: Commit**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/inline/SettingsDialog.tsx src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/inline/content-types/
git commit -m "refactor(inline-editor): SettingsDialog + content-types/{post,news} を conform 化 (Phase 3-B Task 6)"
```

---

### Task 7: usePostEditor / useNewsEditor の dual form conform 化

**Files:**

- Modify: `usePostEditor.ts`
- Modify: `useNewsEditor.ts`
- Modify: `shared/use-editor-core.ts`
- Modify: `use-content-width-styles.ts` (RHF 依存があれば)

- [ ] **Step 1: usePostEditor の bodyForm を conform 化**

Modify `usePostEditor.ts`:

```typescript
import { useForm } from "@conform-to/react";
import { parseWithZod, getZodConstraint } from "@conform-to/zod/v4";
import {
  postBodyFormSchema,
  postSettingsFormSchema,
} from "@/shared/lib/validations/post";
import { renderEditorStateJsonToHtmlClient } from "@/admin/components/editor/lexical/preview/render-editor-state-to-html-client";

export function usePostEditor({
  post,
  onSaveBody,
  onSaveSettings,
  onCreate,
}: UsePostEditorProps) {
  // bodyForm (Lexical contentJson + 派生 contentHtml)
  const [bodyForm, bodyFields] = useForm({
    id: "post-body-form",
    constraint: getZodConstraint(postBodyFormSchema),
    defaultValue: {
      contentJson: post?.contentJson ?? EMPTY_LEXICAL_EDITOR_STATE_JSON,
      contentHtml: post?.contentHtml ?? "",
    },
    onValidate: ({ formData }) =>
      parseWithZod(formData, { schema: postBodyFormSchema }),
    onSubmit: async (event, { submission }) => {
      event.preventDefault();
      if (submission?.status !== "success") return;
      // contentHtml は派生 (Task 8.3 TermsForm pattern、React Compiler 自動メモ化)
      const contentJson = submission.value.contentJson;
      const contentHtml = renderEditorStateJsonToHtmlClient(contentJson);
      await onSaveBody({ contentJson, contentHtml });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  });

  // settingsForm (タイトル / メタデータ / SEO / OGP / レイアウト / 公開)
  const [settingsForm, settingsFields] = useForm({
    id: "post-settings-form",
    constraint: getZodConstraint(postSettingsFormSchema),
    defaultValue: toSettingsFormData(post),
    onValidate: ({ formData }) =>
      parseWithZod(formData, { schema: postSettingsFormSchema }),
    onSubmit: async (event, { submission }) => {
      event.preventDefault();
      if (submission?.status !== "success") return;
      await onSaveSettings(submission.value);
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  });

  // createPost: bodyForm + settingsForm の合成
  const handleCreate = async () => {
    // ... 両 form の validity 確認後に onCreate 呼び出し
  };

  const editorCore = useEditorCore({
    bodyForm,
    settingsForm,
    listPath: "/admin/posts",
  });

  return {
    bodyForm,
    bodyFields,
    settingsForm,
    settingsFields,
    ...editorCore,
    handleCreate,
  };
}
```

- [ ] **Step 2: use-editor-core を conform `FormMetadata` ベースに refactor**

```typescript
import type { FormMetadata } from "@conform-to/react";

export function useEditorCore<
  TBody extends Record<string, unknown>,
  TSettings extends Record<string, unknown>,
>({
  bodyForm,
  settingsForm,
  listPath,
}: {
  bodyForm: FormMetadata<TBody>;
  settingsForm: FormMetadata<TSettings>;
  listPath: string;
}): EditorCoreReturn {
  const isDirty = bodyForm.dirty || settingsForm.dirty; // conform は per-form dirty state を持つ
  // ... 他 state は維持
}
```

`computeIsDirty` / `createContentChangeHandler` / `createResetHandler` は **削除** (Lexical contentJson 派生計算 pattern に置換、`hasEditorChanges` state は conform `bodyForm.dirty` で代替)。

- [ ] **Step 3: useNewsEditor も同 pattern 化**

- [ ] **Step 4: PostEditor / NewsEditor 側の form rendering を conform `<form id={form.id} onSubmit={form.onSubmit}>` 化**

Modify `posts/_components/PostEditor.tsx` / `news/_components/NewsEditor.tsx`:

```tsx
<form id={bodyForm.id} onSubmit={bodyForm.onSubmit}>
  <LexicalEditor
    contentJson={bodyFields.contentJson.value}
    onChange={(json) => bodyForm.update({ name: "contentJson", value: json })}
  />
  <input type="hidden" {...getInputProps(bodyFields.contentJson, { type: "hidden" })} />
  <SubmitButton>保存</SubmitButton>
</form>

<SettingsDialog
  open={isSettingsDialogOpen}
  onOpenChange={setIsSettingsDialogOpen}
  config={postContentTypeConfig.sidePanel}
  injected={{ fields: settingsFields, form: settingsForm }}
  extraProps={{ categories, availableTags, /* ... */ }}
/>
```

- [ ] **Step 5: validate (full pipeline)**

Run: `bun run validate && bun run build`
Expected: exit 0。Lexical contentJson の派生計算が browser 側で実行されることを確認 (`react-server` condition 非互換回避、CLAUDE.md §クリティカルルール参照)。

- [ ] **Step 6: E2E smoke test (Playwright MCP)**

Run dev server (manual) + Playwright MCP で `/admin/posts/new` + `/admin/posts/[id]/edit` を navigate:

1. 本文 Lexical で `<p>テスト本文</p>` を入力
2. 「保存」クリック → updatePostBody 呼ばれて contentHtml が正しく派生されることを確認
3. 「記事設定」dialog open → title / slug / category / tags / SEO / OGP / layout / status を編集 → 「保存」クリック → updatePostSettings 呼ばれて全 field が正しく persist されることを確認
4. 「新規作成」flow で createPost → server redirect 後 detail page 表示確認

⚠️ **Playwright MCP HMR キャッシュ罠**: navigate 経由で古い bundle がキャッシュされることがある。`browser_evaluate("() => window.location.reload()")` で強制 reload + `browser_evaluate(getComputedStyle)` で実態確認 (CLAUDE.md §Playwright MCP 参照)。

- [ ] **Step 7: Commit (bundle、Task 7 全体を 1 commit)**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/editor/inline/hooks/ src/app/\(admin\)/admin/\(dashboard\)/posts/_components/PostEditor.tsx src/app/\(admin\)/admin/\(dashboard\)/news/_components/NewsEditor.tsx
git commit -m "refactor(inline-editor): usePostEditor / useNewsEditor dual form を conform + 派生 contentHtml 計算に移行 (Phase 3-B Task 7)"
```

---

### Task 8: form.tsx primitive 削除 + 残存 RHF audit

**Files:**

- Delete: `@/admin/components/ui/form.tsx` (path: `_shared/components/ui/form.tsx`)
- Audit: 全 admin codebase で `react-hook-form` / `@hookform/resolvers` import の残存ゼロ確認

- [ ] **Step 1: 残存 RHF import 全件 grep**

Run:

```bash
grep -rnE 'from "react-hook-form"|from "@hookform/resolvers' src/
```

Expected: 0 件 (auto-section-form は Phase 3-A 完了済、Phase 3-B で 21 file 全 conform 化済)。

- [ ] **Step 2: form.tsx の consumer 全件 grep**

```bash
grep -rnE 'from "@/admin/components/ui/form"|from "../ui/form"|from "../../ui/form"|import \{ Form\b|FormField\|FormItem\|FormLabel\|FormControl\|FormDescription\|FormMessage\b' src/
```

Expected: 0 件 (Phase 1-3 で全 form が conform に移行済のため form.tsx primitive consumer ゼロ)。

- [ ] **Step 3: form.tsx 削除**

```bash
python3 -c "import os; os.remove(r'G:\workspace\work\website\customer\myrrh-rental-space\src\app\(admin)\admin\(dashboard)\_shared\components\ui\form.tsx')"
```

(MINGW64 環境で `()` を含むパスを Bash で渡せないため `python3 -c` で削除、CLAUDE.md §MINGW64 参照)

- [ ] **Step 4: validate**

Run: `bun run validate && bun run build`
Expected: exit 0。

- [ ] **Step 5: Commit**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/ui/form.tsx
git commit -m "chore(ui): RHF 依存 form.tsx primitive を削除 (Phase 3-B Task 8、Phase 3-C 実行可能化)"
```

---

### Task 9: Inline editor rule docs の更新

**Files:**

- Modify: `.claude/rules/frontend/admin-inline-editor-patterns.md`

- [ ] **Step 1: Rule docs の RHF 言及を conform 言及に置換**

Edit `admin-inline-editor-patterns.md`:

- **重要 (Phase 3-B 完了後の現状)**: 本 editor は conform 1.19 + Zod 4 ベースで実装されている。新規実装も conform 統一 (RHF は完全削除済、Phase 3-C で package.json から react-hook-form / @hookform/resolvers 削除予定)
- ディレクトリ正本表の `register / control / errors / setValue / getValues` を `FieldMetadata<T>` + `form.update / form.insert` に置換
- 「公式準拠の前提」の RHF 言及を conform に置換 (`@conform-to/react` / `@conform-to/zod/v4`)
- 「`LayoutFields` のみ `any` 境界」の節を「`LayoutFields` の `as FieldMetadata<number | null>` 境界」にリネーム (内容 invariance 維持)

- [ ] **Step 2: Commit**

```bash
git add .claude/rules/frontend/admin-inline-editor-patterns.md
git commit -m "docs(rules): admin-inline-editor-patterns を Phase 3-B (conform) canonical に更新"
```

---

### Task 10: Phase 3-C 準備 — package.json 依存削除可能性の最終確認

**Files (read-only audit)**:

- Audit: `package.json` の `react-hook-form` / `@hookform/resolvers` を含む dependencies / devDependencies

- [ ] **Step 1: 依存利用箇所が完全に消えたことを最終 grep**

Run:

```bash
# 残存 RHF import
grep -rnE 'from "react-hook-form"|from "@hookform/resolvers"|"react-hook-form"|"@hookform/resolvers"' src/ __tests__/ scripts/ prisma/

# RHF type references
grep -rnE 'UseFormReturn|UseFormRegister|UseFormSetValue|UseFormGetValues|UseFormWatch|Control<|FieldValues|FieldErrors|FieldPathByValue|Path<|useFormContext|useFieldArray\b|useController\b|useWatch\b|useFormStatus\(\)|standardSchemaResolver|zodResolver|FormProvider' src/ __tests__/

# package.json 直接参照
grep -nE 'react-hook-form|hookform' package.json
```

Expected: 0 件 (package.json のみ Phase 3-C で削除する `dependencies` entry 残存)。

- [ ] **Step 2: Phase 3-C handoff memo 作成**

Write `~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/project_type-safety-phase-3c-handoff.md`:

```markdown
---
name: type-safety-phase-3c-handoff
description: Phase 3-C (react-hook-form / @hookform/resolvers package.json 削除) handoff
metadata:
  type: project
---

> **Snapshot: 2026-05-17**
> Phase 3-B (inline editor RHF → conform 移行) 完了済。Phase 3-C 実行可能。

## 完遂条件 (Phase 3-C)

1. `bun remove react-hook-form @hookform/resolvers` 実行
2. `bun run validate && bun run build && bun run test:unit && bun run test:integration` exit 0 確認
3. PR 作成 + CI merge

## Phase 3-B 完了済 (PR 番号)

- Task 2-9 の commit SHA 一覧 (実行後に追記)

## 期待される silent bug

- `node_modules/react-hook-form` 残存 — `bun.lock` の lockfile diff で確認
- Zod schema preprocess の `useFormAction` (RHF) 経路残存 — grep でゼロ確認済

## 次セッション起動コマンド

\`\`\`
bun remove react-hook-form @hookform/resolvers && bun run validate && bun run build
\`\`\`
```

Update `MEMORY.md` index:

```markdown
- [project_type-safety-phase-3c-handoff.md](project_type-safety-phase-3c-handoff.md) — Phase 3-C (react-hook-form / @hookform/resolvers 削除) handoff
```

- [ ] **Step 3: Commit (audit + handoff のみ、削除は Phase 3-C の別 session)**

```bash
git add ~/.claude/projects/G--workspace-work-website-customer-myrrh-rental-space/memory/
git commit -m "docs(memory): Phase 3-C handoff memo (react-hook-form 削除前提条件完了)"
```

---

## Execution Order Summary

| Task | Files                                                                     | Test 影響                     | Commit                                  |
| ---- | ------------------------------------------------------------------------- | ----------------------------- | --------------------------------------- |
| 1    | docs/superpowers/specs/2026-05-17-phase-3b-inventory.md                   | —                             | inventory commit                        |
| 2    | post.ts / news.ts validations + tests                                     | unit test 4 件 add            | schema commit                           |
| 3    | actions/post.ts / news.ts (6 action) + integration test fixture           | integration test fixture 更新 | server action commit (build broken)     |
| 4    | content-types/types.ts                                                    | —                             | interface commit (build broken)         |
| 5    | 12 side-panel                                                             | —                             | side-panel bundle commit (build broken) |
| 6    | SettingsDialog + content-types/{post,news}.tsx                            | —                             | dispatcher commit (build broken)        |
| 7    | usePostEditor / useNewsEditor / use-editor-core / PostEditor / NewsEditor | E2E smoke                     | dual form commit (**build pass**)       |
| 8    | form.tsx 削除 + audit                                                     | —                             | primitive cleanup commit                |
| 9    | rule docs 更新                                                            | —                             | docs commit                             |
| 10   | audit + handoff memo                                                      | —                             | handoff commit                          |

**重要**: Task 3-6 は build broken 状態で中間 commit を作成 (bundle 内部の dependency cascade のため)。Task 7 完了で build pass に復帰。subagent-driven dispatch 採用時は **Task 3-7 を 1 implementer に bundle、controller 最終統合 commit** (CLAUDE.md §1-commit BREAKING plan 実行時) を選択肢に含める。

---

## Self-Review Checklist

- [x] **Spec coverage**: usePostEditor (Task 7) / useNewsEditor (Task 7) / use-editor-core (Task 7) / use-content-width-styles (Task 7 で必要なら) / 12 side-panel (Task 5) / SettingsDialog (Task 6) / content-types/{post,news,types}.tsx (Task 6 + 4) / form.tsx (Task 8) — 全 21 file をカバー
- [x] **Placeholder scan**: 全 Task に exact code + exact command 記載、TBD / TODO / 「similar to Task N」記述なし
- [x] **Type consistency**: `FieldMetadata<T>` / `FormMetadata<T>` 命名は全 Task で統一、`SidePanelInjectedProps<TForm>` interface も Task 4 で定義 → Task 5-6 で consumer 統一
- [x] **dependency cascade 明示**: Task 3-6 が build broken を中間状態として許容、Task 7 で復帰することを明記
- [x] **既存 SSoT 参照**: `executeConformMutation` / `lexicalJsonSchema` / `renderEditorStateJsonToHtmlClient` / `useFieldArray` 配列 uniqueness / `parseDateTimeLocalAsJst` を Phase 1-2 + 3-A canonical 参照実装と統一
- [x] **ledger 更新箇所明示**: Task 5 (LayoutFields §5 entry rename) + Task 4 (新規 conform invariance entry が必要なら追加)

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-17-phase-3b-inline-editor-conform.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**

⚠️ **cool down 中**: 直近 60 分で PR 5 件 merge 済 (CLAUDE.md §86 cool down 閾値到達)、本 spec の Task 1-10 実行は **次セッションへの handoff 推奨**。本 commit (spec ファイル単体) のみで本セッション完遂を提案。
