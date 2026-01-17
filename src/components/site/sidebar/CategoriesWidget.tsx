import Link from 'next/link'
import { tv } from 'tailwind-variants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/site/ui'
import type { ReactElement } from 'react'
import type { SidebarCategory } from '@/actions/public/sidebar'

const styles = tv({
  slots: {
    list: 'space-y-2',
    item: 'flex items-center justify-between py-2 px-3 rounded hover:bg-accent transition-colors group',
    name: 'text-sm text-foreground group-hover:text-primary transition-colors',
    count: 'text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full',
    empty: 'text-sm text-muted-foreground',
  },
})()

interface CategoriesWidgetProps {
  categories: SidebarCategory[]
}

/**
 * カテゴリーウィジェット
 */
export function CategoriesWidget({ categories }: CategoriesWidgetProps): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">カテゴリー</CardTitle>
      </CardHeader>
      <CardContent>
        {categories.length > 0 ? (
          <ul className={styles.list()}>
            {categories.map((category) => (
              <li key={category.id}>
                <Link href={`/blog?category=${category.slug}`} className={styles.item()}>
                  <span className={styles.name()}>{category.name}</span>
                  <span className={styles.count()} aria-label={`${category.postCount}件の記事`}>
                    {category.postCount}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty()}>カテゴリーはありません。</p>
        )}
      </CardContent>
    </Card>
  )
}
