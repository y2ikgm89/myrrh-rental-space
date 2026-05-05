/**
 * SectionRenderer — DB Section → v3 コンポーネント出し分け
 *
 * Server Component。PublicSection を受け取り、section.type に応じて
 * v3 コンポーネントを出し分ける。全ページ共通で使用。
 *
 * セクションごとの表示 style はコード側の固定定義から取得する。
 */

import type { ReactElement } from "react";
import { SectionType } from "@/shared/lib/validations/section";
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
  getLocationListConfig,
  getEventCalendarConfig,
} from "@/shared/lib/validations/section-defaults";
import {
  getPublishedFaqCategoriesWithItems,
  getPublishedFaqItems,
  getShowcaseSpaces,
  type PublicSection,
} from "@/shared/domain/sections/queries";
import { getPublishedNews } from "@/shared/domain/news/queries";
import { getPublishedPosts } from "@/shared/domain/posts/queries";
import { getPublishedEvents } from "@/shared/domain/events/public-queries";
import { formatEventVenue } from "@/shared/domain/events/venue";
import { getInstagramPosts } from "@/shared/domain/instagram/queries";
import { getDecryptedGoogleMapsApiKey } from "@/shared/domain/settings/api-key-queries";
import { getPublishedLocationsForAccess } from "@/shared/domain/locations/public-queries";
import { getRequiredTermsAtInquiry } from "@/shared/domain/terms/queries";
import { getBusinessInfo } from "@/public/data/business";
import { getTurnstileSiteKey } from "@/public/data/turnstile";
import { getDefaultSectionStyle } from "@/shared/domain/section-styles/types";

// v3 components
import { HeroSection } from "../../../_components/HeroSection";
import { StandardHeroSection } from "../../../_components/StandardHeroSection";
import { ConceptSection } from "../../../_components/ConceptSection";
import { CustomSection } from "../../../_components/CustomSection";
import {
  SpaceShowcaseSection,
  type ShowcaseSpaceData,
} from "../../../_components/SpaceShowcaseSection";
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
import { EventCalendarSection } from "../../../_components/EventCalendarSection";
import type { EventCardData } from "../../../_components/event-calendar/event-card";
import { InstagramSection } from "../../../_components/InstagramSection";
import { LocationListSection } from "../../../_components/LocationListSection";
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
  const resolved = getDefaultSectionStyle(section.type);

  switch (section.type) {
    // =========================================================================
    // Hero variants
    // =========================================================================

    case SectionType.HERO: {
      const config = getHeroConfig(section.config);
      return <StandardHeroSection config={config} style={resolved} />;
    }

    case SectionType.HERO_PARALLAX: {
      const config = getHeroParallaxConfig(section.config);
      return <HeroSection config={config} style={resolved} />;
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
          style={resolved}
        />
      );
    }

    case SectionType.CONCEPT: {
      const config = getConceptConfig(section.config);
      return <ConceptSection config={config} style={resolved} />;
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
        descriptionPlainText: s.descriptionPlainText,
        capacity: s.capacity,
        hourlyPrice: s.hourlyPrice,
        area: s.area,
        mainImageUrl: s.mainImageUrl,
      }));
      return (
        <SpaceListSection config={config} spaces={spaces} style={resolved} />
      );
    }

    case SectionType.SPACE_SHOWCASE: {
      const config = getSpaceShowcaseConfig(section.config);
      const rawSpaces = await getShowcaseSpaces(
        config.maxItems,
        config.showOnlyPublished,
      );
      const spaces: ShowcaseSpaceData[] = rawSpaces.map((s) => ({
        id: s.id,
        slug: s.slug,
        name: s.name,
        descriptionPlainText: s.descriptionPlainText,
        capacity: s.capacity,
        hourlyPrice: s.hourlyPrice,
        area: s.area,
        mainImageUrl: s.mainImageUrl,
        imageUrls: s.imageUrls,
        categoryName: s.category?.name ?? null,
        locationName: s.location?.name ?? null,
      }));
      return (
        <SpaceShowcaseSection
          config={config}
          spaces={spaces}
          style={resolved}
        />
      );
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
      return <NewsListSection config={config} news={news} style={resolved} />;
    }

    case SectionType.POST_LIST: {
      const config = getPostListConfig(section.config);
      const rawPosts = await getPublishedPosts(
        config.maxItems,
        config.categoryId || undefined,
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
      return <PostListSection config={config} posts={posts} style={resolved} />;
    }

    case SectionType.FAQ_LIST: {
      const config = getFaqListConfig(section.config);
      // Dual source: config.items (inline) or DB
      const inlineItems = config.items;
      const hasInlineItems = inlineItems != null && inlineItems.length > 0;

      if (hasInlineItems) {
        const items: FaqData[] = inlineItems.map((item, index) => ({
          id: `inline-${index}`,
          question: item.question,
          answer: item.answer,
        }));
        return (
          <FaqListSection config={config} items={items} style={resolved} />
        );
      }

      // categoryId 指定時は単一カテゴリの flat items
      if (config.categoryId) {
        const items: FaqData[] = (
          await getPublishedFaqItems(config.maxItems, config.categoryId)
        ).map((f) => ({ id: f.id, question: f.question, answer: f.answer }));
        return (
          <FaqListSection config={config} items={items} style={resolved} />
        );
      }

      // 両方未指定: 全カテゴリの categories を fetch（カテゴリ別 accordion）
      const categories = await getPublishedFaqCategoriesWithItems();
      return (
        <FaqListSection
          config={config}
          categories={categories}
          style={resolved}
        />
      );
    }

    // =========================================================================
    // Features & Social proof
    // =========================================================================

    case SectionType.FEATURES: {
      const config = getFeaturesConfig(section.config);
      return <FeaturesSection config={config} style={resolved} />;
    }

    case SectionType.TESTIMONIAL: {
      const config = getTestimonialConfig(section.config);
      return <TestimonialSection config={config} style={resolved} />;
    }

    case SectionType.GALLERY: {
      const config = getGalleryConfig(section.config);
      return <GallerySection config={config} style={resolved} />;
    }

    // =========================================================================
    // Functional
    // =========================================================================

    case SectionType.CTA: {
      const config = getCtaConfig(section.config);
      return <CTASection config={config} style={resolved} />;
    }

    case SectionType.CONTACT_FORM: {
      const config = getContactFormConfig(section.config);
      const [turnstileSiteKey, requiredTerms] = await Promise.all([
        getTurnstileSiteKey(),
        getRequiredTermsAtInquiry(),
      ]);
      return (
        <ContactFormSection
          config={config}
          style={resolved}
          turnstileSiteKey={turnstileSiteKey}
          requiredTerms={requiredTerms}
        />
      );
    }

    case SectionType.MAP: {
      const config = getMapConfig(section.config);
      const mapApiKey = await getDecryptedGoogleMapsApiKey();
      return <MapSection config={config} style={resolved} apiKey={mapApiKey} />;
    }

    case SectionType.EMBED: {
      const config = getEmbedConfig(section.config);
      return <EmbedSection config={config} style={resolved} />;
    }

    case SectionType.INSTAGRAM: {
      const config = getInstagramConfig(section.config);
      const posts = await getInstagramPosts();
      return (
        <InstagramSection config={config} style={resolved} posts={posts} />
      );
    }

    case SectionType.EVENT_CALENDAR: {
      const config = getEventCalendarConfig(section.config);
      const rawEvents = await getPublishedEvents();
      const events: EventCardData[] = rawEvents.map((e) => ({
        id: e.id,
        title: e.title,
        slug: e.slug,
        descriptionPlainText: e.descriptionPlainText,
        location: formatEventVenue({
          location: e.location,
          space: e.space,
          addressDetail: e.addressDetail,
        }),
        startTime: e.startTime,
        endTime: e.endTime,
        price: e.price,
        registrationOpen: e.registrationOpen,
        spaceName: e.space?.name ?? null,
        thumbnailUrl: e.thumbnailUrl ?? null,
      }));
      return (
        <EventCalendarSection
          config={config}
          style={resolved}
          events={events}
        />
      );
    }

    case SectionType.LOCATION_LIST: {
      const config = getLocationListConfig(section.config);
      const slugs =
        config.mode === "selected"
          ? config.locationSlugs.map((item) => item.slug)
          : undefined;
      const [locations, info] = await Promise.all([
        getPublishedLocationsForAccess(slugs),
        getBusinessInfo(),
      ]);
      return (
        <LocationListSection
          config={config}
          locations={locations}
          businessInfo={{
            phone: info.phone,
            email: info.email,
            name: info.name,
          }}
          style={resolved}
        />
      );
    }

    default:
      return null;
  }
}
