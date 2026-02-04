/**
 * HomepageSectionRenderer — DB Section → v3 コンポーネント出し分け
 *
 * Server Component。PublicSection を受け取り、section.type に応じて
 * v3 コンポーネントを出し分ける。
 */

import type { ReactElement } from 'react'
import { SectionType } from '@/shared/generated/prisma/enums'
import {
  getHeroParallaxConfig,
  getConceptConfig,
  getSpaceShowcaseConfig,
  getFeaturesConfig,
  getCtaConfig,
} from '@/shared/lib/validations/section'
import type { PublicSection } from '@/public/actions/section'
import { getShowcaseSpaces } from '@/public/actions/section'
import { HeroSection } from '../../../_components/HeroSection'
import { ConceptSection } from '../../../_components/ConceptSection'
import { SpaceShowcase } from '../../../_components/SpaceShowcase'
import { FeaturesSection } from '../../../_components/FeaturesSection'
import { CTASection } from '../../../_components/CTASection'
import type { SpaceData } from '../../../_components/SpaceShowcase'

interface HomepageSectionRendererProps {
  readonly section: PublicSection
}

export async function HomepageSectionRenderer({
  section,
}: HomepageSectionRendererProps): Promise<ReactElement | null> {
  switch (section.type) {
    case SectionType.HERO_PARALLAX: {
      const config = getHeroParallaxConfig(section.config)
      return <HeroSection config={config} />
    }

    case SectionType.CONCEPT: {
      const config = getConceptConfig(section.config)
      return <ConceptSection config={config} />
    }

    case SectionType.SPACE_SHOWCASE: {
      const config = getSpaceShowcaseConfig(section.config)
      const rawSpaces = await getShowcaseSpaces(config.maxItems, config.showOnlyPublished)
      const spaces: SpaceData[] = rawSpaces.map((s) => ({
        id: s.id,
        name: s.name,
        nameJa: s.name,
        tagline: s.description,
        capacity: s.capacity,
        hourlyPrice: s.hourlyPrice != null ? Number(s.hourlyPrice) : null,
        area: s.area != null ? Number(s.area) : null,
        imageUrl: s.mainImageUrl,
        imageAlt: s.name,
        slug: s.slug,
      }))
      return <SpaceShowcase config={config} spaces={spaces} />
    }

    case SectionType.FEATURES: {
      const config = getFeaturesConfig(section.config)
      return <FeaturesSection config={config} />
    }

    case SectionType.CTA: {
      const config = getCtaConfig(section.config)
      return <CTASection config={config} />
    }

    default:
      // Phase 5 で対応予定の SectionType はスキップ
      return null
  }
}
