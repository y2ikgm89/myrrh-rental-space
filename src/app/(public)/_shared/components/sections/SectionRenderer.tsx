/**
 * セクションレンダラー
 *
 * HomepageSectionDataに基づいて適切なセクションコンポーネントをレンダリング
 */

import { Suspense, type ReactElement } from 'react'
import { HomepageSectionType } from '@/shared/lib/validations/enums'
import type { HomepageSectionData } from '@/public/actions/homepage'
import {
  getHeroConfig,
  getSpaceListConfig,
  getNewsConfig,
  getPostsConfig,
  getFaqConfig,
  getCtaConfig,
  getCustomConfig,
  getInstagramConfig,
} from '@/shared/lib/validations/homepage-section'
import { ContentRenderer } from '@/public/components/ContentRenderer'
import { InlineEditableWrapper } from '@/public/components/inline-editor'
import { HeroSection } from './HeroSection'
import { SpaceListSection } from './SpaceListSection'
import { NewsSectionRenderer } from './NewsSectionRenderer'
import { PostSectionRenderer } from './PostSectionRenderer'
import { FAQSectionRenderer } from './FAQSectionRenderer'
import { CTASectionRenderer } from './CTASectionRenderer'
import { CustomSection } from './CustomSection'
import { InstagramSectionRenderer } from './InstagramSectionRenderer'

interface SectionRendererProps {
  section: HomepageSectionData
  postPrefix: string
  /** 管理者かどうか（インライン編集用） */
  isAdmin?: boolean
}

export function SectionRenderer({ section, postPrefix, isAdmin = false }: SectionRendererProps): ReactElement | null {
  switch (section.type) {
    case HomepageSectionType.HERO: {
      const config = getHeroConfig(section.config)
      return <HeroSection config={config} />
    }

    case HomepageSectionType.SPACE_LIST: {
      const config = getSpaceListConfig(section.config)
      return (
        <SpaceListSection
          title={section.title}
          config={config}
        />
      )
    }

    case HomepageSectionType.NEWS: {
      const config = getNewsConfig(section.config)
      return (
        <NewsSectionRenderer
          title={section.title}
          config={config}
        />
      )
    }

    case HomepageSectionType.POST: {
      const config = getPostsConfig(section.config)
      return (
        <PostSectionRenderer
          title={section.title}
          config={config}
          postPrefix={postPrefix}
        />
      )
    }

    case HomepageSectionType.FAQ: {
      const config = getFaqConfig(section.config)
      return (
        <FAQSectionRenderer
          title={section.title}
          config={config}
        />
      )
    }

    case HomepageSectionType.CTA: {
      const config = getCtaConfig(section.config)
      return <CTASectionRenderer config={config} />
    }

    case HomepageSectionType.CUSTOM: {
      const config = getCustomConfig(section.config)
      const contentSlot = section.content ? (
        <Suspense fallback={<ContentRenderer html={section.content} />}>
          <InlineEditableWrapper
            contentType="homepage-section"
            contentId={section.id}
            initialContent={section.content}
            isAdmin={isAdmin}
          >
            <ContentRenderer html={section.content} />
          </InlineEditableWrapper>
        </Suspense>
      ) : undefined
      return (
        <CustomSection
          title={section.title}
          content={section.content}
          config={config}
          contentSlot={contentSlot}
        />
      )
    }

    case HomepageSectionType.INSTAGRAM: {
      const config = getInstagramConfig(section.config)
      return (
        <InstagramSectionRenderer
          title={section.title}
          config={config}
        />
      )
    }

    default:
      return null
  }
}

interface HomepageSectionsProps {
  sections: HomepageSectionData[]
  postPrefix: string
  /** 管理者かどうか（インライン編集用） */
  isAdmin?: boolean
}

export function HomepageSections({ sections, postPrefix, isAdmin = false }: HomepageSectionsProps): ReactElement {
  return (
    <>
      {sections.map((section) => (
        <SectionRenderer key={section.id} section={section} postPrefix={postPrefix} isAdmin={isAdmin} />
      ))}
    </>
  )
}
