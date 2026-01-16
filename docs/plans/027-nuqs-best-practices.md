# 027: nuqs ベストプラクティス準拠

## 概要

プロジェクト全体のnuqs実装を公式ベストプラクティスに準拠するよう改善。

## 背景

- nuqs v2.8.6 を使用中
- 基本的な実装は正しいが、一部の推奨設定が欠落
- 管理画面でのパーサー定義が分散していた

## 実施内容

### 1. history: 'push' 追加（UX改善）

**目的**: ページネーション時にブラウザの戻る/進むボタンでページ間を移動可能にする

**変更ファイル**:
- `src/app/(public)/blog/_components/blog-pagination.tsx`
- `src/app/(public)/spaces/_components/Pagination.tsx`
- `src/app/(public)/news/_components/NewsPagination.tsx`

```typescript
// Before
const [, setPage] = useQueryState('page', {
  ...parseAsPage,
  shallow: false,
  scroll: true,
  startTransition,
})

// After
const [, setPage] = useQueryState('page', {
  ...parseAsPage,
  shallow: false,
  scroll: true,
  history: 'push',  // 追加
  startTransition,
})
```

### 2. throttleMs 追加（パフォーマンス改善）

**目的**: 検索入力時のサーバーリクエストをスロットリングし、過度なリクエストを防止

**変更ファイル**:
- `src/app/(public)/blog/_components/blog-filters.tsx`
- `src/app/(public)/spaces/_components/SpaceFilters.tsx`

```typescript
// Before
const [{ q, ... }, setParams] = useQueryStates({...}, {
  shallow: false,
  scroll: false,
  startTransition,
})

// After
const [{ q, ... }, setParams] = useQueryStates({...}, {
  shallow: false,
  scroll: false,
  throttleMs: 500,  // 追加
  startTransition,
})
```

### 3. 管理画面パーサー集約

**目的**: 管理画面で個別定義されていたパーサーを`src/lib/nuqs/`に集約し、再利用性を向上

**変更ファイル**:
- `src/lib/nuqs/search-params.ts` - 管理画面用SearchParams追加
- `src/lib/nuqs/index.ts` - エクスポート追加

**追加されたSearchParams**:
- `adminUserSearchParams` / `loadAdminUserSearchParams`
- `adminAuditLogSearchParams` / `loadAdminAuditLogSearchParams`

### 4. createLoader パターン統一

**目的**: 管理画面で`createSearchParamsCache.parse()`を直接使用していた箇所を`createLoader`パターンに統一

**変更ファイル**:
- `src/app/(admin)/admin/(dashboard)/users/page.tsx`
- `src/app/(admin)/admin/(dashboard)/audit-logs/page.tsx`

```typescript
// Before
import { parseAsInteger, parseAsString, createSearchParamsCache } from 'nuqs/server'

const searchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  // ...
})

const params = await searchParamsCache.parse(searchParams)

// After
import { loadAdminUserSearchParams } from '@/lib/nuqs'

const params = await loadAdminUserSearchParams(searchParams)
```

### 5. 管理画面Pagination nuqs移行

**目的**: 管理画面のPaginationコンポーネントを公開ページと同じnuqsパターンに統一

**変更ファイル**:
- `src/components/admin/ui/Pagination.tsx`
- `src/components/admin/ui/index.ts` (インポートパス修正)

```typescript
// Before: router.push直接使用
const router = useRouter()
const searchParams = useSearchParams()
const goToPage = (page: number) => {
  const params = new URLSearchParams(searchParams.toString())
  params.set('page', String(page))
  router.push(`${pathname}?${params.toString()}`)
}

// After: nuqs統一
const [, setPage] = useQueryState('page', {
  ...parseAsPage,
  shallow: false,
  history: 'push',
  startTransition,
})
const goToPage = (page: number) => {
  setPage(page === 1 ? null : page)
}
```

## テスト結果

- [x] type-check 成功
- [x] lint 成功
- [x] build 成功

## nuqs 準拠状況（改善後）

| 項目 | 状況 |
|------|------|
| NuqsAdapter設定 | ✅ OK |
| createLoader使用 | ✅ OK |
| createSearchParamsCache使用 | ✅ OK |
| カスタムパーサー定義 | ✅ OK |
| useQueryStates バッチ更新 | ✅ OK |
| startTransition統合 | ✅ OK |
| shallow: false設定 | ✅ OK |
| scroll: true設定（Pagination） | ✅ OK |
| **history: 'push'** | ✅ **NEW** |
| **throttleMs** | ✅ **NEW** |
| **パーサー集約管理** | ✅ **NEW** |
| **createLoaderパターン統一** | ✅ **NEW** |
| **管理画面Pagination nuqs統一** | ✅ **NEW** |

## 改善の効果

1. **UX改善**: ページネーション時にブラウザ履歴が正しく機能
2. **パフォーマンス**: 検索入力時のサーバーリクエスト削減
3. **保守性**: パーサー定義の一元管理により変更が容易
4. **一貫性**: 全ページで同じパターンを使用

## 参考リンク

- [nuqs 公式ドキュメント](https://nuqs.dev/)
- [nuqs Server-side rendering](https://nuqs.dev/docs/server-side)
- [nuqs Options](https://nuqs.dev/docs/options)
