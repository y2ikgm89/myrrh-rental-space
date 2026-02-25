# 管理画面一貫性・整合性リファクタリング 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 管理画面全体の実装・UI/UX・コードパターンの不整合を根本的に解消し、破壊的変更を伴う最新推奨パターンに統一する

**Architecture:** Critical → Important → Minor の順に修正。同一リソースを触るタスクは直列、独立タスクは並列実行。Radix Dialog への完全移行、`checkReadPermissionFor()` HOF への統一、Prisma enum の使用、ページパターンの統一が主な変更点。

**Tech Stack:** Next.js 16, React 19, TypeScript 6.0-beta, Radix UI (Dialog/AlertDialog), Zod 4, Prisma 7, nuqs, Tailwind CSS 4, Better Auth

---

## Phase 1: Critical 修正（並列実行可能: Task 1-3 同時）

### Task 1: `connection()` 二重呼び出し修正 + `terms/[id]` 未呼び出し修正

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/faq/page.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/posts/categories/[id]/page.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/posts/tags/[id]/page.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/terms/[id]/page.tsx`

**Step 1: faq/page.tsx の重複削除**

現在のコード（行 17-18）:

```typescript
await connection();
await connection(); // ← 削除
```

修正: 2行目の `await connection();` を削除。1行のみにする。

**Step 2: posts/categories/[id]/page.tsx の重複削除**

同様に同一関数内の `await connection();` が2回ある箇所を1行に修正。

**Step 3: posts/tags/[id]/page.tsx の重複削除**

同様に修正。

**Step 4: terms/[id]/page.tsx に connection() を追加**

現在:

```typescript
export default async function TermsDetailPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/admin/terms/${id}/edit`);
}
```

修正後:

```typescript
import { connection } from "next/server";
import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TermsDetailPage({ params }: PageProps) {
  await connection();
  const { id } = await params;
  redirect(`/admin/terms/${id}/edit`);
}
```

**Step 5: 型チェック確認**

```bash
bun run type-check
```

Expected: エラーなし

**Step 6: Commit**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/faq/page.tsx \
        src/app/\(admin\)/admin/\(dashboard\)/posts/categories/\[id\]/page.tsx \
        src/app/\(admin\)/admin/\(dashboard\)/posts/tags/\[id\]/page.tsx \
        src/app/\(admin\)/admin/\(dashboard\)/terms/\[id\]/page.tsx
git commit -m "fix(admin): remove duplicate connection() calls and add missing one in terms/[id]"
```

---

### Task 2: `from 'zod/v4'` 非標準インポートパス修正

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/lib/validations/media.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/editor-comment.ts`

**Step 1: media.ts の修正**

```typescript
// Before:
import { z } from "zod/v4";
// After:
import { z } from "zod";
```

**Step 2: editor-comment.ts の修正**

```typescript
// Before:
import { z } from "zod/v4";
// After:
import { z } from "zod";
```

**Step 3: 型チェック確認**

```bash
bun run type-check
```

**Step 4: Commit**

```bash
git commit -m "fix(admin): standardize zod import path from 'zod/v4' to 'zod'"
```

---

### Task 3: 内部エラーメッセージのユーザー露出修正

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/lib/api-keys/resend.ts`

**Step 1: resend.ts の修正**

現在（問題のある箇所）:

```typescript
return {
  success: false,
  error: error.message || "接続テストに失敗しました",
};
```

修正後 — 既知パターン以外は固定メッセージを返す:

```typescript
// Resend SDK の既知エラーパターンのみ判別し、それ以外は固定メッセージ
const isInvalidKey =
  error.message?.includes("Invalid API Key") ||
  error.name === "invalid_api_key";

return {
  success: false,
  error: isInvalidKey
    ? "APIキーが無効です。正しいキーを入力してください。"
    : "接続テストに失敗しました。しばらく経ってから再試行してください。",
};
```

**Step 2: 型チェック確認**

```bash
bun run type-check
```

**Step 3: Commit**

```bash
git commit -m "fix(security): prevent internal error message exposure in resend connection test"
```

---

## Phase 2: Critical - ダイアログ設計修正（直列実行）

### Task 4: Media系ダイアログを Radix Dialog に完全移行

**概要:** 現在 `if (!isOpen) return null` + 手動 `div.fixed` でモーダルを実装している3コンポーネントを、Radix UI の `<Dialog>` コンポーネントに完全移行する。これは破壊的な書き換えを含む。

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/media/_components/MediaUploadDialog.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/media/_components/MediaDetailDialog.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/media-picker/MediaPickerDialog.tsx`

**Step 1: MediaUploadDialog.tsx の書き換え**

現在の `if (!isOpen) return null` と手動 `div.fixed` 実装を削除し、Radix Dialog に移行:

```typescript
// Before: 手動モーダル
if (!isOpen) return null

return (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    ...
  </div>
)

// After: Radix Dialog
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/admin/components/ui"

// if (!isOpen) return null を削除
// return 文を Dialog でラップ
return (
  <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>メディアアップロード</DialogTitle>
      </DialogHeader>
      {/* 既存の内部コンテンツ */}
      ...
      <DialogFooter>
        {/* フッターボタン */}
      </DialogFooter>
    </DialogContent>
  </Dialog>
)
```

**Step 2: MediaDetailDialog.tsx の書き換え**

同様に `if (!item) return null` を削除し、`<Dialog open={!!item} onOpenChange={(open) => { if (!open) onClose(); }}>` でラップ:

```typescript
// if (!item) return null を削除

return (
  <Dialog open={!!item} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="sm:max-w-2xl">
      {item && ( // item が null でないときのみコンテンツを表示
        <>
          <DialogHeader>
            <DialogTitle>{item.title || item.fileName}</DialogTitle>
          </DialogHeader>
          {/* 既存の内部コンテンツ（item を使っている部分は全て item && でガード済みのため安全） */}
          ...
        </>
      )}
    </DialogContent>
  </Dialog>
)
```

**Step 3: MediaPickerDialog.tsx の書き換え**

同様に `if (!isOpen) return null` を削除し、Dialog でラップ:

```typescript
// if (!isOpen) return null を削除

return (
  <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0">
      {/* 既存の内部コンテンツ */}
    </DialogContent>
  </Dialog>
)
```

**Step 4: 動作確認**

各ダイアログを実際に開閉して動作を確認（`bun dev` 起動後）。

**Step 5: 型チェック確認**

```bash
bun run type-check
```

**Step 6: Commit**

```bash
git commit -m "fix(media): migrate all media dialogs from manual div.fixed to Radix Dialog"
```

---

### Task 5: EventDetailDialog と CommentPanel の early-return 除去

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/reservations/_components/calendar/EventDetailDialog.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/comment-panel/CommentPanel.tsx`

**Step 1: EventDetailDialog.tsx の修正**

現在: `if (!event) return null` の後に `<Dialog>` がある。
修正: early-return を削除し、`open={!!event}` で制御する:

```typescript
// Before:
if (!event) return null
return (
  <Dialog open>
    ...
  </Dialog>
)

// After:
return (
  <Dialog open={!!event} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent>
      {event && (
        // 内部コンテンツ（event が null でない時のみ表示）
        ...
      )}
    </DialogContent>
  </Dialog>
)
```

**Step 2: CommentPanel.tsx の修正**

`if (!isOpen) return null` を削除し、CSS で表示制御:

```typescript
// Before:
if (!isOpen) return null

return (
  <>
    <div className="fixed inset-0 bg-black/20 md:hidden" onClick={onClose} />
    <div className="fixed right-0 ... w-80 ...">
      ...
    </div>
  </>
)

// After:
// early return を削除
// パネル本体に data-[open] または className の条件でトランジション追加
return (
  <>
    {isOpen && (
      <div className="fixed inset-0 bg-black/20 md:hidden" onClick={onClose} />
    )}
    <div
      className={cn(
        "fixed right-0 ... w-80 ... transition-transform duration-200",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}
      aria-hidden={!isOpen}
    >
      ...
    </div>
  </>
)
```

**Step 3: 型チェック確認**

```bash
bun run type-check
```

**Step 4: Commit**

```bash
git commit -m "fix(ui): remove early-return from EventDetailDialog and CommentPanel"
```

---

## Phase 3: Important - コードパターン修正（Task 6-8 並列実行可能）

### Task 6: `checkReadPermission` 重複実装を `checkReadPermissionFor()` に統一

**Files（8ファイル）:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/announcement-bar.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/space-category.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/staff-invitation.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/navigation.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/homepage-settings.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/page-section.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/basic.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/robots-txt.ts`

**Step 1: 各ファイルで checkReadPermission 関数を削除**

各ファイルの以下パターンを削除:

```typescript
// 削除対象
async function checkReadPermission(): Promise<boolean> {
  const session = await getSession();
  if (!session?.user) return false;
  const role = getRoleFromSession(session);
  if (!role) return false;
  if (!canAccessAdmin(role)) return false;
  if (!hasPermission(role, "resourceName", "read")) {
    void logPermissionDenied(session.user.id, "resourceName", "read");
    return false;
  }
  return true;
}
```

**Step 2: `checkReadPermissionFor()` に置き換え**

各ファイルでインポートを確認し、`checkReadPermissionFor` をインポート済みでなければ追加:

```typescript
import {
  withPermission,
  checkReadPermissionFor,
} from "@/admin/lib/server-action-helpers";

// 置き換えパターン:
const checkReadPermission = checkReadPermissionFor("resourceName");
```

リソース名対応表:

- `announcement-bar.ts` → `checkReadPermissionFor("announcementBar")`
- `space-category.ts` → `checkReadPermissionFor("spaceCategory")`
- `staff-invitation.ts` → `checkReadPermissionFor("staff")`
- `navigation.ts` → `checkReadPermissionFor("navigation")`
- `homepage-settings.ts` → `checkReadPermissionFor("homepageSettings")`
- `page-section.ts` → `checkReadPermissionFor("pageSection")`
- `settings/basic.ts` → `checkReadPermissionFor("settings")`
- `settings/robots-txt.ts` → `checkReadPermissionFor("settings")`

**Step 3: 不要になった import を削除**

`getSession`, `getRoleFromSession`, `canAccessAdmin`, `hasPermission`, `logPermissionDenied` 等のインポートが他で使われていない場合は削除。

**Step 4: 型チェック確認**

```bash
bun run type-check
```

**Step 5: Commit**

```bash
git commit -m "refactor(admin): replace duplicate checkReadPermission with checkReadPermissionFor HOF"
```

---

### Task 7: `verifyAdminSession()` のみの読み取りアクションを `checkReadPermissionFor()` に移行

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/instagram.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/ical-tokens.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/api-keys.ts`

**Step 1: 各ファイルの修正方針**

`instagram.ts`:

```typescript
// Before:
export async function getInstagramConfig(): Promise<InstagramConfig> {
  await verifyAdminSession()
  ...
}

// After:
const checkReadPermission = checkReadPermissionFor("instagram")

export async function getInstagramConfig(): Promise<InstagramConfig> {
  if (!(await checkReadPermission())) {
    return { /* empty result */ }
  }
  ...
}
```

`ical-tokens.ts`:

```typescript
const checkReadPermission = checkReadPermissionFor("settings")

export async function getICalTokens() {
  if (!(await checkReadPermission())) return { tokens: [] }
  ...
}
```

`api-keys.ts` — 6関数（getResendConfig, getTurnstileConfig, getGoogleMapsConfig, getCloudflareConfig, getGoogleOAuthConfig, getCustomApiKeys）を全て `checkReadPermissionFor("settings")` に移行:

```typescript
const checkSettingsReadPermission = checkReadPermissionFor("settings");

// 各関数で:
// Before: await verifyAdminSession()
// After: if (!(await checkSettingsReadPermission())) return { /* empty */ }
```

また、`getCustomApiKeyValue()` は平文APIキーを返すため、監査ログ付きの権限チェックを追加:

```typescript
// Before:
export async function getCustomApiKeyValue(keyId: string): Promise<string | null> {
  await verifyAdminSession()

// After: withPermission で保護（監査ログ自動記録）
export const getCustomApiKeyValue = withPermission<[string], string | null>(
  "settings",
  "read"
)(async (keyId) => {
  ...
})
```

**Step 2: 型チェック確認**

```bash
bun run type-check
```

**Step 3: Commit**

```bash
git commit -m "refactor(admin): migrate verifyAdminSession-only reads to checkReadPermissionFor with audit logging"
```

---

### Task 8: Prisma enum 文字列リテラル直書きを enum 定数に修正

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/mutations.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/inquiry.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/dashboard.ts`

**Step 1: mutations.ts の修正**

```typescript
// Before:
import { ReservationStatus } from "@/shared/generated/prisma/client";
// (既にimport済みか確認)

const updateStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["PENDING", "CONFIRMED", "CANCELLED"]),
});

// After:
import { ReservationStatus } from "@/shared/generated/prisma/client";

const updateStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.nativeEnum(ReservationStatus),
});
```

**Step 2: inquiry.ts の修正**

```typescript
import { InquiryStatus } from "@/shared/generated/prisma/client"

// Before:
status: z.enum(['NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']),
// After:
status: z.nativeEnum(InquiryStatus),
```

**Step 3: dashboard.ts の修正**

```typescript
import {
  ReservationStatus,
  InquiryStatus,
} from "@/shared/generated/prisma/client";

// Before:
status: {
  not: "CANCELLED";
}
status: "CONFIRMED";
where: {
  status: "NEW";
}

// After:
status: {
  not: ReservationStatus.CANCELLED;
}
status: ReservationStatus.CONFIRMED;
where: {
  status: InquiryStatus.NEW;
}
```

**Step 4: 型チェック確認**

```bash
bun run type-check
```

**Step 5: Commit**

```bash
git commit -m "fix(admin): replace string literal enum values with Prisma enum constants"
```

---

## Phase 4: Important - UI パターン修正（Task 9-12 段階的実行）

### Task 9: ページ h1 クラス統一（tracking-tight text-foreground）

**概要:** `admin-ui-patterns.md` の標準 `text-2xl font-bold tracking-tight text-foreground` に統一。13ページを一括修正。

**Files（13ファイル）:**

- `customers/page.tsx`
- `reservations/page.tsx`
- `posts/page.tsx`
- `news/page.tsx`
- `coupons/page.tsx`
- `faq/page.tsx`
- `staff/page.tsx`
- `audit-logs/page.tsx`
- `media/page.tsx`
- `inquiries/page.tsx`
- `pages/page.tsx`
- `settings/page.tsx`
- `settings/_components/SettingsLayout.tsx`

**Step 1: 各ファイルの h1 クラスを修正**

各ファイルで:

```typescript
// Before:
<h1 className="text-2xl font-bold">XXX管理</h1>

// After:
<h1 className="text-2xl font-bold tracking-tight text-foreground">XXX管理</h1>
```

**Step 2: SettingsLayout.tsx も修正**

`SettingsLayout` 内の h1 も同様に修正。

**Step 3: lint 確認**

```bash
bun run validate
```

**Step 4: Commit**

```bash
git commit -m "fix(admin): unify page h1 class to include tracking-tight text-foreground"
```

---

### Task 10: `error.tsx` を欠落リソースに追加

**概要:** 統一された `error.tsx` を9リソースに追加。コンテンツは既存の `spaces/error.tsx` と同一パターン。

**Files（新規作成 9ファイル）:**

- `faq/error.tsx`
- `terms/error.tsx`
- `customers/error.tsx`
- `inquiries/error.tsx`
- `audit-logs/error.tsx`
- `media/error.tsx`
- `pages/error.tsx`
- `news/error.tsx`
- `coupons/error.tsx`

**Step 1: 既存の error.tsx パターンを確認**

`spaces/error.tsx` の内容を参照し、同じテンプレートを使う。

**Step 2: 9ファイルを作成**

各ファイルは以下のテンプレート（リソース名を変えるだけ）:

```typescript
"use client"

import { useEffect } from "react"
import { Button } from "@/admin/components/ui"
import { logError } from "@/shared/lib/errors/server"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    void logError(error, {
      context: "XXX管理ページ",
    })
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <p className="text-muted-foreground">エラーが発生しました。</p>
      <Button onClick={reset}>再試行</Button>
    </div>
  )
}
```

**Step 3: 型チェック確認**

```bash
bun run type-check
```

**Step 4: Commit**

```bash
git commit -m "feat(admin): add missing error.tsx to faq, terms, customers, inquiries, audit-logs, media, pages, news, coupons"
```

---

### Task 11: タブ実装パターンを news/posts で nuqs + shallow: true に統一

**概要:** `news/page.tsx` と `posts/page.tsx` のタブを、`SpaceManagementTabs` と同様の `useQueryState` + `shallow: true` パターンに移行。

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/news/page.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/posts/page.tsx`

**Step 1: news/page.tsx のタブを Client Component に抽出**

```typescript
// news/_components/NewsManagementTabs.tsx (新規作成)
"use client"

import { useQueryState } from "nuqs"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/admin/components/ui"
import { Button } from "@/admin/components/ui"
import Link from "next/link"
import { Suspense } from "react"
import { LoadingState } from "@/admin/components/LoadingState"
import { NewsList } from "./NewsList"
import { SeoContent } from "./SeoContent"
import { NewsFilters } from "./NewsFilters"

export function NewsManagementTabs({ searchParams }: { searchParams: Record<string, string> }) {
  const [tab, setTab] = useQueryState("tab", { defaultValue: "posts", shallow: true })

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-6">
      <div className="flex items-center justify-between">
        <TabsList>
          <TabsTrigger value="posts">記事一覧</TabsTrigger>
          <TabsTrigger value="meta">メタ情報</TabsTrigger>
        </TabsList>
        {tab === "posts" && (
          <Button asChild className="min-h-10 sm:min-h-9">
            <Link href="/admin/news/new">新規作成</Link>
          </Button>
        )}
      </div>

      <TabsContent value="posts" forceMount data-[state=inactive]:hidden className="space-y-6">
        <Suspense fallback={<LoadingState variant="inline" />}>
          <NewsFilters />
        </Suspense>
        <Suspense fallback={<LoadingState />}>
          <NewsList searchParams={searchParams} />
        </Suspense>
      </TabsContent>

      <TabsContent value="meta" forceMount data-[state=inactive]:hidden>
        <Suspense fallback={<LoadingState />}>
          <SeoContent />
        </Suspense>
      </TabsContent>
    </Tabs>
  )
}
```

`news/page.tsx` からタブ関連コードを `<NewsManagementTabs searchParams={searchParams} />` に置き換え。新規作成ボタンもタブコンポーネント内に移動。

**Step 2: posts/page.tsx も同様に `PostsManagementTabs` を抽出**

同じパターンで `posts/_components/PostsManagementTabs.tsx` を作成し、posts/page.tsx をシンプル化。

**Step 3: 型チェック確認**

```bash
bun run type-check
```

**Step 4: Commit**

```bash
git commit -m "refactor(admin): migrate news/posts tabs to nuqs shallow: true pattern"
```

---

### Task 12: AdminDetailLayout 未使用箇所の対応

**概要:** `faq/items/new` と `faq/items/[id]/edit` については `FaqItemInlineEditor` がエディタ全画面なので構造的に `AdminDetailLayout` 使用不可（`posts/new` と同様の例外）。`terms/new` も `TermsInlineEditor` がフルスクリーン。ただし共通のバックナビゲーションパターンを確保する。

**Files:**

- Confirm: `src/app/(admin)/admin/(dashboard)/faq/items/new/page.tsx`
- Confirm: `src/app/(admin)/admin/(dashboard)/faq/items/[id]/edit/page.tsx`
- Confirm: `src/app/(admin)/admin/(dashboard)/terms/new/page.tsx`

**Step 1: 各ページの InlineEditor の `EditorHeader` を確認**

`FaqItemInlineEditor` と `TermsInlineEditor` が `InlineEditorShell` / `EditorHeader` 経由でバックナビゲーションを実装しているか確認。

**Step 2: バックナビゲーションが欠落している場合は追加**

`faq/items/[id]/edit/page.tsx` が `backHref` を受け取るよう `FaqItemInlineEditor` のプロップを確認し、欠落していればバックリンクを追加:

```typescript
// faq/items/new/page.tsx
// FaqItemInlineEditor に backHref プロップを追加
<FaqItemInlineEditor backHref="/admin/faq" />
```

**Step 3: 型チェック確認**

```bash
bun run type-check
```

**Step 4: Commit**

```bash
git commit -m "fix(admin): ensure back navigation in faq/items and terms inline editors"
```

---

## Phase 5: Minor 修正（一括）

### Task 13: Minor 問題一括修正

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/api-keys.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/settings/page.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceManagementTabs.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/_components/DashboardRecentSection.tsx`
- Modify: media/page.tsx, audit-logs/page.tsx, staff/page.tsx, posts/page.tsx（LoadingState統一）

**Step 1: api-keys.ts のインライン動的 import 型参照修正**

```typescript
// Before:
function isCustomApiKeyStored(value: unknown): value is import('@/admin/types/api-keys').CustomApiKeyStored {

// After:
import type { CustomApiKeyStored } from '@/admin/types/api-keys'
function isCustomApiKeyStored(value: unknown): value is CustomApiKeyStored {
```

**Step 2: settings/page.tsx のタイトル修正**

```typescript
// Before:
<h1 className="text-2xl font-bold">サイト設定</h1>
// After:
<h1 className="text-2xl font-bold tracking-tight text-foreground">設定</h1>
```

**Step 3: SpaceManagementTabs の forceMount に data-[state=inactive]:hidden を明示**

```typescript
// Before:
<TabsContent value="spaces" forceMount>
// After:
<TabsContent value="spaces" forceMount className="data-[state=inactive]:hidden">
```

3つの TabsContent 全てに追加。

**Step 4: DashboardRecentSection の EmptyState コンポーネント使用**

```typescript
// Before:
<p className="text-muted-foreground text-sm">予約データがありません</p>
// After:
import { EmptyState } from "@/admin/components/EmptyState"
<EmptyState message="予約データがありません" />
```

**Step 5: LoadingState インライン実装をコンポーネントに統一**

`media/page.tsx`, `audit-logs/page.tsx`, `staff/page.tsx` の Suspense fallback でインライン Skeleton を書いている箇所を `<LoadingState />` に統一。

**Step 6: 型チェック確認**

```bash
bun run type-check
```

**Step 7: Commit**

```bash
git commit -m "fix(admin): cleanup minor inconsistencies - inline types, titles, forceMount, EmptyState, LoadingState"
```

---

## Phase 6: 最終検証

### Task 14: 全体検証

**Step 1: 完全な型チェック + lint**

```bash
bun run validate
```

Expected: エラー 0件

**Step 2: ビルド確認**

```bash
bun run build
```

Expected: ビルド成功

**Step 3: 各 Critical 修正の動作確認**

- [x] MediaUploadDialog が Dialog として動作する（開閉アニメーション付き）
- [x] MediaDetailDialog が `item` null でも DOM にマウントされる
- [x] MediaPickerDialog が Dialog として動作する
- [x] EventDetailDialog が `event` null でも DOM にマウントされる
- [x] CommentPanel がアニメーション付きで開閉する
- [x] FAQ ページが正常に表示される（connection() 1回のみ）
- [x] タブ切り替えでページリロードしない（news/posts）

**Step 4: 最終コミット**

```bash
git commit -m "chore(admin): complete consistency refactoring - all phases complete"
```

---

## 実行順序サマリー

| フェーズ | タスク     | 並列可否         | 難易度 |
| -------- | ---------- | ---------------- | ------ |
| Phase 1  | Task 1-3   | 並列 ✅          | 低     |
| Phase 2  | Task 4     | 直列（UI確認要） | 高     |
| Phase 2  | Task 5     | Task 4の後       | 中     |
| Phase 3  | Task 6-8   | 並列 ✅          | 中     |
| Phase 4  | Task 9-10  | 並列 ✅          | 低〜中 |
| Phase 4  | Task 11-12 | Task 9-10の後    | 中     |
| Phase 5  | Task 13    | 独立             | 低     |
| Phase 6  | Task 14    | 最後             | —      |
