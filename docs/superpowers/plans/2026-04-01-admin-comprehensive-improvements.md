# Admin Comprehensive Improvements Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理画面の全18改善項目を公式ベストプラクティスに準拠してクリーンに実装する

**Architecture:** 3フェーズ構成 — (1) 共有インフラ新設 (2) ファイル分割・コード品質 (3) 機能追加。各タスクは独立してコミット可能。TDD は新規 Server Action・ユーティリティに適用。UI コンポーネント分割はリファクタリングのため既存テスト + type-check で検証。

**Tech Stack:** Next.js 16, React 19 (Compiler 1.0), TypeScript 6.0, nuqs 2.8, Prisma 7, Tailwind CSS 4, Bun Test

---

## Phase 1: Infrastructure + Quick Wins

### Task 1: SortableColumnHeader 共有コンポーネント作成

全テーブルのカラムソートに使う共有コンポーネント。nuqs の sortBy/sortOrder と連携。

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/table/SortableColumnHeader.tsx`

- [ ] **Step 1: SortableColumnHeader を作成**

```tsx
"use client";

import type { ReactNode } from "react";
import {
  IconArrowUp,
  IconArrowDown,
  IconArrowsSort,
} from "@tabler/icons-react";
import { TableHead } from "@/admin/components/ui";

type SortableColumnHeaderProps<T extends string> = {
  column: T;
  currentSortBy: T | null;
  currentSortOrder: "asc" | "desc";
  onSort: (column: T) => void;
  children: ReactNode;
  className?: string;
};

export function SortableColumnHeader<T extends string>({
  column,
  currentSortBy,
  currentSortOrder,
  onSort,
  children,
  className,
}: SortableColumnHeaderProps<T>) {
  const isActive = currentSortBy === column;

  return (
    <TableHead className={className}>
      <button
        type="button"
        className="flex items-center gap-1 hover:text-foreground transition-colors"
        onClick={() => onSort(column)}
      >
        {children}
        {isActive ? (
          currentSortOrder === "asc" ? (
            <IconArrowUp className="h-3.5 w-3.5" />
          ) : (
            <IconArrowDown className="h-3.5 w-3.5" />
          )
        ) : (
          <IconArrowsSort className="h-3.5 w-3.5 text-muted-foreground/50" />
        )}
      </button>
    </TableHead>
  );
}
```

- [ ] **Step 2: barrel に追加**

`src/app/(admin)/admin/(dashboard)/_shared/components/table/index.ts` に `export { SortableColumnHeader } from "./SortableColumnHeader";` を追加。

- [ ] **Step 3: type-check**

Run: `bun run type-check`

- [ ] **Step 4: Commit**

```bash
git add 'src/app/(admin)/admin/(dashboard)/_shared/components/table/SortableColumnHeader.tsx' 'src/app/(admin)/admin/(dashboard)/_shared/components/table/index.ts'
git commit -m "feat(admin): add SortableColumnHeader shared component for table column sorting"
```

---

### Task 2: DetailLoadingSkeleton コンポーネント作成

`[id]`/`[slug]` サブルートの `loading.tsx` 用スケルトン。既存の `ResourceLoading` はリスト用のためデtail 用を新設。

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/DetailLoading.tsx`

- [ ] **Step 1: DetailLoading を作成**

```tsx
export default function DetailLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded bg-muted" />
        <div className="h-4 w-24 rounded bg-muted" />
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-64 rounded bg-muted" />
          <div className="h-4 w-48 rounded bg-muted" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-20 rounded bg-muted" />
          <div className="h-10 w-20 rounded bg-muted" />
        </div>
      </div>
      <div className="rounded-lg border bg-card p-6">
        <div className="space-y-4">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex gap-4">
              <div className="h-5 w-24 rounded bg-muted" />
              <div className="h-5 flex-1 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: type-check**

Run: `bun run type-check`

- [ ] **Step 3: Commit**

```bash
git add 'src/app/(admin)/admin/(dashboard)/_shared/components/DetailLoading.tsx'
git commit -m "feat(admin): add DetailLoading skeleton for detail/edit sub-routes"
```

---

### Task 3: 全 [id]/[slug] サブルートに error.tsx + loading.tsx 追加

既存パターン: `error.tsx` は `ResourceError` の re-export、`loading.tsx` は `ResourceLoading` の re-export。
サブルート用は `DetailLoading` を使う。

**Files (create all):**

- `src/app/(admin)/admin/(dashboard)/posts/[id]/error.tsx`
- `src/app/(admin)/admin/(dashboard)/posts/[id]/loading.tsx`
- `src/app/(admin)/admin/(dashboard)/reservations/[id]/error.tsx`
- `src/app/(admin)/admin/(dashboard)/reservations/[id]/loading.tsx`
- `src/app/(admin)/admin/(dashboard)/staff/[id]/error.tsx`
- `src/app/(admin)/admin/(dashboard)/staff/[id]/loading.tsx`
- `src/app/(admin)/admin/(dashboard)/spaces/[id]/error.tsx`
- `src/app/(admin)/admin/(dashboard)/spaces/[id]/loading.tsx`
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/error.tsx`
- `src/app/(admin)/admin/(dashboard)/pages/[slug]/loading.tsx`
- `src/app/(admin)/admin/(dashboard)/comments/[id]/error.tsx`
- `src/app/(admin)/admin/(dashboard)/comments/[id]/loading.tsx`
- `src/app/(admin)/admin/(dashboard)/customers/[id]/error.tsx`
- `src/app/(admin)/admin/(dashboard)/customers/[id]/loading.tsx`
- `src/app/(admin)/admin/(dashboard)/inquiries/[id]/error.tsx`
- `src/app/(admin)/admin/(dashboard)/inquiries/[id]/loading.tsx`
- `src/app/(admin)/admin/(dashboard)/news/[id]/error.tsx`
- `src/app/(admin)/admin/(dashboard)/news/[id]/loading.tsx`
- `src/app/(admin)/admin/(dashboard)/reviews/[id]/error.tsx`
- `src/app/(admin)/admin/(dashboard)/reviews/[id]/loading.tsx`

Also check for `new/` sub-routes that need the same treatment:

- `src/app/(admin)/admin/(dashboard)/posts/new/error.tsx`
- `src/app/(admin)/admin/(dashboard)/posts/new/loading.tsx`
- `src/app/(admin)/admin/(dashboard)/reservations/new/error.tsx`
- `src/app/(admin)/admin/(dashboard)/reservations/new/loading.tsx`
- `src/app/(admin)/admin/(dashboard)/staff/new/error.tsx`
- `src/app/(admin)/admin/(dashboard)/staff/new/loading.tsx`
- `src/app/(admin)/admin/(dashboard)/spaces/new/error.tsx`
- `src/app/(admin)/admin/(dashboard)/spaces/new/loading.tsx`
- `src/app/(admin)/admin/(dashboard)/news/new/error.tsx`
- `src/app/(admin)/admin/(dashboard)/news/new/loading.tsx`

Note: Before creating, verify which `[id]`/`[slug]`/`new` sub-routes actually exist with `ls`. Only create for existing routes.

- [ ] **Step 1: Verify existing sub-routes**

Run: `find src/app/\(admin\)/admin/\(dashboard\) -name "page.tsx" -path "*/\[*\]/*" -o -name "page.tsx" -path "*/new/*" | sort`

Only create error/loading for sub-routes that have a `page.tsx`.

- [ ] **Step 2: Create all error.tsx files**

Each `error.tsx` content (identical):

```tsx
"use client";
export { default } from "../../_shared/components/ResourceError";
```

Adjust the relative path (`../../` vs `../../../`) based on nesting depth. For `[id]/error.tsx` inside a section like `posts/[id]/error.tsx`, the path to `_shared` is `../../_shared/components/ResourceError`. But wait — `_shared` is at `(dashboard)/_shared/`, so from `posts/[id]/error.tsx` it's `../../_shared/components/ResourceError`.

**IMPORTANT**: Each file must use the correct relative import depth. Verify by counting directory levels from the file to `(dashboard)/_shared/`.

- [ ] **Step 3: Create all loading.tsx files**

Each `loading.tsx` content (identical):

```tsx
export { default } from "../../_shared/components/DetailLoading";
```

Same relative path consideration as error.tsx.

- [ ] **Step 4: type-check**

Run: `bun run type-check`

- [ ] **Step 5: Commit**

```bash
git add -A 'src/app/(admin)/admin/(dashboard)/*/[*]/error.tsx' 'src/app/(admin)/admin/(dashboard)/*/[*]/loading.tsx' 'src/app/(admin)/admin/(dashboard)/*/new/error.tsx' 'src/app/(admin)/admin/(dashboard)/*/new/loading.tsx'
git commit -m "feat(admin): add error.tsx + loading.tsx to all detail/edit/new sub-routes"
```

---

### Task 4: InvitationTable に EmptyState 追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/staff/_components/InvitationTable.tsx`

- [ ] **Step 1: Read current file**

Read `src/app/(admin)/admin/(dashboard)/staff/_components/InvitationTable.tsx` to get exact current content.

- [ ] **Step 2: Add EmptyState when invitations array is empty**

After the table header row, add a conditional empty state inside `<TableBody>`:

```tsx
import { EmptyState } from "@/admin/components/EmptyState";

// Inside TableBody, before the map:
{invitations.length === 0 ? (
  <TableRow>
    <TableCell colSpan={6} className="h-24 text-center">
      <p className="text-muted-foreground">招待中のスタッフはいません</p>
    </TableCell>
  </TableRow>
) : (
  invitations.map((invitation) => (
    // ... existing rows
  ))
)}
```

Note: Since InvitationTable is a Server Component and renders inside a table, use inline empty message rather than the `EmptyState` component (which renders a card, not suitable inside `<table>`).

- [ ] **Step 3: type-check**

Run: `bun run type-check`

- [ ] **Step 4: Commit**

```bash
git add 'src/app/(admin)/admin/(dashboard)/staff/_components/InvitationTable.tsx'
git commit -m "fix(admin): add empty state to InvitationTable when no invitations"
```

---

## Phase 2: File Splits (Code Quality)

### Task 5: auto-section-form.tsx 分割 (1016行 → ~4ファイル)

**Current file:** `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form.tsx`

**Split plan:**

- `zod-introspection.ts` (lines 74-263): Pure Zod helpers — `getZodObjectShape`, `getZodDef`, `hasShape`, `extractFieldMetaDeep`, `getSelectOptions`, `getArrayItemShape`, `extractSchemaFields`
- `auto-fields/AutoSelectField.tsx` (lines 647-695): Radix Select field
- `auto-fields/AutoArrayField.tsx` (lines 700-930): `useFieldArray` repeater + `ArrayItemField` + `ArrayItemSelectField`
- `auto-fields/AutoGroupField.tsx` (lines 932-1016): Collapsible group
- `auto-section-form.tsx` (~270 lines): Orchestrator with `AutoField`, `AutoFieldByType`, `AutoSectionForm`

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/zod-introspection.ts`
- Create: `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-fields/AutoSelectField.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-fields/AutoArrayField.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-fields/AutoGroupField.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form.tsx`

- [ ] **Step 1: Read full auto-section-form.tsx**

Read the complete file to identify exact line boundaries and imports.

- [ ] **Step 2: Extract zod-introspection.ts**

Move all Zod introspection helpers (lines 74-263) to `zod-introspection.ts`. Export all functions used by `auto-section-form.tsx`:

- `extractSchemaFields` (main entry point)
- `getZodObjectShape` (used by AutoGroupField)
- `getSelectOptions` (used by AutoSelectField, ArrayItemSelectField)
- `getArrayItemShape` (used by AutoArrayField)
- Types: `FieldInfo`, `FieldType` (re-export from sections/types if needed)

- [ ] **Step 3: Extract AutoSelectField.tsx**

Move `AutoSelectField` to its own file. Import `getSelectOptions` from `../zod-introspection`.

- [ ] **Step 4: Extract AutoArrayField.tsx**

Move `AutoArrayField`, `ArrayItemField`, `ArrayItemSelectField` to one file. These are tightly coupled via `useFieldArray`. Import from `../zod-introspection` and `./AutoSelectField`.

- [ ] **Step 5: Extract AutoGroupField.tsx**

Move `AutoGroupField` to its own file. It recursively calls `AutoFieldByType` — pass it as a render prop or import from parent. Since `AutoFieldByType` is the dispatcher in the parent, use a render prop pattern:

```tsx
// AutoGroupField.tsx
type AutoGroupFieldProps = {
  // ... existing props
  renderField: (fieldInfo: FieldInfo, namePrefix: string) => ReactNode;
};
```

- [ ] **Step 6: Update auto-section-form.tsx**

Remove extracted code. Import from new files. Wire `AutoFieldByType` to pass `renderField` to `AutoGroupField`.

- [ ] **Step 7: type-check + validate**

Run: `bun run validate`

- [ ] **Step 8: Commit**

```bash
git commit -m "refactor(admin): split auto-section-form.tsx into focused modules (1016→~270 lines)"
```

---

### Task 6: TermsInlineEditor.tsx 分割 (1010行 → ~4ファイル)

**Current file:** `src/app/(admin)/admin/(dashboard)/terms/_components/TermsInlineEditor.tsx`

**Split plan:**

- `terms-helpers.ts` (lines 125-168): API helpers + display helpers (`fetchTermsDefaultsForType`, `fetchTermsVersionById`, `versionLabel`, `statusBadgeVariant`, `statusLabel`)
- `TermsVersionTab.tsx`: Version management TabsContent (lines 765-875) — version list, switch, create, publish, archive, delete version
- `TermsSettingsTab.tsx`: Settings TabsContent (lines 878-983) — title/slug/type fields + template picker
- `TermsInlineEditor.tsx` (~200 lines): Orchestrator with state, form, handlers, layout

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/terms/_components/terms-helpers.ts`
- Create: `src/app/(admin)/admin/(dashboard)/terms/_components/TermsVersionTab.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/terms/_components/TermsSettingsTab.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/terms/_components/TermsInlineEditor.tsx`

- [ ] **Step 1: Read full TermsInlineEditor.tsx**

- [ ] **Step 2: Extract terms-helpers.ts**

Move API fetch functions and display helpers.

- [ ] **Step 3: Extract TermsVersionTab.tsx**

Extract the version management UI as a Client Component. Props:

```tsx
type TermsVersionTabProps = {
  versions: TermsVersionData[];
  selectedVersionId: string | null;
  isLoadingVersion: boolean;
  isPending: boolean;
  onVersionSwitch: (versionId: string) => void;
  onCreateNewVersion: () => void;
  onPublishVersion: (versionId: string) => void;
  onArchiveVersion: (versionId: string) => void;
  onDeleteVersion: (versionId: string) => void;
};
```

- [ ] **Step 4: Extract TermsSettingsTab.tsx**

Extract settings form fields. Props include form control + mode + isPending.

- [ ] **Step 5: Update TermsInlineEditor.tsx**

Import and compose extracted components.

- [ ] **Step 6: type-check + validate**

Run: `bun run validate`

- [ ] **Step 7: Commit**

```bash
git commit -m "refactor(admin): split TermsInlineEditor.tsx into focused modules (1010→~200 lines)"
```

---

### Task 7: fetch-ogp.ts 分割 + executeAdminMutationResult 移行

**Current file:** `src/app/(admin)/admin/(dashboard)/_shared/actions/fetch-ogp.ts`

**Split plan:**

- `src/app/(admin)/admin/(dashboard)/_shared/lib/ssrf-guard.ts`: SSRF validation (`isPrivateOrReservedHost`, `isUrlSafe`)
- `src/app/(admin)/admin/(dashboard)/_shared/lib/ogp-parser.ts`: HTML meta tag parsing helpers
- `fetch-ogp.ts` (~50 lines): Server Action using `executeAdminMutationResult`

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/lib/ssrf-guard.ts`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/lib/ogp-parser.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/fetch-ogp.ts`

- [ ] **Step 1: Read full fetch-ogp.ts**

- [ ] **Step 2: Create ssrf-guard.ts**

Move `isPrivateOrReservedHost` and `isUrlSafe` with `import "server-only"`.

```tsx
import "server-only";

export function isPrivateOrReservedHost(hostname: string): boolean {
  // ... existing logic
}

export function isUrlSafe(urlString: string): boolean {
  // ... existing logic
}
```

- [ ] **Step 3: Create ogp-parser.ts**

Move HTML parsing helpers. No `server-only` needed (pure string functions).

```tsx
export function extractTitle(html: string): string | null {
  /* ... */
}
export function extractDescription(html: string): string | null {
  /* ... */
}
export function extractImage(html: string): string | null {
  /* ... */
}
export function extractSiteName(html: string): string | null {
  /* ... */
}
export function getFaviconUrl(baseUrl: string, html: string): string {
  /* ... */
}
export function resolveUrl(baseUrl: string, relativeUrl: string): string {
  /* ... */
}
```

- [ ] **Step 4: Rewrite fetch-ogp.ts with executeAdminMutationResult**

```tsx
"use server";

import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { isUrlSafe } from "@/admin/lib/ssrf-guard";
import {
  extractTitle,
  extractDescription,
  extractImage,
  extractSiteName,
  getFaviconUrl,
  resolveUrl,
} from "@/admin/lib/ogp-parser";

export type OgpData = {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  faviconUrl: string;
  siteName: string | null;
};

export async function fetchOgp(url: string): Promise<MutationResult<OgpData>> {
  if (!isUrlSafe(url)) {
    return { error: "無効なURLです" };
  }

  return executeAdminMutationResult({
    resource: "media",
    action: "read",
    execute: async () => {
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; BookmarkBot/1.0)" },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      const imageRaw = extractImage(html);

      return {
        url,
        title: extractTitle(html),
        description: extractDescription(html),
        imageUrl: imageRaw ? resolveUrl(url, imageRaw) : null,
        faviconUrl: getFaviconUrl(url, html),
        siteName: extractSiteName(html),
      };
    },
  });
}
```

- [ ] **Step 5: type-check + validate**

Run: `bun run validate`

- [ ] **Step 6: Commit**

```bash
git commit -m "refactor(admin): split fetch-ogp.ts, migrate to executeAdminMutationResult"
```

---

### Task 8: NavigationManager.tsx 分割 (677行 → ~3ファイル)

**Current file:** `src/app/(admin)/admin/(dashboard)/settings/site/_components/navigation/NavigationManager.tsx`

**Split plan:**

- `navigation-utils.ts`: Pure helpers (`computeOrderWithNesting`, `computeOrderFromFlat`, API fetchers)
- `useNavigationHandlers.ts`: Custom hook encapsulating all CRUD + DnD handlers for nav items + social links
- `NavigationManager.tsx` (~200 lines): State + JSX composition

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/settings/site/_components/navigation/navigation-utils.ts`
- Create: `src/app/(admin)/admin/(dashboard)/settings/site/_components/navigation/useNavigationHandlers.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/settings/site/_components/navigation/NavigationManager.tsx`

- [ ] **Step 1: Read full NavigationManager.tsx**
- [ ] **Step 2: Extract navigation-utils.ts** (pure functions + API helpers)
- [ ] **Step 3: Extract useNavigationHandlers.ts** (custom hook with all handler logic)
- [ ] **Step 4: Simplify NavigationManager.tsx** (state init + hook + JSX)
- [ ] **Step 5: type-check + validate**

Run: `bun run validate`

- [ ] **Step 6: Commit**

```bash
git commit -m "refactor(admin): split NavigationManager.tsx into utils + handlers hook (677→~200 lines)"
```

---

### Task 9: InstagramSection.tsx 分割 (619行 → ~3ファイル)

**Current file:** `src/app/(admin)/admin/(dashboard)/settings/_components/sections/InstagramSection.tsx`

**Split plan:**

- `instagram/ConnectionCard.tsx` (lines 107-364): OAuth + manual token UI
- `instagram/FeedSettingsCard.tsx` (lines 365-574): Feed display settings form
- `InstagramSection.tsx` (~50 lines): Orchestrator with disconnect dialog

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/settings/_components/sections/instagram/ConnectionCard.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/settings/_components/sections/instagram/FeedSettingsCard.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/settings/_components/sections/InstagramSection.tsx`

- [ ] **Step 1: Read full InstagramSection.tsx**
- [ ] **Step 2: Extract ConnectionCard.tsx**
- [ ] **Step 3: Extract FeedSettingsCard.tsx**
- [ ] **Step 4: Simplify InstagramSection.tsx**
- [ ] **Step 5: type-check + validate**

Run: `bun run validate`

- [ ] **Step 6: Commit**

```bash
git commit -m "refactor(admin): split InstagramSection.tsx into ConnectionCard + FeedSettingsCard (619→~50 lines)"
```

---

### Task 10: post/index.ts 分割 (475行 → queries + mutations + taxonomy)

**Current file:** `src/app/(admin)/admin/(dashboard)/_shared/actions/post/index.ts`

**Split plan (using /split-action-file pattern):**

- `mutations.ts`: `createPost`, `updatePost`, `deletePost`, `publishPost`, `unpublishPost`
- `backup.ts`: `createPostBackup`, `restorePostVersion`
- `taxonomy.ts`: `createPostCategory`, `updatePostCategory`, `deletePostCategory`, `updatePostCategoryOrder`, `createPostTag`, `updatePostTag`, `deletePostTag`
- `index.ts`: Re-export barrel (transparent to consumers)

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/actions/post/mutations.ts`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/actions/post/backup.ts`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/actions/post/taxonomy.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/post/index.ts` (barrel only)

- [ ] **Step 1: Read full post/index.ts**

Identify exact functions, imports, and shared private helpers (`purgePostCaches`, `purgePostArchive`, `invalidatePostCollectionCaches`, `invalidatePostCategoryCaches`, `invalidatePostTagCaches`).

- [ ] **Step 2: Create cache-helpers.ts for shared private helpers**

Create `src/app/(admin)/admin/(dashboard)/_shared/actions/post/cache-helpers.ts` with all `purge*` and `invalidate*` functions. Add `"use server"` directive.

- [ ] **Step 3: Create mutations.ts**

Move `createPost`, `updatePost`, `deletePost`, `publishPost`, `unpublishPost`. Import cache helpers from `./cache-helpers`.

- [ ] **Step 4: Create backup.ts**

Move `createPostBackup`, `restorePostVersion`.

- [ ] **Step 5: Create taxonomy.ts**

Move all category/tag functions.

- [ ] **Step 6: Convert index.ts to barrel**

```tsx
"use server";

export {
  createPost,
  updatePost,
  deletePost,
  publishPost,
  unpublishPost,
} from "./mutations";
export { createPostBackup, restorePostVersion } from "./backup";
export {
  createPostCategory,
  updatePostCategory,
  deletePostCategory,
  updatePostCategoryOrder,
  createPostTag,
  updatePostTag,
  deletePostTag,
} from "./taxonomy";
```

- [ ] **Step 7: type-check + validate**

Run: `bun run validate`

- [ ] **Step 8: Commit**

```bash
git commit -m "refactor(admin): split post actions into mutations/backup/taxonomy (475→barrel)"
```

---

## Phase 3: Feature Additions

### Task 11: 予約テーブルにソート + 日付範囲フィルター追加

**Background:** `getReservations` query already supports `sortBy: "startTime" | "createdAt"`, `sortOrder`, `startDate`, `endDate`. Only the nuqs parsers and page wiring are missing.

**Files:**

- Modify: `src/shared/lib/nuqs/parsers.ts` — add sort/date params to `adminReservationSearchParamsParsers`
- Modify: `src/app/(admin)/admin/(dashboard)/reservations/page.tsx` — pass sort/date to query
- Modify: `src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationFilters.tsx` — add date range + sort controls
- Create: `src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationSortableTable.tsx` — Client Component wrapper using `SortableColumnHeader`
- Modify: `src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationTable.tsx` — integrate sortable headers

- [ ] **Step 1: Read current parsers.ts reservation section**

Read `src/shared/lib/nuqs/parsers.ts` lines 370-395.

- [ ] **Step 2: Add sort + date params to reservation parsers**

```tsx
// Add to adminReservationSearchParamsParsers
export const adminReservationSearchParamsParsers = {
  search: parseAsQuery,
  status: parseAsString.withDefault(""),
  page: parseAsPage,
  perPage: parseAsPerPage,
  sortBy: parseAsStringLiteral(["startTime", "createdAt"] as const).withDefault(
    "startTime",
  ),
  sortOrder: parseAsSortOrder,
  dateFrom: parseAsString.withDefault(""),
  dateTo: parseAsString.withDefault(""),
};
```

Update the associated `createSearchParamsCache` and `loadAdminReservationSearchParams`.

- [ ] **Step 3: Read and update reservations/page.tsx**

Pass `sortBy`, `sortOrder`, `dateFrom` (as `startDate`), `dateTo` (as `endDate`) to `getReservations`:

```tsx
const { status, search, sortBy, sortOrder, dateFrom, dateTo, page, perPage } =
  params;
const reservations = await getReservations(
  omitUndefined({
    status: parsedStatus,
    search,
    startDate: dateFrom || undefined,
    endDate: dateTo || undefined,
  }),
  { page, limit: perPage, sortBy, sortOrder },
);
```

- [ ] **Step 4: Update ReservationFilters.tsx with date range inputs**

Add date range inputs. Since `BaseFilters` doesn't support date range, extend it with `children` slot or build a custom filter component:

```tsx
"use client";

import { useQueryStates } from "nuqs";
import { adminReservationSearchParamsParsers } from "@/shared/lib/nuqs";
import { BaseFilters } from "@/admin/components/table";
import { Input } from "@/admin/components/ui";

const STATUS_OPTIONS = [
  { value: "ALL", label: "すべて" },
  { value: "PENDING", label: "仮予約" },
  { value: "CONFIRMED", label: "確定" },
  { value: "CANCELLED", label: "キャンセル" },
  { value: "COMPLETED", label: "完了" },
  { value: "NO_SHOW", label: "ノーショー" },
];

export function ReservationFilters() {
  const [params, setParams] = useQueryStates(
    adminReservationSearchParamsParsers,
    {
      history: "push",
      shallow: false,
    },
  );

  return (
    <div className="space-y-4">
      <BaseFilters
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder="顧客名、スペース名で検索..."
      >
        {/* Date range as children slot */}
      </BaseFilters>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="text-sm text-muted-foreground whitespace-nowrap">
          期間:
        </label>
        <Input
          type="date"
          value={params.dateFrom}
          onChange={(e) =>
            void setParams({ dateFrom: e.target.value || null, page: 1 })
          }
          className="w-full sm:w-40"
        />
        <span className="text-sm text-muted-foreground">〜</span>
        <Input
          type="date"
          value={params.dateTo}
          onChange={(e) =>
            void setParams({ dateTo: e.target.value || null, page: 1 })
          }
          className="w-full sm:w-40"
        />
      </div>
    </div>
  );
}
```

**Important**: Since `BaseFilters` internally uses `useFilterParams()` which uses its own parsers, we need to either:

1. Create a custom reservation filter that uses `useQueryStates(adminReservationSearchParamsParsers)` directly (like StaffFilters does), OR
2. Extend `useFilterParams` to accept custom parsers

Option 1 is simpler and follows the StaffFilters precedent. **Build ReservationFilters as a fully custom component** using `useQueryStates(adminReservationSearchParamsParsers)` directly.

- [ ] **Step 5: Make ReservationTable headers sortable**

Convert ReservationTable from Server Component to accept sort props. Add `SortableColumnHeader` for 予約日時 (startTime) and 作成日 (createdAt) columns.

Since `SortableColumnHeader` is a Client Component (onClick handler), create a thin client wrapper `ReservationTableHeader.tsx`:

```tsx
"use client";

import { useQueryStates } from "nuqs";
import { adminReservationSearchParamsParsers } from "@/shared/lib/nuqs";
import { SortableColumnHeader } from "@/admin/components/table";
import { TableHead, TableHeader, TableRow } from "@/admin/components/ui";

type ReservationSortBy = "startTime" | "createdAt";

export function ReservationTableHeader() {
  const [params, setParams] = useQueryStates(
    adminReservationSearchParamsParsers,
    {
      history: "push",
      shallow: false,
    },
  );

  const handleSort = (column: ReservationSortBy) => {
    const newOrder =
      params.sortBy === column && params.sortOrder === "desc" ? "asc" : "desc";
    void setParams({ sortBy: column, sortOrder: newOrder, page: 1 });
  };

  return (
    <TableHeader>
      <TableRow>
        <SortableColumnHeader
          column="startTime"
          currentSortBy={params.sortBy}
          currentSortOrder={params.sortOrder}
          onSort={handleSort}
        >
          予約日時
        </SortableColumnHeader>
        <TableHead>スペース</TableHead>
        <TableHead className="hidden lg:table-cell">顧客</TableHead>
        <TableHead className="hidden md:table-cell text-right">料金</TableHead>
        <TableHead className="whitespace-nowrap">ステータス</TableHead>
        <TableHead className="hidden md:table-cell whitespace-nowrap">
          決済
        </TableHead>
        <SortableColumnHeader
          column="createdAt"
          currentSortBy={params.sortBy}
          currentSortOrder={params.sortOrder}
          onSort={handleSort}
          className="hidden lg:table-cell"
        >
          作成日
        </SortableColumnHeader>
        <TableHead className="text-right">操作</TableHead>
      </TableRow>
    </TableHeader>
  );
}
```

Then update `ReservationTable.tsx` to use this header instead of its inline header, and add the `createdAt` data column.

- [ ] **Step 6: type-check + validate**

Run: `bun run validate`

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(admin): add column sorting + date range filter to reservations table"
```

---

### Task 12: Posts 一括操作 (BulkActions)

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/actions/post/bulk.ts` — bulk Server Actions
- Create: `src/app/(admin)/admin/(dashboard)/posts/_components/PostBulkActions.tsx` — floating action bar
- Modify: `src/app/(admin)/admin/(dashboard)/posts/_components/PostTable.tsx` — add checkbox selection
- Modify: `src/app/(admin)/admin/(dashboard)/posts/page.tsx` — wire selection state

- [ ] **Step 1: Create bulk post Server Actions**

```tsx
// src/app/(admin)/admin/(dashboard)/_shared/actions/post/bulk.ts
"use server";

import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { prisma } from "@/shared/db/prisma";

export async function bulkTogglePostPublished(
  ids: string[],
  publish: boolean,
): Promise<MutationResult<{ count: number }>> {
  if (ids.length === 0) return { error: "対象が選択されていません" };

  return executeAdminMutationResult({
    resource: "post",
    action: "publish",
    execute: async () => {
      const result = await prisma.post.updateMany({
        where: { id: { in: ids } },
        data: {
          status: publish ? "PUBLISHED" : "DRAFT",
          ...(publish ? { publishedAt: new Date() } : { publishedAt: null }),
        },
      });
      return { count: result.count };
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.POSTS);
    },
  });
}

export async function bulkDeletePosts(
  ids: string[],
): Promise<MutationResult<{ count: number }>> {
  if (ids.length === 0) return { error: "対象が選択されていません" };

  return executeAdminMutationResult({
    resource: "post",
    action: "delete",
    execute: async () => {
      const result = await prisma.post.deleteMany({
        where: { id: { in: ids } },
      });
      return { count: result.count };
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.POSTS);
    },
  });
}
```

- [ ] **Step 2: Add to post barrel**

Add `export { bulkTogglePostPublished, bulkDeletePosts } from "./bulk";` to `post/index.ts`.

- [ ] **Step 3: Create PostBulkActions.tsx**

Mirror the pattern from `pages/_components/BulkActions.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  IconX,
  IconLoader2,
  IconEye,
  IconEyeOff,
  IconTrash,
} from "@tabler/icons-react";
import { Button } from "@/admin/components/ui";
import { toast } from "sonner";
import { isMutationError } from "@/shared/lib/mutation-result";
import { bulkTogglePostPublished, bulkDeletePosts } from "@/admin/actions/post";

type PostBulkActionsProps = {
  selectedIds: string[];
  onClear: () => void;
};

export function PostBulkActions({
  selectedIds,
  onClear,
}: PostBulkActionsProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (selectedIds.length === 0) return null;

  const handleAction = (action: () => Promise<unknown>, successMsg: string) => {
    startTransition(async () => {
      const result = await action();
      if (isMutationError(result)) {
        toast.error(result.error);
      } else {
        toast.success(successMsg);
        onClear();
        router.refresh();
      }
    });
  };

  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-lg">
      <span className="text-sm font-medium">{selectedIds.length}件選択中</span>
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() =>
          handleAction(
            () => bulkTogglePostPublished(selectedIds, true),
            "一括公開しました",
          )
        }
      >
        {isPending ? (
          <IconLoader2 className="h-4 w-4 animate-spin" />
        ) : (
          <IconEye className="h-4 w-4" />
        )}
        <span className="ml-1">一括公開</span>
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() =>
          handleAction(
            () => bulkTogglePostPublished(selectedIds, false),
            "一括非公開にしました",
          )
        }
      >
        {isPending ? (
          <IconLoader2 className="h-4 w-4 animate-spin" />
        ) : (
          <IconEyeOff className="h-4 w-4" />
        )}
        <span className="ml-1">一括非公開</span>
      </Button>
      <Button
        size="sm"
        variant="destructive"
        disabled={isPending}
        onClick={() =>
          handleAction(() => bulkDeletePosts(selectedIds), "一括削除しました")
        }
      >
        {isPending ? (
          <IconLoader2 className="h-4 w-4 animate-spin" />
        ) : (
          <IconTrash className="h-4 w-4" />
        )}
        <span className="ml-1">一括削除</span>
      </Button>
      <Button size="sm" variant="ghost" onClick={onClear} disabled={isPending}>
        <IconX className="h-4 w-4" />
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Add checkbox selection to PostTable**

PostTable is currently a Server Component. Selection state needs client-side management. Two approaches:

1. Make PostTable a Client Component (loses SC benefits)
2. Create a Client Component wrapper that manages selection and renders PostTable

Go with option 2: Create `PostListWithSelection.tsx` that wraps PostTable rows with checkboxes.

Alternatively, the simpler approach: Add a `PostSelectionProvider` context and make only the checkbox cells client components. But this adds complexity.

**Simplest approach**: Follow the Pages pattern. Read how `pages/_components/` handles selection with `BulkActions`. Then replicate.

- [ ] **Step 5: Wire into posts/page.tsx**

Add `PostBulkActions` and selection state management to the posts tab.

- [ ] **Step 6: type-check + validate**

Run: `bun run validate`

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(admin): add bulk publish/unpublish/delete for posts"
```

---

### Task 13: Posts テーブルにソート追加

**Files:**

- Modify: `src/shared/lib/nuqs/parsers.ts` — add `sortBy`/`sortOrder` to `adminPostSearchParamsParsers`
- Create: `src/app/(admin)/admin/(dashboard)/posts/_components/PostTableHeader.tsx` — sortable headers
- Modify: `src/app/(admin)/admin/(dashboard)/posts/_components/PostTable.tsx` — use PostTableHeader
- Modify: `src/app/(admin)/admin/(dashboard)/posts/page.tsx` — pass sort to query
- Modify: post query function to accept sort params

- [ ] **Step 1: Read posts query function**

Find `getPosts` and check if it already accepts sort params.

- [ ] **Step 2: Add sort params to post parsers**

```tsx
export const adminPostSearchParamsParsers = {
  // ... existing params
  sortBy: parseAsStringLiteral([
    "publishedAt",
    "title",
    "createdAt",
  ] as const).withDefault("createdAt"),
  sortOrder: parseAsSortOrder,
};
```

- [ ] **Step 3: Wire sort into getPosts query**

Add `orderBy: { [sortBy]: sortOrder }` to the Prisma query.

- [ ] **Step 4: Create PostTableHeader.tsx**

Client Component with `SortableColumnHeader` for publishedAt, title, createdAt.

- [ ] **Step 5: Update PostTable.tsx and page.tsx**

- [ ] **Step 6: type-check + validate**

Run: `bun run validate`

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(admin): add column sorting to posts table"
```

---

### Task 14: Post publish/unpublish に useOptimistic 追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/posts/_components/PostActionCell.tsx`

- [ ] **Step 1: Read PostActionCell.tsx**

- [ ] **Step 2: Add useOptimistic for publish status toggle**

```tsx
"use client";

import { useOptimistic, useTransition } from "react";
// ... existing imports

type PostActionCellProps = {
  id: string;
  status: string;
  slug: string;
};

export function PostActionCell({ id, status, slug }: PostActionCellProps) {
  const [isPending, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(status);
  const router = useRouter();

  const isPublished = optimisticStatus === "PUBLISHED";

  const handleTogglePublish = () => {
    startTransition(async () => {
      setOptimisticStatus(isPublished ? "DRAFT" : "PUBLISHED");
      const result = isPublished
        ? await unpublishPost(id)
        : await publishPost(id);
      if (isMutationError(result)) {
        toast.error(result.error);
      } else {
        toast.success(isPublished ? "下書きに戻しました" : "公開しました");
        router.refresh();
      }
    });
  };

  return (
    <ActionDropdown>
      <ActionDropdownItem href={`/admin/posts/${id}`}>編集</ActionDropdownItem>
      <ActionDropdownSeparator />
      <ActionDropdownItem onClick={handleTogglePublish} disabled={isPending}>
        {isPublished ? "下書きに戻す" : "公開する"}
      </ActionDropdownItem>
    </ActionDropdown>
  );
}
```

- [ ] **Step 3: type-check + validate**

Run: `bun run validate`

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(admin): add optimistic UI for post publish/unpublish toggle"
```

---

### Task 15: Staff 検索 + ページネーション強化

Staff already has `adminUserSearchParamsParsers` with `search`, `page`, `perPage`, `role`, `sortBy`, `sortOrder`. StaffFilters already uses `useQueryStates` directly. The gap is: StaffFilters renders only search + role filter, no pagination or sort controls in the table header.

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/staff/_components/StaffTableHeader.tsx` — sortable headers
- Modify: `src/app/(admin)/admin/(dashboard)/staff/_components/StaffTable.tsx` — use StaffTableHeader

- [ ] **Step 1: Read StaffTable.tsx**

- [ ] **Step 2: Create StaffTableHeader.tsx**

```tsx
"use client";

import { useQueryStates } from "nuqs";
import { adminUserSearchParamsParsers } from "@/shared/lib/nuqs";
import { SortableColumnHeader } from "@/admin/components/table";
import { TableHead, TableHeader, TableRow } from "@/admin/components/ui";

type StaffSortBy = "name" | "createdAt";

export function StaffTableHeader() {
  const [params, setParams] = useQueryStates(adminUserSearchParamsParsers, {
    history: "push",
    shallow: false,
  });

  const handleSort = (column: StaffSortBy) => {
    const newOrder =
      params.sortBy === column && params.sortOrder === "desc" ? "asc" : "desc";
    void setParams({ sortBy: column, sortOrder: newOrder, page: 1 });
  };

  return (
    <TableHeader>
      <TableRow>
        <SortableColumnHeader
          column="name"
          currentSortBy={params.sortBy}
          currentSortOrder={params.sortOrder}
          onSort={handleSort}
        >
          名前
        </SortableColumnHeader>
        <TableHead>メールアドレス</TableHead>
        <TableHead className="whitespace-nowrap">ロール</TableHead>
        <TableHead className="hidden md:table-cell">予約数</TableHead>
        <TableHead className="hidden md:table-cell">記事数</TableHead>
        <SortableColumnHeader
          column="createdAt"
          currentSortBy={params.sortBy}
          currentSortOrder={params.sortOrder}
          onSort={handleSort}
          className="hidden lg:table-cell"
        >
          登録日
        </SortableColumnHeader>
        <TableHead className="text-right">操作</TableHead>
      </TableRow>
    </TableHeader>
  );
}
```

- [ ] **Step 3: Update StaffTable.tsx to use StaffTableHeader**

Replace the inline `<TableHeader>` with `<StaffTableHeader />`.

- [ ] **Step 4: Verify staff query accepts sort params**

Check if the underlying query properly uses `sortBy`/`sortOrder` from the page params.

- [ ] **Step 5: type-check + validate**

Run: `bun run validate`

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(admin): add sortable column headers to staff table"
```

---

### Task 16: FAQ/Terms ページに件数上限警告コメント追加

現状の FAQカテゴリ / Terms は全件取得。データ量が少ないため許容するが、上限注意のコメントを追加。

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/faq/page.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/terms/page.tsx`

- [ ] **Step 1: Add WARN comments**

Read both page files, add a one-line comment above the data fetch:

```tsx
// WARN: 全件取得 — 50件超の運用が見込まれる場合はページネーション + 検索を追加
```

- [ ] **Step 2: Commit**

```bash
git commit -m "docs(admin): add unbounded fetch warnings to FAQ/terms pages"
```

---

### Task 17: 全体検証 + ビルド確認

- [ ] **Step 1: Full validate**

Run: `bun run validate`

- [ ] **Step 2: Build check**

Run: `bun run build:skip-env`

- [ ] **Step 3: Fix any remaining issues**

- [ ] **Step 4: Final commit (if fixes needed)**

---

## Summary

| #   | Task                              | Priority | Est. Size |
| --- | --------------------------------- | -------- | --------- |
| 1   | SortableColumnHeader              | HIGH     | S         |
| 2   | DetailLoading skeleton            | HIGH     | S         |
| 3   | Sub-route error/loading           | HIGH     | M         |
| 4   | InvitationTable EmptyState        | HIGH     | S         |
| 5   | auto-section-form split           | HIGH     | L         |
| 6   | TermsInlineEditor split           | HIGH     | L         |
| 7   | fetch-ogp split + migrate         | HIGH     | M         |
| 8   | NavigationManager split           | MEDIUM   | M         |
| 9   | InstagramSection split            | MEDIUM   | M         |
| 10  | post/index.ts split               | MEDIUM   | M         |
| 11  | Reservation sort + date filter    | HIGH     | L         |
| 12  | Posts bulk actions                | HIGH     | L         |
| 13  | Posts sort                        | MEDIUM   | M         |
| 14  | Post optimistic UI                | LOW      | S         |
| 15  | Staff sortable headers            | MEDIUM   | S         |
| 16  | FAQ/Terms unbounded fetch warning | LOW      | S         |
| 17  | Final verification                | -        | S         |
