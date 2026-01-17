'use client'

import { useTransition, type ChangeEvent, type FormEvent, type ReactElement } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useQueryStates } from 'nuqs'
import { tv } from 'tailwind-variants'
import { Card, CardContent, CardHeader, CardTitle, Input } from '@/components/site/ui'
import { parseAsCommaSeparated, parseAsPage, parseAsQuery, parseAsSortOrder } from '@/lib/nuqs'

const styles = tv({
  slots: {
    searchWrapper: 'relative',
    searchIcon: 'absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground',
    searchInput: 'pl-10',
    pending: 'mt-2 text-xs text-muted-foreground',
  },
})()

/**
 * 検索ウィジェット
 *
 * @description nuqs を使用して ?q= パラメータを更新
 * ブログ一覧以外のページでは /blog へナビゲーション
 */
export function SearchWidget(): ReactElement {
  const [isPending, startTransition] = useTransition()
  const pathname = usePathname()
  const router = useRouter()
  const isOnBlogList = pathname === '/blog'

  const [{ q }, setParams] = useQueryStates(
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
      throttleMs: 500,
      startTransition,
    }
  )

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>): void => {
    // ブログ一覧ページでのみリアルタイム検索
    if (isOnBlogList) {
      setParams({ q: event.target.value || null, page: null })
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const searchValue = formData.get('q') as string

    if (!isOnBlogList && searchValue) {
      // ブログ一覧以外のページでは /blog へナビゲーション
      startTransition(() => {
        router.push(`/blog?q=${encodeURIComponent(searchValue)}`)
      })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">検索</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
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
              name="q"
              placeholder="キーワードで検索..."
              defaultValue={isOnBlogList ? q : ''}
              onChange={handleSearchChange}
              className={styles.searchInput()}
              aria-label="ブログを検索"
              disabled={isPending}
            />
          </div>
          {isPending && <p className={styles.pending()}>検索中...</p>}
        </form>
      </CardContent>
    </Card>
  )
}
