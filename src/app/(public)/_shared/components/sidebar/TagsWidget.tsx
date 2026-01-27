import Link from 'next/link'
import { tv } from 'tailwind-variants'
import { Card, CardContent, CardHeader, CardTitle } from '@/public/components/ui'
import { generatePostListUrl } from '@/shared/lib/url'
import type { ReactElement } from 'react'
import type { SidebarTag } from '@/public/actions/sidebar'

const baseStyles = tv({
  slots: {
    tagCloud: 'flex flex-wrap gap-2',
    empty: 'text-sm text-muted-foreground',
  },
})()

const tagStyles = tv({
  base: 'inline-flex items-center rounded-full bg-muted px-3 py-1.5 transition-colors hover:bg-primary hover:text-primary-foreground',
  variants: {
    size: {
      xs: 'text-xs',
      sm: 'text-sm',
      md: 'text-base',
      lg: 'text-lg',
    },
  },
})

interface TagsWidgetProps {
  tags: SidebarTag[]
  postPrefix: string
}

/**
 * タグの使用回数に基づいてサイズを計算
 */
function calculateTagSize(count: number, maxCount: number): 'xs' | 'sm' | 'md' | 'lg' {
  const ratio = count / maxCount
  if (ratio >= 0.75) return 'lg'
  if (ratio >= 0.5) return 'md'
  if (ratio >= 0.25) return 'sm'
  return 'xs'
}

/**
 * タグウィジェット（タグクラウド形式）
 */
export function TagsWidget({ tags, postPrefix }: TagsWidgetProps): ReactElement {
  const maxCount = Math.max(...tags.map((tag) => tag.postCount), 1)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">タグ</CardTitle>
      </CardHeader>
      <CardContent>
        {tags.length > 0 ? (
          <div className={baseStyles.tagCloud()}>
            {tags.map((tag) => {
              const count = tag.postCount
              const size = calculateTagSize(count, maxCount)

              return (
                <Link
                  key={tag.slug}
                  href={generatePostListUrl(postPrefix, { tags: tag.slug })}
                  className={tagStyles({ size })}
                  aria-label={`${tag.name}（${count}件）`}
                >
                  #{tag.name}
                </Link>
              )
            })}
          </div>
        ) : (
          <p className={baseStyles.empty()}>タグはありません。</p>
        )}
      </CardContent>
    </Card>
  )
}
