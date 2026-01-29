/**
 * ページセクションレンダラー
 *
 * PageSectionDataに基づいて適切なセクションコンポーネントをレンダリング
 */

import { Suspense, type ReactElement } from 'react'
import {
  PageSectionType,
  getHeroConfig,
  getCustomConfig,
  getContactFormConfig,
  getFaqListConfig,
  getSpaceListConfig,
  getNewsListConfig,
  getPostListConfig,
  getCtaConfig,
  getGalleryConfig,
  getTestimonialConfig,
  getMapConfig,
  getEmbedConfig,
} from '@/shared/lib/validations/page-section'
import { ContentRenderer } from '@/public/components/ContentRenderer'

// 既存のセクションコンポーネントを再利用
import { HeroSection } from '../sections/HeroSection'
import { SpaceListSection } from '../sections/SpaceListSection'
import { NewsSectionRenderer } from '../sections/NewsSectionRenderer'
import { PostSectionRenderer } from '../sections/PostSectionRenderer'
import { FAQSectionRenderer } from '../sections/FAQSectionRenderer'
import { CTASectionRenderer } from '../sections/CTASectionRenderer'
import { CustomSection } from '../sections/CustomSection'

// ページセクション専用コンポーネント
import { ContactFormSection } from './ContactFormSection'
import { GallerySection } from './GallerySection'
import { TestimonialSection } from './TestimonialSection'
import { MapSection } from './MapSection'
import { EmbedSection } from './EmbedSection'

/**
 * PageSectionData型（Server Actionsから取得）
 *
 * Prismaから取得したセクションデータの型
 * $Enumsの型を直接使用することで型アサーションを回避
 */
export interface PageSectionData {
  id: string
  pageId: string
  type: PageSectionType | string  // Prisma enumとstring unionを受け入れ
  title: string | null
  config: unknown
  content: string | null
  order: number
  isActive?: boolean  // 公開ページでは常にtrue（フィルタ済み）のためオプショナル
}

interface PageSectionRendererProps {
  section: PageSectionData
  postPrefix?: string
}

export function PageSectionRenderer({
  section,
  postPrefix = 'posts',
}: PageSectionRendererProps): ReactElement | null {
  switch (section.type) {
    case PageSectionType.HERO: {
      const config = getHeroConfig(section.config)
      return (
        <HeroSection
          config={{
            ...config,
            title: config.title || '',
          }}
        />
      )
    }

    case PageSectionType.CUSTOM: {
      const config = getCustomConfig(section.config)
      return (
        <CustomSection
          title={section.title}
          content={section.content}
          config={config}
          contentSlot={
            section.content ? (
              <Suspense fallback={<ContentRenderer html={section.content} />}>
                <ContentRenderer html={section.content} />
              </Suspense>
            ) : undefined
          }
        />
      )
    }

    case PageSectionType.CONTACT_FORM: {
      const config = getContactFormConfig(section.config)
      return (
        <Suspense fallback={<div className="py-12 md:py-16 text-center">読み込み中...</div>}>
          <ContactFormSection
            title={section.title || config.title}
            config={config}
          />
        </Suspense>
      )
    }

    case PageSectionType.FAQ_LIST: {
      const config = getFaqListConfig(section.config)
      return (
        <FAQSectionRenderer
          title={section.title || config.title}
          config={config}
        />
      )
    }

    case PageSectionType.SPACE_LIST: {
      const config = getSpaceListConfig(section.config)
      return (
        <SpaceListSection
          title={section.title || config.title}
          config={config}
        />
      )
    }

    case PageSectionType.NEWS_LIST: {
      const config = getNewsListConfig(section.config)
      return (
        <NewsSectionRenderer
          title={section.title || config.title}
          config={config}
        />
      )
    }

    case PageSectionType.POST_LIST: {
      const config = getPostListConfig(section.config)
      return (
        <PostSectionRenderer
          title={section.title || config.title}
          config={config}
          postPrefix={postPrefix}
        />
      )
    }

    case PageSectionType.CTA: {
      const config = getCtaConfig(section.config)
      return (
        <CTASectionRenderer config={config} />
      )
    }

    case PageSectionType.GALLERY: {
      const config = getGalleryConfig(section.config)
      return (
        <GallerySection
          title={section.title || config.title}
          config={config}
        />
      )
    }

    case PageSectionType.TESTIMONIAL: {
      const config = getTestimonialConfig(section.config)
      return (
        <TestimonialSection
          title={section.title || config.title}
          config={config}
        />
      )
    }

    case PageSectionType.MAP: {
      const config = getMapConfig(section.config)
      return (
        <MapSection
          title={section.title || config.title}
          config={config}
        />
      )
    }

    case PageSectionType.EMBED: {
      const config = getEmbedConfig(section.config)
      return (
        <EmbedSection
          title={section.title || config.title}
          config={config}
        />
      )
    }

    default:
      return null
  }
}

interface PageSectionsProps {
  sections: PageSectionData[]
  postPrefix?: string
}

export function PageSections({
  sections,
  postPrefix = 'posts',
}: PageSectionsProps): ReactElement {
  return (
    <>
      {sections.map((section) => (
        <PageSectionRenderer
          key={section.id}
          section={section}
          postPrefix={postPrefix}
        />
      ))}
    </>
  )
}
