import Image from 'next/image'
import Link from 'next/link'
import { tv } from 'tailwind-variants'
import { Card, CardContent, CardHeader, CardTitle } from '@/public/components/ui'
import type { ReactElement } from 'react'
import type { SidebarRecentPost } from '@/public/actions/sidebar'

const styles = tv({
  slots: {
    list: 'space-y-4',
    item: 'flex gap-3 group',
    thumbnail: 'relative w-16 h-16 flex-shrink-0 rounded overflow-hidden',
    image: 'object-cover transition-transform duration-300 group-hover:scale-110',
    content: 'flex-1 min-w-0',
    title: 'text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors',
    date: 'text-xs text-muted-foreground mt-1',
    empty: 'text-sm text-muted-foreground',
  },
})()

interface RecentPostsWidgetProps {
  posts: SidebarRecentPost[]
}

/**
 * 公開日を表示用に整形する
 */
function formatPublishedDate(value: Date): string {
  return value.toLocaleDateString('ja-JP')
}

/**
 * 新着記事ウィジェット
 */
export function RecentPostsWidget({ posts }: RecentPostsWidgetProps): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">新着記事</CardTitle>
      </CardHeader>
      <CardContent>
        {posts.length > 0 ? (
          <ul className={styles.list()}>
            {posts.map((post) => (
              <li key={post.id}>
                <Link href={`/blog/${post.slug}`} className={styles.item()}>
                  <div className={styles.thumbnail()}>
                    <Image
                      src={post.thumbnailUrl}
                      alt={post.title}
                      fill
                      sizes="64px"
                      className={styles.image()}
                    />
                  </div>
                  <div className={styles.content()}>
                    <h3 className={styles.title()}>{post.title}</h3>
                    <p className={styles.date()}>{formatPublishedDate(post.publishedAt)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty()}>新着記事はありません。</p>
        )}
      </CardContent>
    </Card>
  )
}
