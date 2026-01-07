'use client'

/**
 * ブログ検索フィルター
 *
 * @description nuqs useQueryStates を使用した URL State 管理のサンプル
 */

import { useTransition } from 'react'
import { useQueryStates } from 'nuqs'
import { tv } from 'tailwind-variants'
import { Button, Input } from '@/components/site/ui'
import {
  parseAsCommaSeparated,
  parseAsPage,
  parseAsQuery,
  parseAsSortOrder,
  sortOrders,
} from '@/lib/nuqs'
import type { BlogCategory, BlogTag } from '@/generated/prisma/client/client'
import type { ReactElement } from 'react'

const styles = tv({
  slots: {
    wrapper: 'flex flex-col gap-6',
    row: 'flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between',
    searchWrapper: 'relative flex-1 max-w-md',
    searchIcon:
      'absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground',
    searchInput: 'pl-10',
    controlGroup: 'flex flex-wrap items-center gap-4',
    selectWrapper: 'flex items-center gap-2',
    selectLabel: 'text-sm text-muted-foreground whitespace-nowrap',
    select:
      'rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring',
    tagList: 'flex flex-wrap gap-2',
    tagButton: 'text-xs',
    clearButton: 'text-sm',
    pending: 'text-sm text-muted-foreground',
  },
})()

interface BlogFiltersProps {
  categories: BlogCategory[]
  tags: BlogTag[]
}

export function BlogFilters({
  categories,
  tags,
}: BlogFiltersProps): ReactElement {
  const [isPending, startTransition] = useTransition()

  const [{ q, category, tags: selectedTags, sort }, setParams] = useQueryStates(
    {
      q: parseAsQuery,
      category: parseAsQuery,
      tags: parseAsCommaSeparated,
      page: parseAsPage,
      sort: parseAsSortOrder,
    },
    {
      shallow: false,
      scroll: false,
      startTransition,
    }
  )

  const normalizedTags = Array.isArray(selectedTags) ? selectedTags : []
  const hasActiveFilters =
    q.length > 0 ||
    category.length > 0 ||
    normalizedTags.length > 0 ||
    sort !== 'desc'

  const handleSearchChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ): void => {
    setParams({ q: event.target.value || null, page: null })
  }

  const handleCategoryChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ): void => {
    const value = event.target.value
    setParams({ category: value || null, page: null })
  }

  const handleSortChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ): void => {
    const value = event.target.value as (typeof sortOrders)[number]
    setParams({ sort: value })
  }

  const handleTagToggle = (slug: string): void => {
    const nextTags = normalizedTags.includes(slug)
      ? normalizedTags.filter((tag) => tag !== slug)
      : [...normalizedTags, slug]

    setParams({ tags: nextTags.length > 0 ? nextTags : null, page: null })
  }

  const handleClear = (): void => {
    setParams({
      q: null,
      category: null,
      tags: null,
      sort: null,
      page: null,
    })
  }

  return (
    <div className={styles.wrapper()}>
      <div className={styles.row()}>
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
            placeholder="キーワードで検索..."
            value={q}
            onChange={handleSearchChange}
            className={styles.searchInput()}
            aria-label="ブログを検索"
          />
        </div>

        <div className={styles.controlGroup()}>
          <div className={styles.selectWrapper()}>
            <label htmlFor="category" className={styles.selectLabel()}>
              カテゴリ:
            </label>
            <select
              id="category"
              value={category}
              onChange={handleCategoryChange}
              className={styles.select()}
              disabled={isPending}
            >
              <option value="">すべて</option>
              {categories.map((item) => (
                <option key={item.id} value={item.slug}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.selectWrapper()}>
            <label htmlFor="sort" className={styles.selectLabel()}>
              並び順:
            </label>
            <select
              id="sort"
              value={sort}
              onChange={handleSortChange}
              className={styles.select()}
              disabled={isPending}
            >
              <option value="desc">新しい順</option>
              <option value="asc">古い順</option>
            </select>
          </div>

          {hasActiveFilters && (
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
      </div>

      <div>
        <p className={styles.selectLabel()}>タグ:</p>
        {tags.length > 0 ? (
          <div className={styles.tagList()}>
            {tags.map((tag) => {
              const isActive = normalizedTags.includes(tag.slug)
              return (
                <Button
                  key={tag.id}
                  type="button"
                  size="sm"
                  variant={isActive ? 'primary' : 'outline'}
                  onClick={() => handleTagToggle(tag.slug)}
                  disabled={isPending}
                  className={styles.tagButton()}
                  aria-pressed={isActive}
                >
                  #{tag.name}
                </Button>
              )
            })}
          </div>
        ) : (
          <p className={styles.pending()}>タグが登録されていません。</p>
        )}
      </div>

      {isPending && <p className={styles.pending()}>読み込み中...</p>}
    </div>
  )
}
