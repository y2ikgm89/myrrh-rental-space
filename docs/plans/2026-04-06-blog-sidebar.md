# Blog Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ブログ系3ページ（`/journal`, `/posts/[...segments]`, `/news/[slug]`）に Editorial Magazine サイドバーを実装する。ウィジェットの並び替え・カスタムウィジェット対応。

**Architecture:** サイドバー設定は Settings テーブルの `sidebarWidgets` JSON を順序付き配列に破壊的変更。公開ページは `BlogLayout` SC が設定を評価し、2カラム or 1カラムを切り替える。`BlogSidebar` SC がウィジェット配列順にレンダリング。管理画面は dnd-kit ソータブルリストで並び替え + カスタムウィジェット追加。

**Tech Stack:** Next.js 16 (`'use cache'`), React 19 (SC/CC), Zod 4, dnd-kit, Tailwind CSS 4, nuqs

**Spec:** `docs/superpowers/specs/2026-04-06-blog-sidebar-design.md`

---

### Task 1: Zod スキーマ書き換え（sidebar.ts）

**Files:**

- Rewrite: `src/shared/lib/validations/sidebar.ts`
- Test: `__tests__/unit/shared/lib/sidebar-validation.test.ts`

- [ ] **Step 1: テストを書く**

```typescript
// __tests__/unit/shared/lib/sidebar-validation.test.ts
import { describe, expect, test } from "bun:test";
import {
  sidebarWidgetsSchema,
  sidebarSettingsSchema,
  DEFAULT_SIDEBAR_WIDGETS,
  parseSidebarWidgets,
  type BuiltinWidgetType,
} from "@/shared/lib/validations/sidebar";

describe("sidebarWidgetsSchema", () => {
  test("validates default widgets array", () => {
    const result = sidebarWidgetsSchema.safeParse(DEFAULT_SIDEBAR_WIDGETS);
    expect(result.success).toBe(true);
  });

  test("validates array with custom widget", () => {
    const widgets = [
      { type: "search", enabled: true },
      { type: "custom", enabled: true, id: "abc123", title: "Contact" },
    ];
    const result = sidebarWidgetsSchema.safeParse(widgets);
    expect(result.success).toBe(true);
  });

  test("rejects custom widget without id", () => {
    const widgets = [{ type: "custom", enabled: true, title: "No ID" }];
    const result = sidebarWidgetsSchema.safeParse(widgets);
    expect(result.success).toBe(false);
  });

  test("rejects custom widget without title", () => {
    const widgets = [{ type: "custom", enabled: true, id: "abc" }];
    const result = sidebarWidgetsSchema.safeParse(widgets);
    expect(result.success).toBe(false);
  });

  test("accepts custom widget with all optional fields", () => {
    const widgets = [
      {
        type: "custom",
        enabled: true,
        id: "abc",
        title: "CTA",
        description: "Some text",
        linkUrl: "/contact",
        linkLabel: "Go",
      },
    ];
    const result = sidebarWidgetsSchema.safeParse(widgets);
    expect(result.success).toBe(true);
  });

  test("rejects invalid builtin type", () => {
    const widgets = [{ type: "unknown", enabled: true }];
    const result = sidebarWidgetsSchema.safeParse(widgets);
    expect(result.success).toBe(false);
  });
});

describe("parseSidebarWidgets", () => {
  test("parses valid array", () => {
    const result = parseSidebarWidgets(DEFAULT_SIDEBAR_WIDGETS);
    expect(result).toEqual(DEFAULT_SIDEBAR_WIDGETS);
  });

  test("returns default for legacy object format", () => {
    const legacy = {
      search: true,
      recent: true,
      popular: true,
      categories: true,
      tags: true,
    };
    const result = parseSidebarWidgets(legacy);
    expect(result).toEqual(DEFAULT_SIDEBAR_WIDGETS);
  });

  test("returns default for null/undefined", () => {
    expect(parseSidebarWidgets(null)).toEqual(DEFAULT_SIDEBAR_WIDGETS);
    expect(parseSidebarWidgets(undefined)).toEqual(DEFAULT_SIDEBAR_WIDGETS);
  });

  test("returns default for invalid data", () => {
    expect(parseSidebarWidgets("string")).toEqual(DEFAULT_SIDEBAR_WIDGETS);
    expect(parseSidebarWidgets(42)).toEqual(DEFAULT_SIDEBAR_WIDGETS);
  });
});

describe("sidebarSettingsSchema", () => {
  test("validates complete settings", () => {
    const settings = {
      sidebarEnabled: true,
      sidebarWidgets: DEFAULT_SIDEBAR_WIDGETS,
      sidebarRecentCount: 5,
      sidebarPopularCount: 5,
    };
    const result = sidebarSettingsSchema.safeParse(settings);
    expect(result.success).toBe(true);
  });

  test("rejects count out of range", () => {
    const settings = {
      sidebarEnabled: true,
      sidebarWidgets: DEFAULT_SIDEBAR_WIDGETS,
      sidebarRecentCount: 0,
      sidebarPopularCount: 21,
    };
    const result = sidebarSettingsSchema.safeParse(settings);
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: テスト失敗を確認**

Run: `bun test __tests__/unit/shared/lib/sidebar-validation.test.ts`
Expected: FAIL — モジュールが旧形式で export が一致しない

- [ ] **Step 3: sidebar.ts を書き換え**

```typescript
// src/shared/lib/validations/sidebar.ts
import { z } from "zod";

// ---------------------------------------------------------------------------
// Widget types
// ---------------------------------------------------------------------------

export const BUILTIN_WIDGET_TYPES = [
  "search",
  "recent",
  "popular",
  "categories",
  "tags",
] as const;

export type BuiltinWidgetType = (typeof BUILTIN_WIDGET_TYPES)[number];

// ---------------------------------------------------------------------------
// Widget schemas
// ---------------------------------------------------------------------------

const builtinWidgetSchema = z.object({
  type: z.enum(BUILTIN_WIDGET_TYPES),
  enabled: z.boolean(),
});

const customWidgetSchema = z.object({
  type: z.literal("custom"),
  enabled: z.boolean(),
  id: z.string().min(1),
  title: z.string().min(1, { error: "タイトルは必須です" }).max(100),
  description: z.string().max(500).optional(),
  linkUrl: z.string().max(500).optional(),
  linkLabel: z.string().max(100).optional(),
});

export type BuiltinWidget = z.infer<typeof builtinWidgetSchema>;
export type CustomWidget = z.infer<typeof customWidgetSchema>;
export type SidebarWidget = BuiltinWidget | CustomWidget;

export const sidebarWidgetsSchema = z.array(
  z.union([builtinWidgetSchema, customWidgetSchema]),
);

export type SidebarWidgets = z.infer<typeof sidebarWidgetsSchema>;

// ---------------------------------------------------------------------------
// Settings schema
// ---------------------------------------------------------------------------

export const sidebarSettingsSchema = z.object({
  sidebarEnabled: z.boolean(),
  sidebarWidgets: sidebarWidgetsSchema,
  sidebarRecentCount: z.number().int().min(1).max(20),
  sidebarPopularCount: z.number().int().min(1).max(20),
});

export type SidebarSettings = z.infer<typeof sidebarSettingsSchema>;

// ---------------------------------------------------------------------------
// Defaults & migration helper
// ---------------------------------------------------------------------------

export const DEFAULT_SIDEBAR_WIDGETS: SidebarWidget[] = [
  { type: "search", enabled: true },
  { type: "recent", enabled: true },
  { type: "popular", enabled: true },
  { type: "categories", enabled: true },
  { type: "tags", enabled: true },
];

/**
 * Parse sidebar widgets from DB JSON.
 * Handles: valid array, legacy object format, null/undefined, invalid data.
 * Always returns a valid SidebarWidget[].
 */
export function parseSidebarWidgets(value: unknown): SidebarWidget[] {
  // Valid array format
  const arrayResult = sidebarWidgetsSchema.safeParse(value);
  if (arrayResult.success) return arrayResult.data;

  // Fallback for any invalid format (including legacy object)
  return DEFAULT_SIDEBAR_WIDGETS;
}
```

- [ ] **Step 4: テスト通過を確認**

Run: `bun test __tests__/unit/shared/lib/sidebar-validation.test.ts`
Expected: ALL PASS

- [ ] **Step 5: 型チェック**

Run: `bun run type-check`
Expected: `sidebarWidgetsSchema` / `SidebarWidgets` の旧型を参照しているファイルでエラー（次タスクで修正）

- [ ] **Step 6: コミット**

```bash
git add src/shared/lib/validations/sidebar.ts __tests__/unit/shared/lib/sidebar-validation.test.ts
git commit -m "feat(sidebar): rewrite Zod schema to ordered array with custom widget support"
```

---

### Task 2: 管理画面スキーマ・アクション更新

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/schemas/form-schemas-privacy-appearance.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/other.ts`
- Modify: `src/shared/domain/settings/commands.ts`

- [ ] **Step 1: `form-schemas-privacy-appearance.ts` の `sidebarFormSchema` を更新**

旧形式（`sidebarWidgets: z.object({ search: z.boolean(), ... })`）を新形式に変更:

```typescript
// form-schemas-privacy-appearance.ts — sidebarFormSchema セクションを以下に差し替え
import { sidebarWidgetsSchema } from "@/shared/lib/validations/sidebar";

export const sidebarFormSchema = z.object({
  sidebarEnabled: z.boolean(),
  sidebarWidgets: sidebarWidgetsSchema,
  sidebarRecentCount: z.number().int().min(1).max(20),
  sidebarPopularCount: z.number().int().min(1).max(20),
});

export type SidebarFormInput = z.infer<typeof sidebarFormSchema>;
```

- [ ] **Step 2: `commands.ts` の `updateSidebarSettings` を確認**

`sidebarWidgets` は `Json` カラムなので `data.sidebarWidgets` をそのまま渡す。`SidebarSettingsInput` 型が新スキーマの `SidebarSettings` を参照していることを確認。変更不要のはず。

- [ ] **Step 3: `other.ts` の `updateSidebarSettings` アクションの `afterSuccess` を更新**

`SIDEBAR_DATA` キャッシュも無効化:

```typescript
afterSuccess: () => {
  updateTag(CACHE_TAGS.SIDEBAR_SETTINGS);
  updateTag(CACHE_TAGS.SIDEBAR_DATA);
},
```

- [ ] **Step 4: 型チェック**

Run: `bun run type-check`
Expected: `SidebarSection.tsx` でエラー（旧 `SidebarWidgets` 型を参照）— Task 5 で修正

- [ ] **Step 5: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/_shared/actions/settings/schemas/form-schemas-privacy-appearance.ts' 'src/app/(admin)/admin/(dashboard)/_shared/actions/settings/other.ts' 'src/shared/domain/settings/commands.ts'
git commit -m "feat(sidebar): update admin action schemas for ordered widget array"
```

---

### Task 3: サイドバー設定クエリ（public）

**Files:**

- Create: `src/shared/domain/settings/queries/sidebar.ts`

- [ ] **Step 1: `getSidebarSettings` を実装**

```typescript
// src/shared/domain/settings/queries/sidebar.ts
import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import {
  safeFetch,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import {
  parseSidebarWidgets,
  DEFAULT_SIDEBAR_WIDGETS,
  type SidebarWidget,
} from "@/shared/lib/validations/sidebar";

export interface PublicSidebarSettings {
  enabled: boolean;
  widgets: SidebarWidget[];
  recentCount: number;
  popularCount: number;
}

const DEFAULTS: PublicSidebarSettings = {
  enabled: true,
  widgets: DEFAULT_SIDEBAR_WIDGETS,
  recentCount: 5,
  popularCount: 5,
};

export async function getSidebarSettings(): Promise<PublicSidebarSettings> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.SIDEBAR_SETTINGS);

  const result = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: "singleton" },
        select: {
          sidebarEnabled: true,
          sidebarWidgets: true,
          sidebarRecentCount: true,
          sidebarPopularCount: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getSidebarSettings",
  });

  if (!result) return DEFAULTS;

  return {
    enabled: result.sidebarEnabled,
    widgets: parseSidebarWidgets(result.sidebarWidgets),
    recentCount: result.sidebarRecentCount,
    popularCount: result.sidebarPopularCount,
  };
}
```

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: PASS（新ファイルのみ）

- [ ] **Step 3: コミット**

```bash
git add src/shared/domain/settings/queries/sidebar.ts
git commit -m "feat(sidebar): add getSidebarSettings public query"
```

---

### Task 4: サイドバーデータクエリ（public）

**Files:**

- Create: `src/shared/domain/sidebar/queries.ts`

- [ ] **Step 1: `getSidebarData` を実装**

```typescript
// src/shared/domain/sidebar/queries.ts
import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { PostStatus } from "@generated/prisma/enums";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import {
  safeFetch,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { toPlainArray } from "@/shared/lib/serialize";
import type { SidebarWidget } from "@/shared/lib/validations/sidebar";
import { getPermalinkSettings } from "@/shared/domain/settings/queries/display";
import { buildPostCanonicalPath } from "@/shared/domain/posts/routing";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SidebarPostItem {
  id: string;
  title: string;
  url: string;
  publishedAt: string | null;
}

export interface SidebarCategoryItem {
  id: string;
  name: string;
  slug: string;
  postCount: number;
}

export interface SidebarTagItem {
  id: string;
  name: string;
  slug: string;
}

export interface SidebarData {
  recentPosts: SidebarPostItem[];
  popularPosts: SidebarPostItem[];
  categories: SidebarCategoryItem[];
  tags: SidebarTagItem[];
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export async function getSidebarData(
  widgets: SidebarWidget[],
  recentCount: number,
  popularCount: number,
): Promise<SidebarData> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.SIDEBAR_DATA);

  const enabledTypes = new Set(
    widgets.filter((w) => w.enabled).map((w) => w.type),
  );

  const needRecent = enabledTypes.has("recent");
  const needPopular = enabledTypes.has("popular");
  const needCategories = enabledTypes.has("categories");
  const needTags = enabledTypes.has("tags");

  const publishedWhere = { status: PostStatus.PUBLISHED };

  const [recentRaw, popularRaw, categoriesRaw, tagsRaw, permalinkSettings] =
    await Promise.all([
      needRecent
        ? safeFetch({
            fetch: () =>
              prisma.post.findMany({
                where: publishedWhere,
                select: {
                  id: true,
                  slug: true,
                  title: true,
                  publishedAt: true,
                  category: { select: { slug: true } },
                },
                orderBy: { publishedAt: "desc" },
                take: recentCount,
              }),
            fallback: [],
            category: ErrorCategory.DATABASE,
            severity: ErrorSeverity.LOW,
            operationName: "getSidebarRecentPosts",
          })
        : Promise.resolve([]),

      needPopular
        ? safeFetch({
            fetch: () =>
              prisma.post.findMany({
                where: publishedWhere,
                select: {
                  id: true,
                  slug: true,
                  title: true,
                  publishedAt: true,
                  category: { select: { slug: true } },
                },
                orderBy: { viewCount: "desc" },
                take: popularCount,
              }),
            fallback: [],
            category: ErrorCategory.DATABASE,
            severity: ErrorSeverity.LOW,
            operationName: "getSidebarPopularPosts",
          })
        : Promise.resolve([]),

      needCategories
        ? safeFetch({
            fetch: () =>
              prisma.postCategory.findMany({
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  _count: {
                    select: {
                      posts: { where: publishedWhere },
                    },
                  },
                },
                orderBy: { name: "asc" },
              }),
            fallback: [],
            category: ErrorCategory.DATABASE,
            severity: ErrorSeverity.LOW,
            operationName: "getSidebarCategories",
          })
        : Promise.resolve([]),

      needTags
        ? safeFetch({
            fetch: () =>
              prisma.postTag.findMany({
                where: { posts: { some: { post: publishedWhere } } },
                select: { id: true, name: true, slug: true },
                orderBy: { name: "asc" },
              }),
            fallback: [],
            category: ErrorCategory.DATABASE,
            severity: ErrorSeverity.LOW,
            operationName: "getSidebarTags",
          })
        : Promise.resolve([]),

      needRecent || needPopular
        ? getPermalinkSettings()
        : Promise.resolve(null),
    ]);

  // Attach URLs to posts
  const mapPost = (p: {
    id: string;
    slug: string;
    title: string;
    publishedAt: Date | null;
    category: { slug: string } | null;
  }): SidebarPostItem => ({
    id: p.id,
    title: p.title,
    url: buildPostCanonicalPath(p, permalinkSettings ?? undefined),
    publishedAt: p.publishedAt?.toISOString() ?? null,
  });

  const mapCategory = (c: {
    id: string;
    name: string;
    slug: string;
    _count: { posts: number };
  }): SidebarCategoryItem => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    postCount: c._count.posts,
  });

  return {
    recentPosts: toPlainArray(recentRaw.map(mapPost)),
    popularPosts: toPlainArray(popularRaw.map(mapPost)),
    categories: toPlainArray(categoriesRaw.map(mapCategory)),
    tags: toPlainArray(tagsRaw),
  };
}
```

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add src/shared/domain/sidebar/queries.ts
git commit -m "feat(sidebar): add getSidebarData public query with conditional fetching"
```

---

### Task 5: 管理画面 SidebarSection 書き換え

**Files:**

- Rewrite: `src/app/(admin)/admin/(dashboard)/settings/_components/sections/SidebarSection.tsx`

- [ ] **Step 1: `SidebarSection.tsx` を全面書き換え**

dnd-kit ソータブルリスト + カスタムウィジェット追加ダイアログ。組み込みウィジェットは削除不可、並び替え + enabled toggle。カスタムは編集・削除可。

このタスクは実装量が大きいため、実装エージェントは以下の参照ファイルを読んでパターンに従うこと:

- 既存 dnd-kit パターン: `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/_components/SectionSidebarItem.tsx`
- Switch + FormField パターン: 旧 `SidebarSection.tsx`（同ファイル）
- ソータブルパターン: `.claude/rules/frontend/admin-ui-patterns.md` §ソータブルリスト標準パターン

主な UI 構成:

1. `sidebarEnabled` Switch（トップ、全体 ON/OFF）
2. ウィジェットリスト: DndContext + SortableContext
   - 各行: DragHandle + ウィジェット名（組み込みは固定ラベル、カスタムは `title`）+ Switch (enabled) + ActionDropdown（カスタムのみ: 編集/削除）
3. 「+ カスタムウィジェット追加」ボタン → Dialog（title, description, linkUrl, linkLabel フォーム）
4. `sidebarRecentCount` / `sidebarPopularCount` — `recent` / `popular` が enabled のとき表示
5. 保存ボタン

フォーム状態は `useState` で `SidebarWidget[]` を管理（`useFormAction` は dnd-kit 操作と相性が悪い例外パターン — `admin-ui-patterns.md` 参照）。保存時に `updateSidebarSettings` を直接呼ぶ。

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/settings/_components/sections/SidebarSection.tsx'
git commit -m "feat(sidebar): rewrite SidebarSection with dnd-kit sortable and custom widgets"
```

---

### Task 6: サイドバーウィジェットコンポーネント群

**Files:**

- Create: `src/app/(public)/_shared/components/sidebar/sidebar-search.tsx`
- Create: `src/app/(public)/_shared/components/sidebar/sidebar-recent-posts.tsx`
- Create: `src/app/(public)/_shared/components/sidebar/sidebar-popular-posts.tsx`
- Create: `src/app/(public)/_shared/components/sidebar/sidebar-categories.tsx`
- Create: `src/app/(public)/_shared/components/sidebar/sidebar-tags.tsx`
- Create: `src/app/(public)/_shared/components/sidebar/sidebar-custom.tsx`

- [ ] **Step 1: `sidebar-search.tsx`（CC — SearchBar 流用）**

```tsx
"use client";

import type { ReactElement } from "react";
import { SearchBar } from "@/public/components/ui/search-bar";

export function SidebarSearch(): ReactElement {
  return (
    <div>
      <h3 className="mb-4 text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
        Search
      </h3>
      <SearchBar placeholder="記事を検索..." />
    </div>
  );
}
```

- [ ] **Step 2: `sidebar-recent-posts.tsx`（SC）**

```tsx
import type { ReactElement } from "react";
import Link from "next/link";
import { formatSerializedDate } from "@/shared/lib/serialize";
import type { SidebarPostItem } from "@/shared/domain/sidebar/queries";

interface SidebarRecentPostsProps {
  posts: readonly SidebarPostItem[];
}

export function SidebarRecentPosts({
  posts,
}: SidebarRecentPostsProps): ReactElement {
  return (
    <div>
      <h3 className="mb-4 text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
        Recent
      </h3>
      <ul className="space-y-4">
        {posts.map((post) => (
          <li key={post.id}>
            <Link
              href={post.url}
              className="group block text-sm transition-colors hover:text-foreground"
            >
              <span className="line-clamp-2">{post.title}</span>
              <time className="mt-1 block text-xs text-muted-foreground">
                {formatSerializedDate(post.publishedAt)}
              </time>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: `sidebar-popular-posts.tsx`（SC）** — `sidebar-recent-posts.tsx` と同じ構造、見出しを `Popular` に変更

```tsx
import type { ReactElement } from "react";
import Link from "next/link";
import { formatSerializedDate } from "@/shared/lib/serialize";
import type { SidebarPostItem } from "@/shared/domain/sidebar/queries";

interface SidebarPopularPostsProps {
  posts: readonly SidebarPostItem[];
}

export function SidebarPopularPosts({
  posts,
}: SidebarPopularPostsProps): ReactElement {
  return (
    <div>
      <h3 className="mb-4 text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
        Popular
      </h3>
      <ul className="space-y-4">
        {posts.map((post) => (
          <li key={post.id}>
            <Link
              href={post.url}
              className="group block text-sm transition-colors hover:text-foreground"
            >
              <span className="line-clamp-2">{post.title}</span>
              <time className="mt-1 block text-xs text-muted-foreground">
                {formatSerializedDate(post.publishedAt)}
              </time>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: `sidebar-categories.tsx`（SC）**

```tsx
import type { ReactElement } from "react";
import Link from "next/link";
import type { SidebarCategoryItem } from "@/shared/domain/sidebar/queries";

interface SidebarCategoriesProps {
  categories: readonly SidebarCategoryItem[];
}

export function SidebarCategories({
  categories,
}: SidebarCategoriesProps): ReactElement {
  return (
    <div>
      <h3 className="mb-4 text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
        Categories
      </h3>
      <ul className="space-y-3">
        {categories.map((cat) => (
          <li key={cat.id}>
            <Link
              href={`/journal?tab=posts&category=${cat.slug}`}
              className="flex items-center justify-between text-sm transition-colors hover:text-foreground"
            >
              <span>{cat.name}</span>
              <span className="text-xs text-muted-foreground">
                {cat.postCount}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: `sidebar-tags.tsx`（SC）**

```tsx
import type { ReactElement } from "react";
import Link from "next/link";
import type { SidebarTagItem } from "@/shared/domain/sidebar/queries";

interface SidebarTagsProps {
  tags: readonly SidebarTagItem[];
}

export function SidebarTags({ tags }: SidebarTagsProps): ReactElement {
  return (
    <div>
      <h3 className="mb-4 text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
        Tags
      </h3>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <Link
            key={tag.id}
            href={`/journal?tag=${tag.slug}`}
            className="border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {tag.name}
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: `sidebar-custom.tsx`（SC）**

```tsx
import type { ReactElement } from "react";
import Link from "next/link";
import type { CustomWidget } from "@/shared/lib/validations/sidebar";

interface SidebarCustomProps {
  widget: CustomWidget;
}

export function SidebarCustom({ widget }: SidebarCustomProps): ReactElement {
  return (
    <div>
      <h3 className="mb-4 text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
        {widget.title}
      </h3>
      {widget.description ? (
        <p className="text-sm text-muted-foreground">{widget.description}</p>
      ) : null}
      {widget.linkUrl ? (
        <Link
          href={widget.linkUrl}
          className="mt-3 inline-block border border-foreground px-4 py-2 text-xs uppercase tracking-[0.18em] transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          {widget.linkLabel ?? widget.linkUrl}
        </Link>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 7: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 8: コミット**

```bash
git add 'src/app/(public)/_shared/components/sidebar/'
git commit -m "feat(sidebar): add 6 widget components for blog sidebar"
```

---

### Task 7: BlogSidebar + BlogLayout コンポーネント

**Files:**

- Create: `src/app/(public)/_shared/components/layouts/blog-sidebar.tsx`
- Create: `src/app/(public)/_shared/components/layouts/blog-layout.tsx`

- [ ] **Step 1: `blog-sidebar.tsx`（SC — サイドバー本体）**

```tsx
import type { ReactElement } from "react";
import { SidebarSearch } from "@/public/components/sidebar/sidebar-search";
import { SidebarRecentPosts } from "@/public/components/sidebar/sidebar-recent-posts";
import { SidebarPopularPosts } from "@/public/components/sidebar/sidebar-popular-posts";
import { SidebarCategories } from "@/public/components/sidebar/sidebar-categories";
import { SidebarTags } from "@/public/components/sidebar/sidebar-tags";
import { SidebarCustom } from "@/public/components/sidebar/sidebar-custom";
import type { SidebarData } from "@/shared/domain/sidebar/queries";
import type {
  SidebarWidget,
  CustomWidget,
} from "@/shared/lib/validations/sidebar";

interface BlogSidebarProps {
  widgets: SidebarWidget[];
  data: SidebarData;
}

export function BlogSidebar({ widgets, data }: BlogSidebarProps): ReactElement {
  const enabledWidgets = widgets.filter((w) => w.enabled);

  return (
    <aside className="hidden space-y-8 lg:block" aria-label="ブログサイドバー">
      <div className="sticky top-[calc(var(--header-height)+2rem)]">
        <div className="space-y-8">
          {enabledWidgets.map((widget, index) => {
            const key =
              widget.type === "custom"
                ? (widget as CustomWidget).id
                : widget.type;

            switch (widget.type) {
              case "search":
                return <SidebarSearch key={key} />;
              case "recent":
                return (
                  <SidebarRecentPosts key={key} posts={data.recentPosts} />
                );
              case "popular":
                return (
                  <SidebarPopularPosts key={key} posts={data.popularPosts} />
                );
              case "categories":
                return (
                  <SidebarCategories key={key} categories={data.categories} />
                );
              case "tags":
                return <SidebarTags key={key} tags={data.tags} />;
              case "custom":
                return (
                  <SidebarCustom key={key} widget={widget as CustomWidget} />
                );
              default:
                return null;
            }
          })}
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: `blog-layout.tsx`（SC — 2カラム/1カラム切替）**

```tsx
import type { ReactElement, ReactNode } from "react";
import { getSidebarSettings } from "@/shared/domain/settings/queries/sidebar";
import { getSidebarData } from "@/shared/domain/sidebar/queries";
import { BlogSidebar } from "@/public/components/layouts/blog-sidebar";

interface BlogLayoutProps {
  children: ReactNode;
  /** Page.showSidebar override: null=use global, true/false=explicit */
  showSidebar?: boolean | null;
}

export async function BlogLayout({
  children,
  showSidebar,
}: BlogLayoutProps): Promise<ReactElement> {
  const settings = await getSidebarSettings();

  // Resolve: page-level override > global setting
  const sidebarEnabled = showSidebar != null ? showSidebar : settings.enabled;

  if (!sidebarEnabled) {
    return <>{children}</>;
  }

  const data = await getSidebarData(
    settings.widgets,
    settings.recentCount,
    settings.popularCount,
  );

  return (
    <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-12">
      <div>{children}</div>
      <BlogSidebar widgets={settings.widgets} data={data} />
    </div>
  );
}
```

- [ ] **Step 3: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add 'src/app/(public)/_shared/components/layouts/blog-sidebar.tsx' 'src/app/(public)/_shared/components/layouts/blog-layout.tsx'
git commit -m "feat(sidebar): add BlogLayout and BlogSidebar components"
```

---

### Task 8: /journal ページに BlogLayout 統合

**Files:**

- Modify: `src/app/(public)/journal/page.tsx`

- [ ] **Step 1: `page.tsx` に `BlogLayout` をラップ**

`<section>` の中身を `BlogLayout` で囲む。`Container` の中に `BlogLayout` を配置:

変更点:

1. `import { BlogLayout } from "@/public/components/layouts/blog-layout"` を追加
2. `Page.showSidebar` を取得するため `getPageShowSidebar("journal")` を呼ぶ（または sections 取得時に page データからも取得）
3. `<Container>` 内のコンテンツを `<BlogLayout>` でラップ

実装エージェントは `journal/page.tsx` を Read して現状を確認し、`<Container>` 内の `<Suspense>` + `<JournalContent>` + `<Pagination>` 部分を `<BlogLayout>` の `children` にする。

`showSidebar` prop は既存の `getPageSectionsWithFallback("journal")` のレスポンスから取得するか、別途 Page テーブルをクエリする。最もシンプルなのは `BlogLayout` 内部で Page を参照する方法だが、spec の設計では `BlogLayout` は pageSlug を受け取らないので、呼び出し元から `showSidebar` prop を渡す。

journal ページ固有の対応: `getSidebarSettings` で返る `Page.showSidebar` は `BlogLayout` に渡す。Page テーブルから `showSidebar` を取得するクエリ関数を作成する（or 既存の sections クエリ結果に含めるか）。

最もクリーンな方法: `src/shared/domain/pages/queries.ts` に `getPageShowSidebar(slug)` を追加:

```typescript
export async function getPageShowSidebar(
  slug: string,
): Promise<boolean | null> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.PAGES);

  const result = await safeFetch({
    fetch: () =>
      prisma.page.findFirst({
        where: { slug, deletedAt: null },
        select: { showSidebar: true },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPageShowSidebar",
  });

  return result?.showSidebar ?? null;
}
```

- [ ] **Step 2: 型チェック + validate**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(public)/journal/page.tsx' src/shared/domain/pages/queries.ts
git commit -m "feat(sidebar): integrate BlogLayout into /journal page"
```

---

### Task 9: /posts 詳細ページに BlogLayout 統合

**Files:**

- Modify: `src/app/(public)/posts/_components/post-detail-page-content.tsx`

- [ ] **Step 1: `PostDetailPageContent` に `BlogLayout` を統合**

変更点:

1. `import { BlogLayout } from "@/public/components/layouts/blog-layout"` を追加
2. `<article>` セクション内の `<Container>` の中身を `<BlogLayout>` でラップ
3. `contentWidth` による幅制御（`resolveWidthStyles`）はサイドバーが有効な場合は無効化するか、メインカラム内に適用
4. サイドバーは `Container` の中に入る（2カラムグリッド）

実装エージェントは `post-detail-page-content.tsx` を Read し、`<Container>` 内の `<div className={contentClassName}>` 部分を `<BlogLayout>` の children として渡す。記事詳細は `showSidebar` prop なし（グローバル設定のみ）。

- [ ] **Step 2: 型チェック + validate**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(public)/posts/_components/post-detail-page-content.tsx'
git commit -m "feat(sidebar): integrate BlogLayout into post detail page"
```

---

### Task 10: /news 詳細ページに BlogLayout 統合

**Files:**

- Modify: `src/app/(public)/news/_components/news-detail-page-content.tsx`

- [ ] **Step 1: `NewsDetailPageContent` に `BlogLayout` を統合**

`post-detail-page-content.tsx` と同じパターン。`<Container>` 内に `<BlogLayout>` をラップ。

- [ ] **Step 2: 型チェック + validate**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(public)/news/_components/news-detail-page-content.tsx'
git commit -m "feat(sidebar): integrate BlogLayout into news detail page"
```

---

### Task 11: キャッシュ無効化の追加

**Files:**

- Modify: Post/News の Server Actions（作成・更新・削除）

- [ ] **Step 1: Post アクションに `SIDEBAR_DATA` 無効化を追加**

Post の作成・更新・削除・公開アクションの `afterSuccess` に `updateTag(CACHE_TAGS.SIDEBAR_DATA)` を追加。

実装エージェントは `src/app/(admin)/admin/(dashboard)/_shared/actions/` の Post 関連アクションを Grep で検索し、`updateTag(CACHE_TAGS.POSTS)` の直後に `updateTag(CACHE_TAGS.SIDEBAR_DATA)` を追加する。

- [ ] **Step 2: News アクションにも同様に追加**

News の作成・更新・削除・公開アクションの `afterSuccess` に `updateTag(CACHE_TAGS.SIDEBAR_DATA)` を追加。

- [ ] **Step 3: validate**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add -A
git commit -m "feat(sidebar): add SIDEBAR_DATA cache invalidation to post/news actions"
```

---

### Task 12: validate + build 検証

- [ ] **Step 1: 全体 validate**

Run: `bun run validate`
Expected: PASS

- [ ] **Step 2: ビルド**

Run: `bun run build:skip-env`
Expected: PASS（env 未設定ローカル環境でのビルド確認）

- [ ] **Step 3: 問題があれば修正してコミット**
