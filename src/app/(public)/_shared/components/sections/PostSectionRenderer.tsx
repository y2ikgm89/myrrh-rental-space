/**
 * 投稿セクション（新API対応）
 *
 * HomepageSectionData.config から設定を受け取りレンダリング
 */

import Link from 'next/link'
import Image from 'next/image'
import { tv } from 'tailwind-variants'
import { Container, buttonVariants } from '@/public/components/ui'
import { getPublishedPosts } from '@/public/actions/post'
import { cn } from '@/shared/lib/utils'
import { generatePostUrl } from '@/shared/lib/url'
import type { PostsConfig } from '@/shared/lib/validations/homepage-section'
import type { ReactElement } from 'react'

const postSectionVariants = tv({
  slots: {
    section: 'py-16 sm:py-20 lg:py-24 bg-muted/30',
    header: 'text-center mb-12',
    sectionTitle: 'text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight',
    grid: 'grid gap-6 sm:grid-cols-2 lg:grid-cols-3',
    card: 'group bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow',
    imageWrapper: 'relative aspect-[16/10] overflow-hidden',
    image: 'object-cover transition-transform group-hover:scale-105',
    content: 'p-4 sm:p-6',
    postTitle:
      'font-semibold text-lg line-clamp-2 group-hover:text-primary transition-colors',
    excerpt: 'mt-2 text-sm text-muted-foreground line-clamp-2',
    date: 'mt-3 text-xs text-muted-foreground',
    footer: 'mt-10 text-center',
  },
})

const styles = postSectionVariants()

interface PostSectionRendererProps {
  title?: string | null
  config: PostsConfig
  postPrefix: string
}

export async function PostSectionRenderer({
  title: customTitle,
  config,
  postPrefix,
}: PostSectionRendererProps): Promise<ReactElement | null> {
  const posts = await getPublishedPosts({
    take: config.maxItems,
    orderBy: 'publishedAt',
  })

  if (posts.length === 0) {
    return null
  }

  const displayTitle = customTitle || config.title

  return (
    <section className={styles.section()}>
      <Container>
        <div className={styles.header()}>
          <h2 className={styles.sectionTitle()}>{displayTitle}</h2>
        </div>
        <div className={styles.grid()}>
          {posts.map((post: { id: string; title: string; slug: string; thumbnailUrl: string; excerpt: string | null; publishedAt: Date | null }, index: number) => (
            <Link key={post.id} href={generatePostUrl(post, { structure: 'post-name', prefix: postPrefix })} className={styles.card()}>
              <div className={styles.imageWrapper()}>
                <Image
                  src={post.thumbnailUrl || '/images/placeholder.jpg'}
                  alt={post.title}
                  fill
                  className={styles.image()}
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  priority={index === 0}
                  loading={index === 0 ? 'eager' : 'lazy'}
                />
              </div>
              <div className={styles.content()}>
                <h3 className={styles.postTitle()}>{post.title}</h3>
                {post.excerpt && <p className={styles.excerpt()}>{post.excerpt}</p>}
                <p className={styles.date()}>
                  {new Date(post.publishedAt!).toLocaleDateString('ja-JP', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
            </Link>
          ))}
        </div>
        {config.showViewAllLink && (
          <div className={styles.footer()}>
            <Link href={postPrefix || '/'} className={cn(buttonVariants({ variant: 'outline' }))}>
              投稿一覧を見る
            </Link>
          </div>
        )}
      </Container>
    </section>
  )
}
