# FAQ 管理画面 大幅刷新プラン（Phase 2）

**日付**: 2026-04-14
**種別**: 破壊的変更 + 新機能（schema migration 含む）
**ステータス**: 完了

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` を使って step ごとに実装・検証すること。step は `- [ ]` 形式で tracking する。

**Goal:** FAQ 管理画面を業界標準（Zendesk / Intercom / Sanity / Payload CMS / Document360）の UX 水準に合わせて大幅刷新する。SMB スケール（単一 admin、FAQ 数 20-200 件、カテゴリ 3-15 個）に焦点を絞り、バルク操作・Side panel preview・ソフトデリート + Recycle bin・Filter presets・カテゴリアイコンを導入する。ネストカテゴリ・ワークフロー承認・多言語等のエンタープライズ機能は意図的に除外する。

**Architecture:**

- **Schema 3 追加**: `FaqCategory.iconEmoji`, `FaqCategory.deletedAt`, `FaqItem.deletedAt`, `FaqItem.answerPlainText` (Space 3-column Lexical pattern)
- **ドメイン層**: 全クエリに `deletedAt: null` ガード、新規 bulk/restore/permanentDelete コマンド追加
- **Server Actions**: `bulkPublishFaqItems` / `bulkDeleteFaqItems` / `bulkMoveFaqItems` / `restoreFaqItem` / `restoreFaqCategory` / `permanentlyDeleteFaqItem` / `permanentlyDeleteFaqCategory`
- **UI**: 4-tab 構造（質問 / カテゴリ / SEO / Recycle Bin）、multi-select 付き質問テーブル、フローティング `FaqBulkActions`、`FaqItemPreviewSheet`（Radix Dialog ベースの右サイドパネル）、quick filter chip row、カテゴリ絵文字表示

**Tech Stack:** Next.js 16 / React 19.2 / Prisma 7 / Zod 4 / @dnd-kit / Radix Dialog / Tailwind 4.2

---

## 調査根拠

前回の調査（`docs/plans/` 外、セッション内）で以下の業界標準とギャップを特定:

| 機能                         | 現状 |             業界標準              |  本プラン対応   |
| ---------------------------- | :--: | :-------------------------------: | :-------------: |
| バルク操作                   |  ❌  | ✅ (Payload / Zendesk / Intercom) |   ✅ Phase 2    |
| Side panel preview           |  ❌  |    ✅ (Zendesk 2026 / Sanity)     |   ✅ Phase 3    |
| ソフトデリート + Recycle bin |  ❌  |       ✅ (Document360 30日)       |   ✅ Phase 5    |
| Filter presets               |  ⚠️  |                ✅                 |   ✅ Phase 4    |
| リストに副次情報プレビュー   |  ❌  |        ✅ (Sanity 3-slot)         |   ✅ Phase 1    |
| カテゴリ絵文字/アイコン      |  ❌  |         ✅ (Document360)          |   ✅ Phase 4    |
| ネストカテゴリ（6階層）      |  ❌  |         ✅ (Document360)          | ❌ Out of scope |
| ワークフロー承認             |  ❌  |         ✅ (Document360)          | ❌ Out of scope |
| View count 分析              |  ❌  |                ✅                 |    ❌ 別 PR     |

---

## Out of Scope（意図的除外）

以下は SMB スケール or 他の PR で対応:

- **ネストカテゴリ（2階層以上）** — Myrrh スケールに overkill
- **ワークフロー承認（Draft → Review → Published）** — 単一 admin 環境では不要
- **ロール分離（Admin/Contributor/Reviewer）** — 既存 RBAC で十分
- **バージョン履歴（article_versions）** — 複雑度が高く Lexical との統合が重い
- **View count / Helpfulness トラッキング** — 公開ページ統合が必要なため別 PR
- **多言語対応** — i18n 全体戦略が別物
- **ツリーフォルダービュー** — 現在の 3-tab + table 構造の方が明快

---

## File Structure

### 作成するファイル

- `prisma/migrations/YYYYMMDDHHMMSS_faq_overhaul/migration.sql` — 自動生成
- `src/app/(admin)/admin/(dashboard)/faq/_components/FaqBulkActions.tsx` — 複数選択時のフローティングアクションバー
- `src/app/(admin)/admin/(dashboard)/faq/_components/FaqItemPreviewSheet.tsx` — 右サイドドロワープレビュー（Radix Dialog + sheet variant）
- `src/app/(admin)/admin/(dashboard)/faq/_components/FaqBulkMoveDialog.tsx` — バルク移動先カテゴリ選択 Dialog
- `src/app/(admin)/admin/(dashboard)/faq/_components/FaqQuickFilterChips.tsx` — 下書きのみ・Stale 等の 1-click フィルタ
- `src/app/(admin)/admin/(dashboard)/faq/_components/FaqTrashTable.tsx` — Recycle bin 表示（カテゴリ + 質問統合）
- `src/app/(admin)/admin/(dashboard)/faq/_components/FaqTrashActionCell.tsx` — 復元 / 完全削除メニュー

### 変更するファイル

- `prisma/schema.prisma:1006-1050` — FaqCategory / FaqItem に 4 カラム追加
- `prisma/seed.ts` — seed データに answerPlainText 生成ロジック追加
- `src/shared/domain/faq/types.ts` — FaqItemRecord / FaqCategoryRecord に新フィールド追加
- `src/shared/domain/faq/queries.ts` — 全クエリに `deletedAt: null` ガード、listTrash 系追加
- `src/shared/domain/faq/commands.ts` — 既存 delete をソフトデリート化、bulk / restore / permanentDelete 追加、create/update で answerPlainText 生成
- `src/app/(admin)/admin/(dashboard)/_shared/actions/faq.ts` — bulk / restore / permanentDelete の Server Actions 追加
- `src/app/(admin)/admin/(dashboard)/_shared/queries/faq.ts` — getFaqTrashItems / getFaqTrashCategories 追加
- `src/shared/lib/nuqs/parsers.ts` — adminFaqSearchParamsParsers に `trash` tab + `quickFilter` 追加
- `src/app/(admin)/admin/(dashboard)/faq/_components/FaqManagementTabs.tsx` — 4-tab 化（質問 / カテゴリ / SEO / Recycle Bin）
- `src/app/(admin)/admin/(dashboard)/faq/_components/FaqItemTable.tsx` — checkbox column + 行クリックで preview sheet + selectedIds state
- `src/app/(admin)/admin/(dashboard)/faq/_components/FaqItemFilters.tsx` — QuickFilterChips 統合
- `src/app/(admin)/admin/(dashboard)/faq/_components/FaqCategoryTable.tsx` — iconEmoji 表示列追加
- `src/app/(admin)/admin/(dashboard)/faq/_components/FaqCategoryForm.tsx` — iconEmoji 入力フィールド追加
- `src/app/(admin)/admin/(dashboard)/faq/page.tsx` — trash タブ追加
- `src/app/(admin)/admin/(dashboard)/_shared/lib/validations/faq.ts` — `iconEmoji` フィールドを Zod スキーマに追加
- `src/app/(public)/_shared/components/sections/standard/faq-list/` — 公開 FAQ でアイコン表示（最小限）
- `.claude/rules/gotchas.md` — FAQ ソフトデリート / bulk 新パターンを追記

### 削除するファイル

なし（Phase 1 で既に整理済み）

---

## Task 1: Prisma Schema にカラム追加

**Files:**

- Modify: `prisma/schema.prisma:1006-1050`

- [ ] **Step 1.1: FaqCategory と FaqItem に新カラムを追加**

```prisma
model FaqCategory {
  id          String    @id @default(uuid()) @db.Uuid
  name        String
  slug        String    @unique
  description String?   @db.Text
  iconEmoji   String?   @db.VarChar(8)  // 単一絵文字（最大 8 byte = U+1F600 等の surrogate pair 対応）
  order       Int       @default(0)
  isActive    Boolean   @default(true)
  deletedAt   DateTime?                  // ソフトデリート
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  // Relations
  items FaqItem[]

  @@index([order])
  @@index([isActive, order])
  @@index([deletedAt])
  @@map("faq_categories")
}

model FaqItem {
  id              String    @id @default(uuid()) @db.Uuid
  categoryId      String    @db.Uuid
  question        String
  answerHtml      String    @db.Text @map("answer") // HTML キャッシュ（公開表示用）
  answerJson      Json?                              // Lexical EditorState JSON（プライマリ）
  answerPlainText String    @db.Text @default("")    // 派生プレビュー（list 表示用、~200 文字）
  order           Int       @default(0)
  isPublished     Boolean   @default(true)
  publishedAt     DateTime?
  deletedAt       DateTime?                          // ソフトデリート
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  // SEO設定
  metaDescription String?
  metaKeywords    String?

  // OGP設定
  ogpTitle       String?
  ogpDescription String?
  ogpImageUrl    String?

  // Relations
  category FaqCategory @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  @@index([categoryId, order])
  @@index([categoryId, isPublished, order])
  @@index([deletedAt])
  @@index([updatedAt])  // stale detection
  @@map("faq_items")
}
```

- [ ] **Step 1.2: マイグレーション生成・実行**

```bash
bunx --bun prisma migrate dev --name faq_overhaul_soft_delete_and_preview
```

マイグレーション生成後、`prisma/migrations/YYYYMMDDHHMMSS_faq_overhaul_soft_delete_and_preview/migration.sql` を確認。`answerPlainText` のデフォルト値 `""` で既存レコードは空文字で backfill される（update 時に再生成）。

- [ ] **Step 1.3: 既存レコードの answerPlainText backfill**

ワンショット実行用スクリプト: `bun -e` で既存 FaqItem 全件を対象に `stripHtmlToText(answerHtml, 200)` で再計算して update。

```bash
bun -e "
const { PrismaClient } = require('./generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { stripHtmlToText } = require('./src/shared/lib/lexical/html-to-plain-text');
const pg = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const p = new PrismaClient({ adapter: pg });
(async () => {
  const items = await p.faqItem.findMany({ select: { id: true, answerHtml: true } });
  for (const item of items) {
    await p.faqItem.update({
      where: { id: item.id },
      data: { answerPlainText: stripHtmlToText(item.answerHtml, 200) },
    });
  }
  console.log('backfilled', items.length, 'items');
  await p.\$disconnect();
})();
"
```

**Verify:**

- [ ] `bun run type-check` が通る
- [ ] `psql` で `SELECT id, deleted_at, icon_emoji FROM faq_categories LIMIT 1` と `SELECT id, deleted_at, answer_plain_text FROM faq_items LIMIT 1` が返る

---

## Task 2: ドメイン層（queries / commands）更新

**Files:**

- Modify: `src/shared/domain/faq/types.ts`
- Modify: `src/shared/domain/faq/queries.ts`
- Modify: `src/shared/domain/faq/commands.ts`

- [ ] **Step 2.1: types.ts に新フィールド追加**

```typescript
type FaqCategoryRecord = {
  // ... 既存
  iconEmoji: string | null;
  deletedAt: Date | null;
};

type FaqItemRecord = {
  // ... 既存
  answerPlainText: string;
  deletedAt: Date | null;
};
```

- [ ] **Step 2.2: queries.ts の全 read クエリに `deletedAt: null` ガード追加**

対象関数:

- `getFaqCategories()`
- `getFaqCategoryById(id)`
- `getFaqItems(filters)` — 親カテゴリの `category: { deletedAt: null }` も追加（gotchas.md §親ソフトデリートガード）
- `getFaqItemById(id)`

`select` 句に `iconEmoji` / `answerPlainText` / `deletedAt` を追加。

- [ ] **Step 2.3: queries.ts に trash 系関数追加**

```typescript
export async function getDeletedFaqCategories(): Promise<
  FaqCategoryWithItems[]
>;
export async function getDeletedFaqItems(): Promise<FaqItemWithCategory[]>;
```

ソフトデリート後 30 日以内のレコードのみ返す（`where: { deletedAt: { gte: thirtyDaysAgo } }`）。

- [ ] **Step 2.4: commands.ts の create/update で answerPlainText 生成**

```typescript
import { stripHtmlToText } from "@/shared/lib/lexical/html-to-plain-text";

// createFaqItem / updateFaqItem で:
const answerPlainText = stripHtmlToText(input.answerHtml, 200);
await prisma.faqItem.create/update({ data: { ..., answerPlainText } });
```

- [ ] **Step 2.5: commands.ts の delete をソフトデリート化**

```typescript
// Before: hard delete
await prisma.faqItem.delete({ where: { id } });

// After: soft delete
await prisma.faqItem.update({
  where: { id, deletedAt: null },
  data: { deletedAt: new Date() },
});
```

同様に `deleteFaqCategory` もソフトデリート化。

- [ ] **Step 2.6: commands.ts に bulk コマンド追加**

```typescript
export async function bulkPublishFaqItemsCommand(
  ids: string[],
  isPublished: boolean,
): Promise<{ updated: number }>;

export async function bulkSoftDeleteFaqItemsCommand(
  ids: string[],
): Promise<{ deleted: number }>;

export async function bulkMoveFaqItemsCommand(
  ids: string[],
  newCategoryId: string,
): Promise<{ moved: number }>;
```

`prisma.$transaction(async (tx) => { ... })` で原子性確保（`gotchas.md` § `prisma.$transaction([...])` 配列禁止）。

- [ ] **Step 2.7: commands.ts に restore / permanentDelete コマンド追加**

```typescript
export async function restoreFaqItemCommand(id: string): Promise<void>;
export async function restoreFaqCategoryCommand(id: string): Promise<void>;
export async function permanentlyDeleteFaqItemCommand(
  id: string,
): Promise<void>;
export async function permanentlyDeleteFaqCategoryCommand(
  id: string,
): Promise<void>;
```

**Verify:**

- [ ] `bun run type-check` が通る
- [ ] 既存の `deleteFaqItem` の呼び出し箇所が全て型整合性保持

---

## Task 3: Server Actions 拡張

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/faq.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/queries/faq.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/lib/validations/faq.ts`

- [ ] **Step 3.1: validations/faq.ts に iconEmoji + bulk schemas 追加**

```typescript
// FaqCategory schema 拡張
export const faqCategoryFormSchema = z.object({
  // ... 既存
  iconEmoji: z
    .string()
    .max(8, { error: "絵文字は 1 文字で入力してください" })
    .nullable()
    .optional(),
});

// Bulk schemas
export const bulkFaqItemIdsSchema = z
  .array(z.string().uuid({ error: "IDが不正です" }))
  .min(1, { error: "対象を選択してください" })
  .refine((ids) => new Set(ids).size === ids.length, {
    error: "同じIDを複数指定することはできません",
  });
```

- [ ] **Step 3.2: actions/faq.ts に bulk Server Actions 追加**

既存 `executeAdminMutationResult` パターン準拠:

```typescript
export async function bulkPublishFaqItems(
  ids: string[],
  isPublished: boolean,
): Promise<MutationResult<{ updated: number }>> {
  const parsed = bulkFaqItemIdsSchema.safeParse(ids);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "faq",
    action: "update",
    execute: async () => bulkPublishFaqItemsCommand(parsed.data, isPublished),
    afterSuccess: () => {
      invalidateFaqCaches();
      purgeFaqCaches();
    },
  });
}

export async function bulkDeleteFaqItems(
  ids: string[],
): Promise<MutationResult<{ deleted: number }>> {
  /* 同様のパターン */
}

export async function bulkMoveFaqItems(
  ids: string[],
  newCategoryId: string,
): Promise<MutationResult<{ moved: number }>> {
  /* 同様のパターン */
}
```

- [ ] **Step 3.3: restore / permanentDelete Server Actions 追加**

```typescript
export async function restoreFaqItem(id: string): Promise<MutationResult>;
export async function restoreFaqCategory(id: string): Promise<MutationResult>;
export async function permanentlyDeleteFaqItem(
  id: string,
): Promise<MutationResult>;
export async function permanentlyDeleteFaqCategory(
  id: string,
): Promise<MutationResult>;
```

- [ ] **Step 3.4: \_shared/queries/faq.ts に trash 系ラッパー追加**

```typescript
export async function getDeletedFaqItems(): Promise<FaqItemWithCategory[]> {
  await requireAdminPermission("faq", "read");
  return getDeletedFaqItemsQuery();
}

export async function getDeletedFaqCategories(): Promise<
  FaqCategoryWithItems[]
> {
  await requireAdminPermission("faq", "read");
  return getDeletedFaqCategoriesQuery();
}
```

**Verify:**

- [ ] `bun run validate` が通る
- [ ] Server Actions の型が MutationResult で統一されている

---

## Task 4: nuqs パーサー拡張

**Files:**

- Modify: `src/shared/lib/nuqs/parsers.ts:351`

- [ ] **Step 4.1: trash tab + quickFilter 追加**

```typescript
const adminFaqTabs = ["items", "categories", "seo", "trash"] as const;
const adminFaqQuickFilters = ["all", "drafts", "recent", "stale"] as const;

export const adminFaqSearchParamsParsers = {
  tab: parseAsStringLiteral(adminFaqTabs).withDefault("items"),
  quickFilter: parseAsStringLiteral(adminFaqQuickFilters).withDefault("all"),
  search: parseAsQuery,
  categoryId: parseAsString.withDefault(""),
  status: parseAsStringLiteral(adminFaqItemStatusValues).withDefault("all"),
  page: parseAsPage,
  perPage: parseAsInteger.withDefault(20),
};
```

**Verify:**

- [ ] `bun run type-check` 通る
- [ ] `loadAdminFaqSearchParams` が quickFilter を返す

---

## Task 5: バルク UI（multi-select + FaqBulkActions）

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/faq/_components/FaqBulkActions.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/faq/_components/FaqBulkMoveDialog.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/faq/_components/FaqItemTable.tsx`

- [ ] **Step 5.1: FaqBulkActions コンポーネント作成**

参照実装: `posts/_components/PostBulkActions.tsx`, `pages/_components/BulkActions.tsx`

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconChecks, IconTrash, IconFolder, IconX } from "@tabler/icons-react";
import { Button } from "@/admin/components/ui";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import { bulkPublishFaqItems, bulkDeleteFaqItems } from "@/admin/actions/faq";
import { isMutationError } from "@/shared/lib/mutation-result";
import { FaqBulkMoveDialog } from "./FaqBulkMoveDialog";

type FaqBulkActionsProps = {
  readonly selectedIds: readonly string[];
  readonly categories: readonly { id: string; name: string }[];
  readonly onClear: () => void;
};

export function FaqBulkActions({
  selectedIds,
  categories,
  onClear,
}: FaqBulkActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);

  if (selectedIds.length === 0) return null;

  const handleBulkPublish = (isPublished: boolean) => {
    startTransition(async () => {
      const result = await bulkPublishFaqItems([...selectedIds], isPublished);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `${result.data.updated} 件を${isPublished ? "公開" : "非公開"}にしました`,
      );
      onClear();
      router.refresh();
    });
  };

  const handleBulkDelete = () => {
    startTransition(async () => {
      const result = await bulkDeleteFaqItems([...selectedIds]);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success(`${result.data.deleted} 件を削除しました`);
      setDeleteOpen(false);
      onClear();
      router.refresh();
    });
  };

  return (
    <>
      <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border bg-card px-4 py-3 shadow-lg">
        <span className="text-sm text-muted-foreground">
          {selectedIds.length} 件選択中
        </span>
        <div className="mx-2 h-4 w-px bg-border" />
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleBulkPublish(true)}
          disabled={isPending}
        >
          <IconChecks className="mr-1 h-4 w-4" />
          公開
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleBulkPublish(false)}
          disabled={isPending}
        >
          非公開
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setMoveOpen(true)}
          disabled={isPending}
        >
          <IconFolder className="mr-1 h-4 w-4" />
          移動
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => setDeleteOpen(true)}
          disabled={isPending}
        >
          <IconTrash className="mr-1 h-4 w-4" />
          削除
        </Button>
        <div className="mx-2 h-4 w-px bg-border" />
        <Button size="sm" variant="ghost" onClick={onClear}>
          <IconX className="h-4 w-4" />
        </Button>
      </div>

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`${selectedIds.length} 件の質問を削除しますか？`}
        description="削除された質問は Recycle Bin に 30 日間保持され、復元できます。"
        onConfirm={handleBulkDelete}
        isPending={isPending}
      />

      <FaqBulkMoveDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        selectedIds={selectedIds}
        categories={categories}
        onSuccess={() => {
          setMoveOpen(false);
          onClear();
          router.refresh();
        }}
      />
    </>
  );
}
```

- [ ] **Step 5.2: FaqBulkMoveDialog 作成**

Radix Dialog + shadcn Select で移動先カテゴリを選択させる。`bulkMoveFaqItems` を呼び出す。

- [ ] **Step 5.3: FaqItemTable に checkbox column + selectedIds 追加**

```tsx
// 新規 props
type FaqItemTableProps = {
  // ... 既存
  readonly allCategories: readonly { id: string; name: string }[];
};

// 内部 state
const [selectedIds, setSelectedIds] = useState<string[]>([]);
const allSelected =
  items.length > 0 && items.every((i) => selectedIds.includes(i.id));
const someSelected = selectedIds.length > 0 && !allSelected;

// checkbox column を各 row の先頭に追加（DragHandle の前）
<TableCell className="w-10">
  <Checkbox
    checked={selectedIds.includes(item.id)}
    onCheckedChange={(checked) => {
      setSelectedIds((prev) =>
        checked ? [...prev, item.id] : prev.filter((id) => id !== item.id),
      );
    }}
    onClick={(e) => e.stopPropagation()}  // row クリック（preview sheet）を遮断
    aria-label={`${item.question}を選択`}
  />
</TableCell>

// Table header にも全選択 checkbox
<TableHead className="w-10">
  <Checkbox
    checked={allSelected}
    onCheckedChange={(checked) => {
      setSelectedIds(checked ? items.map((i) => i.id) : []);
    }}
    aria-label="すべて選択"
  />
</TableHead>

// Table 末尾に FaqBulkActions
<FaqBulkActions
  selectedIds={selectedIds}
  categories={allCategories}
  onClear={() => setSelectedIds([])}
/>
```

**Verify:**

- [ ] `bun run validate` 通る
- [ ] 複数選択 → 公開/非公開/削除/移動の 4 パターンが動作
- [ ] checkbox クリックで row クリック（preview）がトリガーされない

---

## Task 6: Side panel preview (FaqItemPreviewSheet)

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/faq/_components/FaqItemPreviewSheet.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/faq/_components/FaqItemTable.tsx`

- [ ] **Step 6.1: Sheet primitive 確認**

まず `@/admin/components/ui` に `Sheet` が既にあるか確認:

```bash
grep -l "export.*Sheet" src/app/\(admin\)/admin/\(dashboard\)/_shared/components/ui/
```

- **あれば**: 既存 `Sheet` を使用
- **なければ**: Radix `Dialog.Root` + `Dialog.Content` を右側 fixed + slide-in アニメーションでカスタム実装（既存 `dialog.tsx` を参考に側面 variant を追加）

- [ ] **Step 6.2: FaqItemPreviewSheet 作成**

```tsx
"use client";

import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import { IconX, IconEdit } from "@tabler/icons-react";
import { Badge, Button } from "@/admin/components/ui";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
import { cn } from "@/shared/lib/cn";
import type { FaqItemWithCategory } from "@/shared/domain/faq/types";

type FaqItemPreviewSheetProps = {
  readonly item: FaqItemWithCategory | null;
  readonly onClose: () => void;
};

export function FaqItemPreviewSheet({
  item,
  onClose,
}: FaqItemPreviewSheetProps) {
  const open = item !== null;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0" />
        <Dialog.Content
          className={cn(
            "fixed right-0 top-0 z-50 flex h-full w-full max-w-xl flex-col gap-4 overflow-y-auto border-l bg-background p-6 shadow-lg",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
          )}
        >
          {item && (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{item.category.name}</Badge>
                    <Badge variant={item.isPublished ? "default" : "secondary"}>
                      {item.isPublished ? "公開中" : "下書き"}
                    </Badge>
                  </div>
                  <Dialog.Title className="text-lg font-semibold">
                    {item.question}
                  </Dialog.Title>
                </div>
                <Dialog.Close
                  className="rounded-sm p-1 opacity-70 hover:opacity-100"
                  aria-label="プレビューを閉じる"
                >
                  <IconX className="h-4 w-4" />
                </Dialog.Close>
              </div>

              <Dialog.Description className="sr-only">
                FAQ 項目のプレビュー
              </Dialog.Description>

              <div className="prose prose-sm max-w-none border-y py-4">
                <SanitizedHtml html={item.answerHtml} />
              </div>

              <div className="flex flex-col gap-2 text-xs text-muted-foreground">
                <div>
                  更新: {new Date(item.updatedAt).toLocaleString("ja-JP")}
                </div>
                <div>
                  作成: {new Date(item.createdAt).toLocaleString("ja-JP")}
                </div>
              </div>

              <div className="mt-auto flex justify-end gap-2">
                <Button variant="outline" onClick={onClose}>
                  閉じる
                </Button>
                <Button asChild>
                  <Link href={`/admin/faq/items/${item.id}/edit`}>
                    <IconEdit className="mr-1 h-4 w-4" />
                    編集
                  </Link>
                </Button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 6.3: FaqItemTable で行クリックで sheet open**

```tsx
const [previewItem, setPreviewItem] = useState<FaqItemWithCategory | null>(null);

// TableRow に onClick を追加（ただし SortableItemRow の drag と衝突しないよう注意）
<TableRow
  onClick={() => setPreviewItem(item)}
  className="cursor-pointer"
>
  ...
</TableRow>

// 末尾に Sheet
<FaqItemPreviewSheet
  item={previewItem}
  onClose={() => setPreviewItem(null)}
/>
```

**注意事項**:

- checkbox / dragHandle / ActionCell の click は `stopPropagation()` で row click を遮断
- SortableItemRow の場合、drag の開始閾値が checkbox/dragHandle クリックと干渉しないことを確認（PointerSensor は `distance: 8` で設定済み）

**Verify:**

- [ ] 行クリックで Sheet が右側から slide-in
- [ ] Esc キーで閉じる
- [ ] checkbox クリックで Sheet が開かない
- [ ] 編集ボタンで /edit に遷移

---

## Task 7: Quick filter chips + カテゴリアイコン

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/faq/_components/FaqQuickFilterChips.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/faq/_components/FaqItemFilters.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/faq/page.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/faq/_components/FaqCategoryForm.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/faq/_components/FaqCategoryTable.tsx`
- Modify: `src/shared/domain/faq/queries.ts` — stale filter ロジック追加

- [ ] **Step 7.1: FaqQuickFilterChips 作成**

```tsx
"use client";

import { useQueryStates } from "nuqs";
import { adminFaqSearchParamsParsers } from "@/shared/lib/nuqs";
import { cn } from "@/shared/lib/cn";

const QUICK_FILTERS = [
  { value: "all", label: "すべて" },
  { value: "drafts", label: "下書きのみ" },
  { value: "recent", label: "最近更新" },
  { value: "stale", label: "30日以上未更新" },
] as const;

export function FaqQuickFilterChips() {
  const [params, setParams] = useQueryStates(adminFaqSearchParamsParsers, {
    history: "push",
    shallow: false,
  });

  return (
    <div className="flex flex-wrap gap-2">
      {QUICK_FILTERS.map((filter) => (
        <button
          key={filter.value}
          type="button"
          onClick={() => void setParams({ quickFilter: filter.value, page: 1 })}
          className={cn(
            "inline-flex items-center rounded-full border px-3 py-1 text-xs transition-colors",
            params.quickFilter === filter.value
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background hover:bg-muted",
          )}
          aria-pressed={params.quickFilter === filter.value}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 7.2: FaqItemFilters に統合**

`FaqItemFilters.tsx` の先頭に `<FaqQuickFilterChips />` を配置。

- [ ] **Step 7.3: queries.ts で quickFilter フィルタ適用**

`FaqItemFilters` 型に `quickFilter` を追加し、`buildFaqItemWhere` で条件分岐:

```typescript
if (filters.quickFilter === "drafts") {
  where.isPublished = false;
} else if (filters.quickFilter === "recent") {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  where.updatedAt = { gte: sevenDaysAgo };
} else if (filters.quickFilter === "stale") {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  where.updatedAt = { lte: thirtyDaysAgo };
}
```

- [ ] **Step 7.4: FaqCategoryForm に iconEmoji フィールド追加**

```tsx
<div className="space-y-2">
  <Label htmlFor="iconEmoji">アイコン（絵文字）</Label>
  <Input
    id="iconEmoji"
    {...register("iconEmoji")}
    placeholder="例: 🏠 🎯 ⭐"
    maxLength={4}
    disabled={isPending}
  />
  <p className="text-xs text-muted-foreground">
    1 文字の絵文字を入力してください。任意。
  </p>
</div>
```

- [ ] **Step 7.5: FaqCategoryTable でアイコン表示**

```tsx
<TableCell>
  <div className="flex items-center gap-2">
    {category.iconEmoji && (
      <span className="text-xl" aria-hidden="true">
        {category.iconEmoji}
      </span>
    )}
    <Link href={`/admin/faq/categories/${category.id}/edit`}>
      {category.name}
    </Link>
  </div>
</TableCell>
```

- [ ] **Step 7.6: faqCategoryFormSchema に iconEmoji 追加**

既に Task 3.1 で追加済み。backfill は不要（既存カテゴリは NULL のまま）。

**Verify:**

- [ ] `bun run validate` 通る
- [ ] quickFilter 切替で items が再フィルタされる
- [ ] カテゴリに絵文字を設定して保存 → 一覧に表示される

---

## Task 8: Recycle Bin（/admin/faq?tab=trash）

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/faq/_components/FaqTrashTable.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/faq/_components/FaqTrashActionCell.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/faq/_components/FaqManagementTabs.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/faq/page.tsx`

- [ ] **Step 8.1: FaqManagementTabs に trash タブ追加**

```tsx
<TabsList>
  <TabsTrigger value="items">質問一覧</TabsTrigger>
  <TabsTrigger value="categories">カテゴリ</TabsTrigger>
  <TabsTrigger value="seo">SEO</TabsTrigger>
  <TabsTrigger value="trash">
    <IconTrash className="mr-1 h-3 w-3" />
    ゴミ箱
  </TabsTrigger>
</TabsList>
```

- [ ] **Step 8.2: FaqTrashTable コンポーネント作成**

2 セクション（削除済みカテゴリ + 削除済み質問）の統合テーブル:

```tsx
type FaqTrashTableProps = {
  readonly categories: readonly FaqCategoryWithItems[];
  readonly items: readonly FaqItemWithCategory[];
};

export function FaqTrashTable({ categories, items }: FaqTrashTableProps) {
  const hasAny = categories.length + items.length > 0;

  if (!hasAny) {
    return <EmptyState message="ゴミ箱は空です" />;
  }

  return (
    <div className="space-y-6">
      {categories.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold">
            削除済みカテゴリ ({categories.length})
          </h3>
          {/* カテゴリの表 */}
        </section>
      )}
      {items.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold">
            削除済み質問 ({items.length})
          </h3>
          {/* 質問の表 */}
        </section>
      )}
      <p className="text-xs text-muted-foreground">
        削除から 30 日経過後、自動的に完全削除されます（予定）。
      </p>
    </div>
  );
}
```

- [ ] **Step 8.3: FaqTrashActionCell 作成**

ActionDropdown で「復元」「完全削除」の 2 アクション。完全削除は DeleteConfirmDialog + 強い警告文言。

- [ ] **Step 8.4: page.tsx に trash タブコンテンツ追加**

```tsx
async function FaqTrashTabContent() {
  await connection();
  const [categories, items] = await Promise.all([
    getDeletedFaqCategories(),
    getDeletedFaqItems(),
  ]);
  return <FaqTrashTable categories={categories} items={items} />;
}

// Tabs に追加
<FaqManagementTabs
  itemsContent={...}
  categoriesContent={...}
  seoContent={...}
  trashContent={
    <Suspense fallback={<LoadingState />}>
      <FaqTrashTabContent />
    </Suspense>
  }
/>
```

**Verify:**

- [ ] ゴミ箱タブに移動し、削除済みアイテムが表示される
- [ ] 復元ボタンで元のテーブルに戻る
- [ ] 完全削除で DB から消える

---

## Task 9: 公開 FAQ ページでアイコン表示（最小限）

**Files:**

- Modify: `src/app/(public)/_shared/components/sections/standard/faq-list/` 配下の該当ファイル

- [ ] **Step 9.1: FAQ セクション公開コンポーネントで iconEmoji 表示**

カテゴリ見出しの左に絵文字を追加（存在する場合のみ）:

```tsx
<h3>
  {category.iconEmoji && (
    <span aria-hidden="true" className="mr-2">
      {category.iconEmoji}
    </span>
  )}
  {category.name}
</h3>
```

- [ ] **Step 9.2: 公開 FAQ queries に iconEmoji を含める**

`public-queries.ts`（存在する場合）の select 句に `iconEmoji` を追加。

**Verify:**

- [ ] `/faq` ページでカテゴリ絵文字が表示される
- [ ] `bun run build` でルートが生成される

---

## Task 10: ドキュメント更新

**Files:**

- Modify: `.claude/rules/gotchas.md` — FAQ ソフトデリート / bulk パターンを追加
- Modify: `.claude/rules/frontend/admin-ui-patterns.md`（必要があれば）

- [ ] **Step 10.1: gotchas.md に新規パターン追記**

```markdown
- **FAQ 項目はソフトデリート** — `deletedAt: null` ガードが queries.ts 全クエリに必須。親カテゴリの `category: { deletedAt: null }` も同時適用（親ソフトデリートガードパターン）
- **FAQ bulk operations は `prisma.$transaction(async (tx) => ...)` 必須** — 配列形式 `$transaction([...])` は禁止（既存ルール踏襲）
- **`answerPlainText` は write 時に自動生成** — `stripHtmlToText(answerHtml, 200)` を create/update コマンド内で計算。Space の 3-column Lexical パターン準拠
- **FAQ 設定ダイアログのカテゴリ Select は `useController` パターン** — `register("categoryId")` では shadcn Select の onValueChange と連携できない（RHF 正式パターン）
```

- [ ] **Step 10.2: admin-ui-patterns.md に bulk operations の参照実装追加（必要に応じて）**

既存の `§ 一括操作（BulkActions）パターン` に `faq/_components/FaqBulkActions.tsx` を参照実装として追加。

---

## Task 11: 最終検証

- [ ] **Step 11.1: 型チェック + lint**

```bash
bun run validate
```

- [ ] **Step 11.2: 本番ビルド**

```bash
bun run build
```

- [ ] **Step 11.3: 手動動作確認**

以下のシナリオを `bun dev` で確認:

1. FAQ 質問を 3 件作成 → 質問一覧タブでチェックボックス複数選択 → バルク公開/非公開/削除/移動
2. 行クリックで右サイドの preview sheet が開く → 編集ボタンで /edit に遷移
3. Quick filter chip "30日以上未更新" で古い項目のみ表示
4. カテゴリに絵文字を設定 → 一覧・公開 /faq ページに表示
5. 質問を削除 → ゴミ箱タブで確認 → 復元 → 元の位置に戻る
6. ゴミ箱から完全削除 → DB から消える

- [ ] **Step 11.4: e2e test（任意、別 PR でも可）**

`e2e/admin/faq.spec.ts` を追加し、上記シナリオを Playwright で自動化。

---

## リスク・トレードオフ

### リスク

| リスク                                                | 影響度 | 緩和策                                                                                           |
| ----------------------------------------------------- | :----: | ------------------------------------------------------------------------------------------------ |
| **Schema migration の backfill 漏れ**                 |   高   | Task 1.3 で bun -e スクリプトを用意。既存 item が 0 件なら不要                                   |
| **ソフトデリートガードの書き漏れ**                    |   高   | Task 2.2 で queries.ts 全関数を明示列挙。gotchas.md 追記で再発防止                               |
| **Bulk operations のトランザクション**                |   中   | `$transaction(async (tx) => ...)` で原子性確保。配列形式禁止ルール遵守                           |
| **Preview sheet と DnD sortable の click 衝突**       |   中   | checkbox / dragHandle / ActionCell で `stopPropagation`、PointerSensor の distance: 8 で閾値確保 |
| **Turbopack HMR の 'use server' ↔ 'use client' 干渉** |   低   | gotchas.md の turbopack-hmr skill 推奨                                                           |

### トレードオフ

- **ネストカテゴリ見送り**: Document360 の強みを採用せず。将来 20+ カテゴリに成長した場合に再検討
- **View count / Helpfulness 分離**: 公開ページ統合が必要なため別 PR。本プランは管理 UI に集中
- **Recycle bin の自動パージ cron は後続 PR**: 初期は手動でのみ完全削除可能（30 日表示は UI のみ）
- **絵文字ピッカー UI 見送り**: 1文字 text input で簡易実装。`@tabler/icons-react` に絵文字なし、サードパーティピッカーは bundle 重いため

---

## 推定工数

| Phase   | 内容                    | 時間    |
| ------- | ----------------------- | ------- |
| Task 1  | Schema migration        | 30分    |
| Task 2  | Domain queries/commands | 1.5時間 |
| Task 3  | Server Actions          | 45分    |
| Task 4  | nuqs parser             | 15分    |
| Task 5  | Bulk UI                 | 2時間   |
| Task 6  | Preview Sheet           | 1.5時間 |
| Task 7  | Filter chips + icon     | 1時間   |
| Task 8  | Recycle Bin             | 1.5時間 |
| Task 9  | 公開ページ icon         | 30分    |
| Task 10 | ドキュメント更新        | 30分    |
| Task 11 | 最終検証                | 45分    |

**合計**: 約 10-11 時間（1〜1.5 日）

---

## 承認後の進め方

1. この計画を `設計承認済み` ステータスに変更
2. `superpowers:subagent-driven-development` スキルで Task 単位に実装
   - Task 1-4 を 1 implementer にバンドル（schema + domain + actions + nuqs、密結合）
   - Task 5-6 を 1 implementer（bulk + preview、UI 層で独立）
   - Task 7 を単独 implementer（filter + icon、独立）
   - Task 8 を単独 implementer（trash bin、独立）
   - Task 9-11 を 1 implementer（public + docs + verification）
3. 各 Task 完了後に `git log --oneline` + `git show --stat HEAD` で独立検証
4. Task 11 完了後 `verification-before-completion` → `finishing-a-development-branch`
5. 必要に応じて `worktree-bootstrap` で隔離ワークツリー作成

---

## 未解決事項（実装時に判断）

- [ ] **Recycle bin の自動パージ cron**: 本プランでは手動削除のみ実装。30日経過のクリーンアップは別 cron PR で追加するか、本プランに含めるか
- [ ] **answerPlainText の最大長**: 200 文字固定 or Settings で可変? → 初期は 200 固定
- [ ] **iconEmoji の validator**: 単純な maxLength + 絵文字regex か、Unicode codepoint チェックか → 初期は maxLength のみ
- [ ] **Sheet primitive の存在確認**: 既存 `@/admin/components/ui` に Sheet があれば再利用、なければ Dialog variant 追加
- [ ] **Preview sheet を開いた状態で Bulk 選択した場合の挙動**: Sheet は独立で動作するのが望ましい。選択の UI フィードバックは別管理
- [ ] **bulkMove の target category が deletedAt != null の場合**: バリデーションで拒否（Zod refine）
