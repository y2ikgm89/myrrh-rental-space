/**
 * セクションレンダラー
 *
 * HomepageSectionDataに基づいて適切なセクションコンポーネントをレンダリング
 */

import type { ReactElement } from 'react'
import { HomepageSectionType } from '@/lib/validations/enums'
import type { HomepageSectionData } from '@/actions/admin/homepage-settings'
import {
  getSafeConfig,
  type HeroConfig,
  type SpaceListConfig,
  type NewsConfig,
  type BlogConfig,
  type FaqConfig,
  type CtaConfig,
  type CustomConfig,
} from '@/lib/validations/homepage-section'
import { HeroSection } from './HeroSection'
import { SpaceListSection } from './SpaceListSection'
import { NewsSectionRenderer } from './NewsSectionRenderer'
import { BlogSectionRenderer } from './BlogSectionRenderer'
import { FAQSectionRenderer } from './FAQSectionRenderer'
import { CTASectionRenderer } from './CTASectionRenderer'
import { CustomSection } from './CustomSection'

interface SectionRendererProps {
  section: HomepageSectionData
}

export function SectionRenderer({ section }: SectionRendererProps): ReactElement | null {
  switch (section.type) {
    case HomepageSectionType.HERO: {
      const config = getSafeConfig(HomepageSectionType.HERO, section.config) as HeroConfig
      return <HeroSection config={config} />
    }

    case HomepageSectionType.SPACE_LIST: {
      const config = getSafeConfig(HomepageSectionType.SPACE_LIST, section.config) as SpaceListConfig
      return (
        <SpaceListSection
          title={section.title}
          config={config}
        />
      )
    }

    case HomepageSectionType.NEWS: {
      const config = getSafeConfig(HomepageSectionType.NEWS, section.config) as NewsConfig
      return (
        <NewsSectionRenderer
          title={section.title}
          config={config}
        />
      )
    }

    case HomepageSectionType.BLOG: {
      const config = getSafeConfig(HomepageSectionType.BLOG, section.config) as BlogConfig
      return (
        <BlogSectionRenderer
          title={section.title}
          config={config}
        />
      )
    }

    case HomepageSectionType.FAQ: {
      const config = getSafeConfig(HomepageSectionType.FAQ, section.config) as FaqConfig
      return (
        <FAQSectionRenderer
          title={section.title}
          config={config}
        />
      )
    }

    case HomepageSectionType.CTA: {
      const config = getSafeConfig(HomepageSectionType.CTA, section.config) as CtaConfig
      return <CTASectionRenderer config={config} />
    }

    case HomepageSectionType.CUSTOM: {
      const config = getSafeConfig(HomepageSectionType.CUSTOM, section.config) as CustomConfig
      return (
        <CustomSection
          title={section.title}
          content={section.content}
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
}

export function HomepageSections({ sections }: HomepageSectionsProps): ReactElement {
  return (
    <>
      {sections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </>
  )
}
