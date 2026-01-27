/**
 * セクションレンダラー
 *
 * HomepageSectionDataに基づいて適切なセクションコンポーネントをレンダリング
 */

import type { ReactElement } from 'react'
import { HomepageSectionType } from '@/shared/lib/validations/enums'
import type { HomepageSectionData } from '@/public/actions/homepage'
import { getSafeConfig } from '@/shared/lib/validations/homepage-section'
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
}

export function SectionRenderer({ section, postPrefix }: SectionRendererProps): ReactElement | null {
  switch (section.type) {
    case HomepageSectionType.HERO: {
      const config = getSafeConfig(HomepageSectionType.HERO, section.config)
      return <HeroSection config={config} />
    }

    case HomepageSectionType.SPACE_LIST: {
      const config = getSafeConfig(HomepageSectionType.SPACE_LIST, section.config)
      return (
        <SpaceListSection
          title={section.title}
          config={config}
        />
      )
    }

    case HomepageSectionType.NEWS: {
      const config = getSafeConfig(HomepageSectionType.NEWS, section.config)
      return (
        <NewsSectionRenderer
          title={section.title}
          config={config}
        />
      )
    }

    case HomepageSectionType.POST: {
      const config = getSafeConfig(HomepageSectionType.POST, section.config)
      return (
        <PostSectionRenderer
          title={section.title}
          config={config}
          postPrefix={postPrefix}
        />
      )
    }

    case HomepageSectionType.FAQ: {
      const config = getSafeConfig(HomepageSectionType.FAQ, section.config)
      return (
        <FAQSectionRenderer
          title={section.title}
          config={config}
        />
      )
    }

    case HomepageSectionType.CTA: {
      const config = getSafeConfig(HomepageSectionType.CTA, section.config)
      return <CTASectionRenderer config={config} />
    }

    case HomepageSectionType.CUSTOM: {
      const config = getSafeConfig(HomepageSectionType.CUSTOM, section.config)
      return (
        <CustomSection
          title={section.title}
          content={section.content}
          config={config}
        />
      )
    }

    case HomepageSectionType.INSTAGRAM: {
      const config = getSafeConfig(HomepageSectionType.INSTAGRAM, section.config)
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
}

export function HomepageSections({ sections, postPrefix }: HomepageSectionsProps): ReactElement {
  return (
    <>
      {sections.map((section) => (
        <SectionRenderer key={section.id} section={section} postPrefix={postPrefix} />
      ))}
    </>
  )
}
