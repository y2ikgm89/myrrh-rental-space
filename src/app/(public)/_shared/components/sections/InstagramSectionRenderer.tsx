/**
 * Instagram セクションレンダラー
 *
 * HomepageSectionData.config から設定を受け取り、Instagramフィードをレンダリング
 * Next.js 16 PPR対応: use cache ディレクティブでキャッシュ
 */

import Image from 'next/image'
import { cacheLife, cacheTag } from 'next/cache'
import { tv } from 'tailwind-variants'
import { ExternalLink, Instagram } from 'lucide-react'
import { Container, buttonVariants } from '@/public/components/ui'
import { prisma } from '@/shared/lib/prisma'
import { safeDecrypt } from '@/shared/lib/crypto'
import { fetchInstagramFeed, type InstagramMediaItem } from '@/admin/lib/instagram'
import { logger } from '@/shared/lib/logger'
import { cn } from '@/shared/lib/utils'
import type { InstagramConfig } from '@/shared/lib/validations/homepage-section'
import type { ReactElement } from 'react'

// =============================================================================
// Styles
// =============================================================================

const instagramSectionVariants = tv({
  slots: {
    section: 'py-16 sm:py-20 lg:py-24 bg-muted/30',
    header: 'text-center mb-12',
    sectionTitle: 'text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight',
    gridContainer: 'grid gap-4',
    carouselContainer: 'flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide',
    carouselItem: 'flex-shrink-0 w-64 snap-start',
    cardContainer: 'grid gap-6 sm:grid-cols-2 lg:grid-cols-3',
    mediaWrapper: 'relative aspect-square overflow-hidden rounded-lg group',
    mediaImage: 'object-cover transition-transform duration-300 group-hover:scale-105',
    mediaOverlay:
      'absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-300 flex items-center justify-center',
    mediaIcon: 'text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300',
    caption: 'mt-2 text-sm text-muted-foreground line-clamp-2',
    cardWrapper: 'bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow',
    cardContent: 'p-4',
    footer: 'mt-10 text-center',
    emptyState: 'text-center py-12 text-muted-foreground',
  },
  variants: {
    columns: {
      2: { gridContainer: 'grid-cols-2' },
      3: { gridContainer: 'grid-cols-2 sm:grid-cols-3' },
      4: { gridContainer: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4' },
      5: { gridContainer: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5' },
      6: { gridContainer: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6' },
    },
  },
  defaultVariants: {
    columns: 4,
  },
})

// =============================================================================
// Types
// =============================================================================

interface InstagramSettings {
  instagramAccessToken: string | null
  instagramFeedEnabled: boolean
  instagramFeedLayout: string | null
  instagramFeedColumns: number
  instagramFeedMaxItems: number
  instagramShowCaption: boolean
  instagramShowViewAll: boolean
  instagramUsername: string | null
}

type FeedLayout = 'grid' | 'carousel' | 'card'

// =============================================================================
// Data Fetching
// =============================================================================

async function getInstagramData(): Promise<{
  feed: InstagramMediaItem[]
  settings: InstagramSettings | null
}> {
  'use cache'
  cacheLife('hours')
  cacheTag('instagram-feed')

  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'singleton' },
      select: {
        instagramAccessToken: true,
        instagramFeedEnabled: true,
        instagramFeedLayout: true,
        instagramFeedColumns: true,
        instagramFeedMaxItems: true,
        instagramShowCaption: true,
        instagramShowViewAll: true,
        instagramUsername: true,
      },
    })

    if (!settings?.instagramAccessToken || !settings.instagramFeedEnabled) {
      return { feed: [], settings: null }
    }

    const token = safeDecrypt(settings.instagramAccessToken)
    if (!token) {
      logger.error('InstagramSectionRenderer: Failed to decrypt token')
      return { feed: [], settings: null }
    }

    const feed = await fetchInstagramFeed(token, settings.instagramFeedMaxItems)

    return { feed, settings }
  } catch (error) {
    logger.error('InstagramSectionRenderer: Failed to fetch Instagram feed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return { feed: [], settings: null }
  }
}

// =============================================================================
// Sub Components
// =============================================================================

interface MediaItemProps {
  item: InstagramMediaItem
  showCaption: boolean
  priority?: boolean
}

function GridMediaItem({ item, showCaption, priority = false }: MediaItemProps): ReactElement {
  const styles = instagramSectionVariants()

  return (
    <a
      href={item.permalink}
      target="_blank"
      rel="noopener noreferrer"
      className="block"
    >
      <div className={styles.mediaWrapper()}>
        <Image
          src={item.mediaType === 'VIDEO' ? (item.thumbnailUrl || item.mediaUrl) : item.mediaUrl}
          alt={item.caption || 'Instagram post'}
          fill
          className={styles.mediaImage()}
          sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
          priority={priority}
          loading={priority ? 'eager' : 'lazy'}
        />
        <div className={styles.mediaOverlay()}>
          <ExternalLink className={cn(styles.mediaIcon(), 'h-6 w-6')} />
        </div>
      </div>
      {showCaption && item.caption && (
        <p className={styles.caption()}>{item.caption}</p>
      )}
    </a>
  )
}

function CarouselMediaItem({ item, showCaption, priority = false }: MediaItemProps): ReactElement {
  const styles = instagramSectionVariants()

  return (
    <a
      href={item.permalink}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.carouselItem()}
    >
      <div className={styles.mediaWrapper()}>
        <Image
          src={item.mediaType === 'VIDEO' ? (item.thumbnailUrl || item.mediaUrl) : item.mediaUrl}
          alt={item.caption || 'Instagram post'}
          fill
          className={styles.mediaImage()}
          sizes="256px"
          priority={priority}
          loading={priority ? 'eager' : 'lazy'}
        />
        <div className={styles.mediaOverlay()}>
          <ExternalLink className={cn(styles.mediaIcon(), 'h-6 w-6')} />
        </div>
      </div>
      {showCaption && item.caption && (
        <p className={styles.caption()}>{item.caption}</p>
      )}
    </a>
  )
}

function CardMediaItem({ item, showCaption, priority = false }: MediaItemProps): ReactElement {
  const styles = instagramSectionVariants()

  return (
    <a
      href={item.permalink}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.cardWrapper()}
    >
      <div className={styles.mediaWrapper()}>
        <Image
          src={item.mediaType === 'VIDEO' ? (item.thumbnailUrl || item.mediaUrl) : item.mediaUrl}
          alt={item.caption || 'Instagram post'}
          fill
          className={styles.mediaImage()}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          priority={priority}
          loading={priority ? 'eager' : 'lazy'}
        />
        <div className={styles.mediaOverlay()}>
          <ExternalLink className={cn(styles.mediaIcon(), 'h-6 w-6')} />
        </div>
      </div>
      {showCaption && item.caption && (
        <div className={styles.cardContent()}>
          <p className="text-sm text-muted-foreground line-clamp-3">{item.caption}</p>
        </div>
      )}
    </a>
  )
}

// =============================================================================
// Main Component
// =============================================================================

interface InstagramSectionRendererProps {
  title?: string | null
  config: InstagramConfig
}

export async function InstagramSectionRenderer({
  title: customTitle,
  config,
}: InstagramSectionRendererProps): Promise<ReactElement | null> {
  const { feed, settings } = await getInstagramData()

  // 連携されていないか、フィードが空の場合は何も表示しない
  if (!settings || feed.length === 0) {
    return null
  }

  const displayTitle = customTitle || config.title
  const layout = (settings.instagramFeedLayout || 'grid') as FeedLayout
  const columns = settings.instagramFeedColumns as 2 | 3 | 4 | 5 | 6
  const showCaption = settings.instagramShowCaption
  const showViewAll = settings.instagramShowViewAll
  const username = settings.instagramUsername

  const styles = instagramSectionVariants({ columns })

  const renderFeed = () => {
    switch (layout) {
      case 'carousel':
        return (
          <div className={styles.carouselContainer()}>
            {feed.map((item, index) => (
              <CarouselMediaItem
                key={item.id}
                item={item}
                showCaption={showCaption}
                priority={index < 4}
              />
            ))}
          </div>
        )

      case 'card':
        return (
          <div className={styles.cardContainer()}>
            {feed.map((item, index) => (
              <CardMediaItem
                key={item.id}
                item={item}
                showCaption={showCaption}
                priority={index < 3}
              />
            ))}
          </div>
        )

      case 'grid':
      default:
        return (
          <div className={styles.gridContainer()}>
            {feed.map((item, index) => (
              <GridMediaItem
                key={item.id}
                item={item}
                showCaption={showCaption}
                priority={index < 4}
              />
            ))}
          </div>
        )
    }
  }

  return (
    <section className={styles.section()}>
      <Container>
        <div className={styles.header()}>
          <h2 className={styles.sectionTitle()}>{displayTitle}</h2>
        </div>

        {renderFeed()}

        {showViewAll && username && (
          <div className={styles.footer()}>
            <a
              href={`https://www.instagram.com/${username}/`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: 'outline' }), 'inline-flex items-center gap-2')}
            >
              <Instagram className="h-4 w-4" />
              @{username} をフォロー
            </a>
          </div>
        )}
      </Container>
    </section>
  )
}
