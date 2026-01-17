import Image from 'next/image'
import Link from 'next/link'
import { tv } from 'tailwind-variants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/site/ui'
import type { ReactElement } from 'react'
import type { SidebarPopularPost } from '@/actions/public/sidebar'

const styles = tv({
  slots: {
    list: 'space-y-4',
    item: 'flex gap-3 group',
    rank: 'flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm',
    thumbnail: 'relative w-16 h-16 flex-shrink-0 rounded overflow-hidden',
    image: 'object-cover transition-transform duration-300 group-hover:scale-110',
    content: 'flex-1 min-w-0',
    title: 'text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors',
    empty: 'text-sm text-muted-foreground',
  },
})()

interface PopularPostsWidgetProps {
  posts: SidebarPopularPost[]
}

/**
 * 人気記事ウィジェット
 */
export function PopularPostsWidget({ posts }: PopularPostsWidgetProps): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">人気記事</CardTitle>
      </CardHeader>
      <CardContent>
        {posts.length > 0 ? (
          <ul className={styles.list()}>
            {posts.map((post, index) => (
              <li key={post.id}>
                <Link href={`/blog/${post.slug}`} className={styles.item()}>
                  <div className={styles.rank()} aria-label={`第${index + 1}位`}>
                    {index + 1}
                  </div>
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
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty()}>人気記事はありません。</p>
        )}
      </CardContent>
    </Card>
  )
}
