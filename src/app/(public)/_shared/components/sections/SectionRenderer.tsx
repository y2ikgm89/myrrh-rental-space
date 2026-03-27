/**
 * SectionRenderer — DB Section → v3 コンポーネント出し分け
 *
 * Server Component。PublicSection を受け取り、section.type に応じて
 * v3 コンポーネントを出し分ける。全ページ共通で使用。
 */

import type { ReactElement } from "react";
import { SectionType } from "@/shared/db/enums";
import { parseSectionDesign } from "@/shared/lib/validations/section";
import {
  getHeroConfig,
  getHeroParallaxConfig,
  getCustomConfig,
  getConceptConfig,
  getSpaceListConfig,
  getSpaceShowcaseConfig,
  getNewsListConfig,
  getPostListConfig,
  getFaqListConfig,
  getFeaturesConfig,
  getTestimonialConfig,
  getGalleryConfig,
  getCtaConfig,
  getContactFormConfig,
  getMapConfig,
  getEmbedConfig,
  getInstagramConfig,
} from "@/shared/lib/validations/section-defaults";
import {
  getPublishedFaqItems,
  getShowcaseSpaces,
  type PublicSection,
} from "@/shared/domain/sections/queries";
import { getPublishedNews } from "@/shared/domain/news/queries";
import { getPublishedPosts } from "@/shared/domain/posts/queries";

// v3 components
import { HeroSection } from "../../../_components/HeroSection";
import { StandardHeroSection } from "../../../_components/StandardHeroSection";
import { ConceptSection } from "../../../_components/ConceptSection";
import { CustomSection } from "../../../_components/CustomSection";
import { SpaceShowcase } from "../../../_components/SpaceShowcase";
import { SpaceListSection } from "../../../_components/SpaceListSection";
import { FeaturesSection } from "../../../_components/FeaturesSection";
import { CTASection } from "../../../_components/CTASection";
import { TestimonialSection } from "../../../_components/TestimonialSection";
import { GallerySection } from "../../../_components/GallerySection";
import { MapSection } from "../../../_components/MapSection";
import { EmbedSection } from "../../../_components/EmbedSection";
import { NewsListSection } from "../../../_components/NewsListSection";
import { PostListSection } from "../../../_components/PostListSection";
import { FaqListSection } from "../../../_components/FaqListSection";
import { ContactFormSection } from "../../../_components/ContactFormSection";
import { InstagramSection } from "../../../_components/InstagramSection";
import type { SpaceData } from "../../../_components/SpaceShowcase";
import type { SpaceListData } from "../../../_components/SpaceListSection";
import type { NewsData } from "../../../_components/NewsListSection";
import type { PostData } from "../../../_components/PostListSection";
import type { FaqData } from "../../../_components/FaqListSection";

interface SectionRendererProps {
  readonly section: PublicSection;
}

export async function SectionRenderer({
  section,
}: SectionRendererProps): Promise<ReactElement | null> {
  const design = parseSectionDesign(section.design);

  switch (section.type) {
    // =========================================================================
    // Hero variants
    // =========================================================================

    case SectionType.HERO: {
      const config = getHeroConfig(section.config);
      return <StandardHeroSection config={config} design={design} />;
    }

    case SectionType.HERO_PARALLAX: {
      const config = getHeroParallaxConfig(section.config);
      return <HeroSection config={config} design={design} />;
    }

    // =========================================================================
    // Content
    // =========================================================================

    case SectionType.CUSTOM: {
      const config = getCustomConfig(section.config);
      return (
        <CustomSection
          config={config}
          content={section.contentHtml ?? ""}
          title={section.title}
          design={design}
        />
      );
    }

    case SectionType.CONCEPT: {
      const config = getConceptConfig(section.config);
      return <ConceptSection config={config} design={design} />;
    }

    // =========================================================================
    // Lists (DB-dependent)
    // =========================================================================

    case SectionType.SPACE_LIST: {
      const config = getSpaceListConfig(section.config);
      const rawSpaces = await getShowcaseSpaces(
        config.maxItems,
        config.showOnlyPublished,
      );
      const spaces: SpaceListData[] = rawSpaces.map((s) => ({
        id: s.id,
        slug: s.slug,
        name: s.name,
        description: s.description,
        capacity: s.capacity,
        hourlyPrice: s.hourlyPrice,
        area: s.area,
        mainImageUrl: s.mainImageUrl,
      }));
      return (
        <SpaceListSection config={config} spaces={spaces} design={design} />
      );
    }

    case SectionType.SPACE_SHOWCASE: {
      const config = getSpaceShowcaseConfig(section.config);
      const rawSpaces = await getShowcaseSpaces(
        config.maxItems,
        config.showOnlyPublished,
      );
      const spaces: SpaceData[] = rawSpaces.map((s) => ({
        id: s.id,
        name: s.name,
        nameJa: s.name,
        tagline: s.description,
        capacity: s.capacity,
        hourlyPrice: s.hourlyPrice,
        area: s.area,
        imageUrl: s.mainImageUrl,
        imageAlt: s.name,
        slug: s.slug,
      }));
      return <SpaceShowcase config={config} spaces={spaces} design={design} />;
    }

    case SectionType.NEWS_LIST: {
      const config = getNewsListConfig(section.config);
      const rawNews = await getPublishedNews(config.maxItems);
      const news: NewsData[] = rawNews.map((n) => ({
        id: n.id,
        slug: n.slug,
        url: n.url,
        title: n.title,
        publishedAt: n.publishedAt,
      }));
      return <NewsListSection config={config} news={news} design={design} />;
    }

    case SectionType.POST_LIST: {
      const config = getPostListConfig(section.config);
      const rawPosts = await getPublishedPosts(
        config.maxItems,
        config.categoryId,
      );
      const posts: PostData[] = rawPosts.map((p) => ({
        id: p.id,
        slug: p.slug,
        url: p.url,
        title: p.title,
        excerpt: p.excerpt,
        thumbnailUrl: p.thumbnailUrl,
        publishedAt: p.publishedAt,
        categoryName: p.category?.name ?? null,
      }));
      return <PostListSection config={config} posts={posts} design={design} />;
    }

    case SectionType.FAQ_LIST: {
      const config = getFaqListConfig(section.config);
      // Dual source: config.items (inline) or DB
      const inlineItems = config.items;
      const hasInlineItems = inlineItems != null && inlineItems.length > 0;
      const items: FaqData[] = hasInlineItems
        ? inlineItems.map((item, index) => ({
            id: `inline-${index}`,
            question: item.question,
            answer: item.answer,
          }))
        : (await getPublishedFaqItems(config.maxItems, config.categoryId)).map(
            (f) => ({
              id: f.id,
              question: f.question,
              answer: f.answerHtml ?? "",
            }),
          );
      return <FaqListSection config={config} items={items} design={design} />;
    }

    // =========================================================================
    // Features & Social proof
    // =========================================================================

    case SectionType.FEATURES: {
      const config = getFeaturesConfig(section.config);
      return <FeaturesSection config={config} design={design} />;
    }

    case SectionType.TESTIMONIAL: {
      const config = getTestimonialConfig(section.config);
      return <TestimonialSection config={config} design={design} />;
    }

    case SectionType.GALLERY: {
      const config = getGalleryConfig(section.config);
      return <GallerySection config={config} design={design} />;
    }

    // =========================================================================
    // Functional
    // =========================================================================

    case SectionType.CTA: {
      const config = getCtaConfig(section.config);
      return <CTASection config={config} design={design} />;
    }

    case SectionType.CONTACT_FORM: {
      const config = getContactFormConfig(section.config);
      return <ContactFormSection config={config} design={design} />;
    }

    case SectionType.MAP: {
      const config = getMapConfig(section.config);
      return <MapSection config={config} design={design} />;
    }

    case SectionType.EMBED: {
      const config = getEmbedConfig(section.config);
      return <EmbedSection config={config} design={design} />;
    }

    case SectionType.INSTAGRAM: {
      const config = getInstagramConfig(section.config);
      return <InstagramSection config={config} design={design} />;
    }

    default:
      return null;
  }
}
