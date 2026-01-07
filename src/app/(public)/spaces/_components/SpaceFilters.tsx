'use client'

/**
 * スペース検索フィルター
 *
 * @description nuqs useQueryStates を使用した URL State 管理のサンプル
 */

import { useQueryStates } from 'nuqs'
import { useTransition } from 'react'
import { tv } from 'tailwind-variants'
import { Input, Button } from '@/components/site/ui'
import { parseAsQuery, parseAsSortOrder, sortOrders } from '@/lib/nuqs'

const styles = tv({
  slots: {
    wrapper: 'flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between',
    searchWrapper: 'relative flex-1 max-w-md',
    searchIcon:
      'absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground',
    searchInput: 'pl-10',
    sortWrapper: 'flex items-center gap-2',
    sortLabel: 'text-sm text-muted-foreground whitespace-nowrap',
    sortSelect:
      'rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring',
    clearButton: 'text-sm',
  },
})()

export function SpaceFilters() {
  const [isPending, startTransition] = useTransition()

  // nuqs: 複数パラメータを同時に管理
  const [{ q, sort }, setParams] = useQueryStates(
    {
      q: parseAsQuery,
      sort: parseAsSortOrder,
    },
    {
      // shallow: false で Server Component を再レンダリング
      shallow: false,
      // ページ遷移時にスクロールをトップに戻さない
      scroll: false,
      // 変更時にページを1に戻す
      startTransition,
    }
  )

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setParams({ q: e.target.value || null })
  }

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as (typeof sortOrders)[number]
    setParams({ sort: value })
  }

  const handleClear = () => {
    setParams({ q: null, sort: null })
  }

  return (
    <div className={styles.wrapper()}>
      {/* 検索入力 */}
      <div className={styles.searchWrapper()}>
        <svg
          className={styles.searchIcon()}
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <Input
          type="search"
          placeholder="スペース名で検索..."
          value={q}
          onChange={handleSearchChange}
          className={styles.searchInput()}
          aria-label="スペースを検索"
        />
      </div>

      <div className="flex items-center gap-4">
        {/* ソート選択 */}
        <div className={styles.sortWrapper()}>
          <label htmlFor="sort" className={styles.sortLabel()}>
            並び順:
          </label>
          <select
            id="sort"
            value={sort}
            onChange={handleSortChange}
            className={styles.sortSelect()}
            disabled={isPending}
          >
            <option value="desc">新しい順</option>
            <option value="asc">古い順</option>
          </select>
        </div>

        {/* クリアボタン */}
        {(q || sort !== 'desc') && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={isPending}
            className={styles.clearButton()}
          >
            クリア
          </Button>
        )}
      </div>

      {/* ローディングインジケーター */}
      {isPending && (
        <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
          <span className="text-sm text-muted-foreground">読み込み中...</span>
        </div>
      )}
    </div>
  )
}
