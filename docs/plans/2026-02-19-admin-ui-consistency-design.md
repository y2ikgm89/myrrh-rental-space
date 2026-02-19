# 管理画面 UI/UX 一貫性統一 — 設計ドキュメント

**日付**: 2026-02-19  
**方針**: 破壊的変更OK・後方互換性不要・公式ベストプラクティス準拠 (Next.js 16 / React 19)

---

## 目標

管理画面の全一覧ページを統一されたパターンに揃え、一貫した UX・保守性を実現する。

---

## 確立する標準パターン

### A. ページレイアウト標準

```tsx
// page.tsx — 全一覧ページ共通構造
export default async function XxxPage({ searchParams }: PageProps) {
  return (
    <div className="space-y-6">
      {/* ヘッダー: 全ページ統一クラス */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">[タイトル]</h1>
          <p className="text-sm text-muted-foreground sm:text-base">[説明]</p>
        </div>
        {/* ボタンが必要な場合のみ */}
        <Button asChild className="min-h-10 sm:min-h-9">
          <Link href="/admin/xxx/new">
            <Plus className="mr-2 h-4 w-4" />新規作成
          </Link>
        </Button>
      </div>

      {/* フィルター — Suspense で囲む */}
      <Suspense fallback={<LoadingState variant="inline" />}>
        <XxxFilters />
      </Suspense>

      {/* データ + ページネーション — Suspense で囲む */}
      <Suspense fallback={<LoadingState />}>
        <XxxList searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

// 非同期データ取得コンポーネント (page.tsx 内 or _components/)
async function XxxList({ searchParams }) {
  const params = await searchParams
  const result = await getXxx(filters, pagination)
  return (
    <>
      <XxxTable items={result.items} />
      <Pagination currentPage={result.page} totalPages={result.totalPages} total={result.total} />
    </>
  )
}
```

### B. テーブルコンポーネント標準

```tsx
// _components/XxxTable.tsx
export function XxxTable({ items }: Props) {
  if (items.length === 0) {
    return <EmptyState message="..." action={{ label: '新規作成', href: '/admin/xxx/new' }} />
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">  {/* overflow-hidden 必須 */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ステータス</TableHead>         {/* ステータスは左寄り */}
            <TableHead>名称</TableHead>
            <TableHead className="hidden md:table-cell">日付</TableHead>  {/* md: で統一 */}
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map(item => (
            <TableRow key={item.id}>
              {/* ... */}
              <TableCell className="text-right">
                <Button variant="outline" size="sm" asChild>  {/* outline で統一 */}
                  <Link href={`/admin/xxx/${item.id}`}>詳細</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
```

### C. フィルターコンポーネント標準

**原則: `useFilterParams` (または `useFilterParamsWithCategory`) + `BaseFilters` を使う**

```tsx
// _components/XxxFilters.tsx
'use client'
import { BaseFilters } from '@/admin/components/table'
const STATUS_OPTIONS = [
  { value: 'ALL', label: 'すべて' },
  { value: 'ACTIVE', label: '有効' },
]
export function XxxFilters() {
  return <BaseFilters statusOptions={STATUS_OPTIONS} searchPlaceholder="..." />
}
```

**例外**: AuditLogFilters は日付範囲・複数セレクトが必要なため `useQueryStates` 直接使用を維持するが、フォームsubmit→リアクティブ更新に変更。

### D. ステータスバッジ標準

全バッジ定義を `_shared/components/status-badges.tsx` に集約。  
ページごとのインライン定義は禁止。

---

## 変更スコープ

### カテゴリ1: CSS クラス修正 (外科的修正)

| ファイル | 修正内容 |
|---------|---------|
| `coupons/page.tsx` | ヘッダー flex + 説明文クラス + Button min-h |
| `inquiries/page.tsx` | ヘッダー flex + 説明文クラス |
| `faq/page.tsx` | ヘッダー flex + 説明文クラス + Button min-h |
| `spaces/page.tsx` | ヘッダー flex + 説明文クラス |
| `pages/page.tsx` | ヘッダー flex + 説明文クラス + Button min-h |
| `pages/_components/PageListTable.tsx` | `overflow-hidden` 追加 |

### カテゴリ2: コンポーネント抽出 (staff / audit-logs)

#### staff ページ (現状: 1ファイルに全ロジック + Card多重ラップ)

**新規作成:**
- `staff/_components/StaffStats.tsx` — 4メトリクスカード (Server Component)
- `staff/_components/StaffFilters.tsx` — `useFilterParams` + roleフィルター (Client Component)
- `staff/_components/StaffTable.tsx` — ユーザーテーブル + EmptyState (Server Component)
- `staff/_components/InvitationTable.tsx` — 招待中テーブル (Server Component)

**変更:**
- `staff/page.tsx` — Suspense + 新コンポーネント使用。Card多重ラップ除去。標準ヘッダー
- `_shared/components/status-badges.tsx` — `RoleBadge` を追加 (inline定義から移動)

#### audit-logs ページ (現状: 全コードがpage.tsx + Card多重ラップ + フォームsubmit)

**新規作成:**
- `audit-logs/_components/AuditLogStats.tsx` — 4メトリクスカード (Server Component)
- `audit-logs/_components/AuditLogTable.tsx` — ログテーブル + EmptyState (Server Component)

**変更:**
- `audit-logs/page.tsx` — Suspense + 新コンポーネント使用。Card多重ラップ除去
- `audit-logs/_components/AuditLogFilters.tsx` — フォームsubmit → リアクティブ nuqs
- `_shared/components/status-badges.tsx` — `AuditActionBadge` を追加 (inline定義から移動)

### カテゴリ3: フィルター実装の共通化 (CouponFilters)

**変更:**
- `coupons/_components/CouponFilters.tsx` — 自前デバウンス → `useFilterParams` + 独自セレクト

---

## 変更しない箇所 (意図的に異なるパターン)

| ページ | 理由 |
|--------|------|
| `media` | グリッドレイアウト — メディア管理の UX に最適 |
| `faq` | ツリー/アコーディオン表示 — 階層構造に最適 |
| `settings` | カードグリッド — ナビゲーション用途で意図的に異なる |
| `news`, `posts`, `spaces` | タブ構造 — 複数リソースの統合管理に最適 |
| `pages` | チェックボックス + 一括操作 — ページ管理の特殊要件 |

---

## 影響ファイル一覧

**変更 (14ファイル):**
1. `coupons/page.tsx`
2. `coupons/_components/CouponFilters.tsx`
3. `inquiries/page.tsx`
4. `faq/page.tsx`
5. `spaces/page.tsx`
6. `pages/page.tsx`
7. `pages/_components/PageListTable.tsx`
8. `staff/page.tsx`
9. `audit-logs/page.tsx`
10. `audit-logs/_components/AuditLogFilters.tsx`
11. `_shared/components/status-badges.tsx`

**新規作成 (8ファイル):**
12. `staff/_components/StaffStats.tsx`
13. `staff/_components/StaffFilters.tsx`
14. `staff/_components/StaffTable.tsx`
15. `staff/_components/InvitationTable.tsx`
16. `audit-logs/_components/AuditLogStats.tsx`
17. `audit-logs/_components/AuditLogTable.tsx`

合計: ~22ファイル変更/作成

---

## 検証計画

1. `bun run type-check` — 型エラーなし
2. `bun run lint` — ESLint エラーなし
3. `bun run validate` — 両方同時通過
4. 各ページの手動動作確認 (フィルター・ページネーション・EmptyState)
