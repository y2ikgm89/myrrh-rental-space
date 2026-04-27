> **Snapshot: 2026-04-27** — Implementation completed, archived as historical reference.

# P19 Phase 1 — Admin Bulk Actions (spaces / events / news)

> **Snapshot: 2026-04-27** — P19 (admin バルク操作網羅) の Phase 1。
> 6 領域中 spaces / events / news の 3 領域に bulk publish/unpublish/delete を導入。
> Phase 2 (customers / inquiries / coupons) は別 plan で扱う。

## Why

`/admin` 一覧ページの一括操作は現状 `posts` / `pages` / `reservations` / `faq` のみに実装済みで、`spaces` / `events` / `news` には未提供。1 件ずつ ActionDropdown から操作する UX は運用管理者の負担が大きく（特に告知バッチ公開・期間切れイベント整理・スペース一斉非公開等）、業界標準（Notion / Linear / Shopify Admin）の bulk-select バーを Phase 1 で対称化する。

## How to apply

新規 plan / 実装は本 spec の「対象範囲」「禁止事項」を SSoT として参照する。Phase 2 で同種機能を customers / inquiries / coupons に拡張する際もパターンを踏襲する（spec は本ファイルが正本、phase 2 spec で差分のみ追記）。

---

## 対象範囲（Phase 1）

### 共通アクション（3 領域すべて）

| アクション     | 内容                                                                                                          | 既存 command との関係                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **一括公開**   | `isPublished: true` + `publishedAt: now`（spaces / news）/ `status: PUBLISHED` + `publishedAt: now`（events） | 既存 publish command の `updateMany` 化                             |
| **一括非公開** | `isPublished: false` + `publishedAt: null`（spaces / news）/ `status: DRAFT`（events）                        | 既存 unpublish command の `updateMany` 化                           |
| **一括削除**   | spaces / news: hard delete（`deleteMany`）<br>events: soft delete（`deletedAt: now` + `deletedById: userId`） | 既存 delete command と同じ手法を `updateMany` / `deleteMany` で適用 |

### 領域固有の差分

#### spaces

- **状態フィールド**: `isPublished: Boolean` + `isActive: Boolean`（separate flag）
- **削除戦略**: hard delete（`prisma.space.deleteMany`）
- **FK 制約**: `Reservation.spaceId` に FK あり。残予約があるスペースは Prisma `P2003` エラー → catch して `skipped` 件数として toast 表示
- **キャッシュ無効化**: `CACHE_TAGS.SPACES` + 各 slug ごと `getCacheTag.spaces.detail(slug)` の cascade
- **監査ログ**: `resource: "space"`, `action: "publish" | "delete"`

#### events

- **状態フィールド**: `status: EventStatus` enum（DRAFT / PUBLISHED / CANCELLED / COMPLETED）
- **削除戦略**: soft delete（`deletedAt: new Date()` + `deletedById: userId`）— Event はソフトデリート対応済みのため
- **状態遷移制約**: bulk publish は **DRAFT のみ** が対象（CANCELLED / COMPLETED は skip）。bulk unpublish は **PUBLISHED のみ** が対象。bulk delete は全状態許可
- **キャッシュ無効化**: `invalidateEventCaches(id, slug)` の bulk 版を新設（または既存 helper を ids 配列で呼ぶループ）
- **監査ログ**: `resource: "event"`, `action: "publish" | "delete"`

#### news

- **状態フィールド**: `isPublished: Boolean` + `publishedAt: DateTime?`
- **削除戦略**: hard delete（`prisma.news.deleteMany`）
- **FK 制約**: `NewsVersion.newsId` の cascade delete のみ。外部 FK なし
- **キャッシュ無効化**: `CACHE_TAGS.NEWS` + 各 slug ごと `getCacheTag.news.detail(slug)`
- **監査ログ**: `resource: "news"`, `action: "publish" | "delete"`

---

## アーキテクチャ

### domain layer（`src/shared/domain/{spaces,events,news}/bulk-commands.ts`）

`src/shared/domain/posts/bulk-commands.ts` を参照実装として複製する。各ファイルに以下 2 関数を export:

```typescript
// spaces / news パターン
export async function bulkTogglePublishedSpacesCommand(
  ids: string[],
  publish: boolean,
): Promise<{ count: number; isPublished: boolean }>;

export async function bulkDeleteSpacesCommand(
  ids: string[],
): Promise<{ count: number; skipped: number }>;
```

```typescript
// events パターン（status enum + soft delete + actor）
export async function bulkPublishEventsCommand(
  ids: string[],
  publish: boolean,
): Promise<{ count: number; skipped: number; isPublished: boolean }>;

export async function bulkSoftDeleteEventsCommand(
  ids: string[],
  actor: { id: string },
): Promise<{ count: number }>;
```

**規律**:

- 全 command に `import "server-only"` 必須
- spaces hard delete は `try { deleteMany } catch (e) { if (P2003) skipped }` で skip 件数を返す
- events bulk publish は `where: { id: { in: ids }, status: { in: ALLOWED_STATUSES } }` で遷移制約を SQL レイヤーで担保
- events soft delete は `where: { id: { in: ids }, deletedAt: null }` で既削除を除外
- 影響を受けた slug 一覧（cache cascade 用）を 戻り値に含めるか、command 側で `select: { slug: true }` で取得して returnする

### action layer（`src/app/(admin)/admin/(dashboard)/_shared/actions/{space,event,news}/bulk.ts`）

`src/app/(admin)/admin/(dashboard)/_shared/actions/post/bulk.ts` を参照実装として複製。`executeAdminMutationResult` で wrap し、`afterSuccess` で `invalidate*Caches(...)` を呼ぶ:

```typescript
"use server";

export const bulkTogglePublishedSpaces = async (
  ids: string[],
  publish: boolean,
): Promise<MutationResult<{ count: number; isPublished: boolean }>> =>
  executeAdminMutationResult({
    resource: "space",
    action: "publish",
    execute: async () => bulkTogglePublishedSpacesCommand(ids, publish),
    afterSuccess: async (data) => {
      // CACHE_TAGS.SPACES + 影響 slug ごとの detail tag
      // 詳細 cascade は plan で確定
    },
  });
```

**規律**:

- `executeAdminMutationResult` の実行順序（`execute → await afterSuccess → fireAndForget(logAction)`）を破らない（ADR 0019）
- 監査ログは fire-and-forget（自動）。`await logAction` 化禁止
- Zod validation: `bulkInputSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(100) })` を inline 定義（または `_shared/lib/validations/bulk.ts` を新設して 3 領域共通化）

### UI layer（`{Space,Event,News}BulkActions.tsx`）

`PostBulkActions.tsx`（141 行）を参照実装として複製。差分:

- import 元（`bulkTogglePostPublished` → `bulkTogglePublishedSpaces` 等）
- toast メッセージ（「投稿」→「スペース」/「イベント」/「ニュース」）
- spaces 用は skip 件数を toast に併記（`成功 ${count} 件 / FK 制約でスキップ ${skipped} 件`）
- events 用は skip 件数を toast に併記（`成功 ${count} 件 / 状態遷移不可でスキップ ${skipped} 件`）
- 削除前確認 Dialog: `DeleteConfirmDialog` を流用（`pages/_components/BulkActions.tsx` パターン）

### Table layer（行 checkbox 統合）

各 `{Space,Event,News}Table.tsx` を以下のとおり改修:

1. `"use client"` 化（既に Client の場合スキップ）
2. `useState<string[]>([])` で `selectedIds` 管理
3. ヘッダーに `CheckboxCell`（`@/admin/components/table`、ADR 0022）を追加（all-select 切替）
4. 行頭に `<TableCell onClick={stopRowClick}><CheckboxCell .../></TableCell>` を追加
5. `<TableContainer>` 末尾（テーブル外）に `<{Space,Event,News}BulkActions selectedIds={selectedIds} onClear={() => setSelectedIds([])} />` を配置

**規律**:

- `CheckboxCell` の `aria-label` は意味ある識別子（タイトル / 名前）を渡す（`id.slice(0, 8)` 等の技術的識別子禁止）
- `ClickableTableRow` 採用済み行では checkbox セルに `onClick={stopRowClick}` を付ける（既存 P17 パターン）

---

## test 戦略

### unit test（`__tests__/unit/domain/{spaces,events,news}/bulk-commands.test.ts`）

- 正常系: ids が空配列 → `count: 0` を返す（DB 呼ばない）
- 正常系: 複数件 publish → 全件 isPublished = true / publishedAt 設定
- spaces FK 制約: `Reservation` が紐づくスペースは `skipped` カウントに計上
- events status filter: CANCELLED イベントは publish 対象外（skip）
- events soft delete: `deletedAt` セット + `deletedById` 記録

### integration test（`__tests__/integration/actions/admin/{space,event,news}-bulk.test.ts`）

- 認証: 未ログイン → `MutationError` 返却（401 相当）
- 権限: VIEWER role で実行 → 403 相当の error
- Zod validation: 100 件超 → validation error
- afterSuccess: `updateTag` が呼ばれる（mock で確認）
- 監査ログ: `logAction` が fire-and-forget で呼ばれる

### test バッチ追加

`package.json` の `test:unit` / `test:integration` スクリプトに新規ディレクトリのバッチ追加（既存 ADR 0010 規律準拠）:

- `bun test __tests__/unit/domain/spaces/bulk-commands.test.ts`
- `bun test __tests__/unit/domain/events/bulk-commands.test.ts`
- `bun test __tests__/unit/domain/news/bulk-commands.test.ts`
- `bun test __tests__/integration/actions/admin/space-bulk.test.ts`
- `bun test __tests__/integration/actions/admin/event-bulk.test.ts`
- `bun test __tests__/integration/actions/admin/news-bulk.test.ts`

domain test は per-file 単位、integration test は既存 `actions/admin` バッチに統合可能（mock.module 干渉が起きなければ）。

---

## 禁止事項

1. **bulk command を `'use server'` で export 禁止** — domain command は `import "server-only"`、Server Action は `_shared/actions/*/bulk.ts` で wrap する分離を維持
2. **`await logAction` 化禁止** — ADR 0019 違反、cache invalidation スキップの silent regression
3. **Phase 1 で一括ステータス変更（CANCEL / COMPLETE）追加禁止** — メール通知 / 状態遷移マップが必要、Phase 2 以降
4. **Phase 1 で復元（ゴミ箱）UI 追加禁止** — Spaces / News は hard delete 戦略のため復元不能、Events は既存 detail page から個別復元可能
5. **`<input type="checkbox">` 直書き禁止** — `CheckboxCell` 必須（ADR 0022、44px ヒットエリア）
6. **bulk action UI を ActionDropdown 内に追加禁止** — bulk バーは別配置（`fixed bottom-6 left-1/2 -translate-x-1/2 z-50`）
7. **Zod schema を `'use cache'` 関数の引数で渡さない** — 既存パターン違反

---

## Out of scope

- customers / inquiries / coupons の bulk 操作（Phase 2）
- 一括カテゴリ移動・タグ付け（Phase 3 候補）
- CSV エクスポート連携（既存 export ボタンと統合は別 plan）
- 復元（Recycle Bin）UI 新設

---

## 参考実装

| 領域                                         | 参考ファイル                                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| domain bulk command                          | `src/shared/domain/posts/bulk-commands.ts`                                                                   |
| admin Server Action                          | `src/app/(admin)/admin/(dashboard)/_shared/actions/post/bulk.ts`                                             |
| BulkActions UI（最小版）                     | `src/app/(admin)/admin/(dashboard)/posts/_components/PostBulkActions.tsx`                                    |
| BulkActions UI（DeleteConfirmDialog 統合版） | `src/app/(admin)/admin/(dashboard)/pages/_components/BulkActions.tsx`                                        |
| FAQ bulk（最も完成度高）                     | `src/app/(admin)/admin/(dashboard)/faq/_components/FaqBulkActions.tsx`                                       |
| ステータス遷移制約付き bulk                  | `src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationBulkActions.tsx`                      |
| Table 行 checkbox                            | `src/app/(admin)/admin/(dashboard)/faq/_components/FaqCategoryItemsTable.tsx`（行 checkbox + bulk バー連携） |

---

## ADR 採番

Phase 1 は既存 PostBulkActions パターンを踏襲する純粋な対称化のため、新 ADR は不要。本 spec + plan + handoff memory を canonical 記録とする。
