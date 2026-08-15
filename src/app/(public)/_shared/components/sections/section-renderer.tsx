/**
 * SectionRenderer — DB Section → v3 コンポーネント出し分け
 *
 * Server Component。PublicSection を受け取り、section.type に応じて
 * v3 コンポーネントを出し分ける。全ページ共通で使用。
 *
 * セクションごとの表示 style はコード側の固定定義から取得する。
 */

import type { ReactElement } from "react";
import { connection } from "next/server";
import type { SearchParams } from "nuqs/server";
import { SectionType } from "@/shared/lib/validations/section";
import { getFeatureFilterContext } from "@/shared/domain/features/check";
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
  getValuePropsConfig,
  getGalleryConfig,
  getCtaConfig,
  getContactFormConfig,
  getMapConfig,
  getEmbedConfig,
  getInstagramConfig,
  getLocationListConfig,
  getEventCalendarConfig,
  getReservationFormConfig,
  getPageHeroConfig,
  getTermsListConfig,
} from "@/shared/lib/validations/section-defaults";
import {
  getPublishedFaqCategoriesWithItems,
  getPublishedFaqItems,
  getShowcaseSpaces,
  type PublicSection,
} from "@/shared/domain/sections/queries";
import {
  getPublishedNews,
  getPublishedNewsList,
} from "@/shared/domain/news/queries";
import {
  getPublishedPosts,
  getPublishedPostsList,
  getPostCategories,
} from "@/shared/domain/posts/queries";
import {
  getPublishedEvents,
  getPublishedEventsPaginated,
  type PublicEventCardSource,
} from "@/shared/domain/events/public-queries";
import { getActiveEventCategories } from "@/shared/domain/event-categories/queries";
import { formatEventVenue } from "@/shared/lib/events/venue";
import { getInstagramPosts } from "@/shared/domain/instagram/queries";
import { getDecryptedGoogleMapsApiKey } from "@/shared/domain/settings/api-key-queries";
import {
  getActiveLocations,
  getPublishedLocationsForAccess,
} from "@/shared/domain/locations/public-queries";
import {
  getActiveCategories,
  getPublicSpaceFacilityNames,
  getPublishedSpacesPaginated,
  getPublishedSpacesPaginatedWithAvailability,
} from "@/shared/domain/spaces/public-queries";
import { getSpaceReviewStatsMultiple } from "@/shared/domain/reviews/public-queries";
import {
  eventsListSearchParams,
  newsSearchParams,
  parseSpaceTimeRange,
  postsSearchParams,
  reservationSearchParams,
  spaceSearchParams,
} from "@/public/lib/search-params";
import {
  getRequiredTermsByScope,
  getPublishedTermsList,
} from "@/shared/domain/terms/queries";
import { TermsScope } from "@/shared/lib/validations/enums/prisma-types";
import { getBusinessInfo } from "@/public/data/business";
import { getTurnstileSiteKey } from "@/shared/data/turnstile";
import { getDefaultSectionStyle } from "@/shared/domain/section-styles/types";

// v3 components
import { PageHero } from "../page-hero/PageHero";
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
import { ValuePropsSection } from "../../../_components/ValuePropsSection";
import { CTASection } from "../../../_components/CTASection";
import { TestimonialSection } from "../../../_components/TestimonialSection";
import { GallerySection } from "../../../_components/GallerySection";
import { MapSection } from "../../../_components/MapSection";
import { EmbedSection } from "../../../_components/EmbedSection";
import { NewsListSection } from "../../../_components/NewsListSection";
import { PostListSection } from "../../../_components/PostListSection";
import { FaqListSection } from "../../../_components/FaqListSection";
import { ContactFormSection } from "../../../_components/ContactFormSection";
import { ReservationFormSection } from "../../../_components/ReservationFormSection";
import {
  EventCalendarSection,
  type EventCalendarMode,
} from "../../../_components/EventCalendarSection";
import type { EventCardData } from "../../../_components/event-calendar/event-card";
import { InstagramSection } from "../../../_components/InstagramSection";
import { LocationListSection } from "../../../_components/LocationListSection";
import { TermsListSection } from "../../../_components/TermsListSection";
import type { SpaceListData } from "../../../_components/SpaceListSection";
import type { NewsData } from "../../../_components/NewsListSection";
import type { PostData } from "../../../_components/PostListSection";
import type { FaqData } from "../../../_components/FaqListSection";
import {
  blocksToPlainText,
  spansToPlainText,
} from "@/shared/lib/portable-text";
import type { InquiryDefaults } from "@/shared/lib/inquiry/defaults";
import { logger } from "@/shared/lib/errors/logger-core";

/** /blog archive variant のページあたり件数（旧 page.tsx の `POSTS_PER_PAGE`） */
const POSTS_ARCHIVE_PER_PAGE = 12;
/** /news archive variant のページあたり件数（旧 page.tsx の `NEWS_PER_PAGE`） */
const NEWS_ARCHIVE_PER_PAGE = 20;

interface SectionRendererProps {
  readonly section: PublicSection;
  /**
   * 任意 — URL クエリパラメータ。catalog variant の space-list 等、
   * server-side filtering / pagination が必要な section が parse する。
   */
  readonly searchParams?: Promise<SearchParams>;
  /**
   * 任意 — 親ページの slug（PAGE_TEMPLATES のキー / Page.slug と一致）。
   * space-list catalog の Pagination basePath 等、page-context が必要な
   * section が参照する。全 public page.tsx から渡される。
   */
  readonly pageSlug?: string;
  /**
   * 任意 — お問い合わせフォーム (contact-form section) の初期値。
   * 認証済顧客のプロフィールから派生する値 (姓名 / メール / 法人区分 /
   * 会社名 / プリセット件名) を流す。`contact/page.tsx` のみが渡す。
   */
  readonly inquiryDefaults?: InquiryDefaults;
}

/** pageSlug → 公開 URL path（home は `/`、未指定は従来どおり `/spaces`）。
 * space-list catalog と post-list / news-list archive の Pagination が共有する。
 */
function catalogBasePathFromPageSlug(pageSlug: string | undefined): string {
  if (pageSlug === undefined) return "/spaces";
  if (pageSlug === "home") return "/";
  return `/${pageSlug}`;
}

export async function SectionRenderer({
  section,
  searchParams,
  pageSlug,
  inquiryDefaults,
}: SectionRendererProps): Promise<ReactElement | null> {
  await connection();

  // 該当 section type が disabled feature module に紐づく場合は早期 null。
  // 例: spaces feature OFF 時にホームに埋め込まれた space-showcase / space-list を非表示化。
  // 公開ページ自体の 404 ガードは page.tsx の requireFeatureEnabled が担う。
  const featureCtx = await getFeatureFilterContext();
  if (featureCtx.disabledSectionTypes.has(section.type)) {
    return null;
  }

  const resolved = getDefaultSectionStyle(section.type);

  switch (section.type) {
    // =========================================================================
    // Hero variants
    // =========================================================================

    case SectionType.PAGE_HERO: {
      const config = getPageHeroConfig(section.config);
      return <PageHero config={config} />;
    }

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
      return <CustomSection config={config} style={resolved} />;
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

      if (config.displayLayout === "catalog") {
        const sp = await spaceSearchParams.parse(
          searchParams ?? Promise.resolve({}),
        );
        const filter = {
          page: Math.max(1, sp.page),
          categoryId: sp.category ?? undefined,
          locationId: sp.location ?? undefined,
          q: sp.q,
          minCapacity: sp.minCapacity ?? undefined,
          facilities: sp.facilities,
          sort: sp.sort,
        };
        const timeRange = parseSpaceTimeRange(sp);
        const [
          { items, totalCount, totalPages, currentPage },
          categories,
          locations,
          facilityOptions,
        ] = await Promise.all([
          timeRange
            ? getPublishedSpacesPaginatedWithAvailability(filter, {
                date: sp.date,
                startTime: sp.startTime,
                endTime: sp.endTime,
                from: timeRange.from,
                to: timeRange.to,
              })
            : getPublishedSpacesPaginated(filter),
          getActiveCategories(),
          getActiveLocations(),
          getPublicSpaceFacilityNames(),
        ]);
        const reviewStats = await getSpaceReviewStatsMultiple(
          items.map((s) => s.id),
        );
        return (
          <SpaceListSection
            config={config}
            style={resolved}
            sectionId={section.id}
            catalogBasePath={catalogBasePathFromPageSlug(pageSlug)}
            mode={{
              kind: "catalog",
              spaces: items,
              categories,
              locations,
              facilityOptions,
              reviewStats,
              currentPage,
              totalPages,
              totalCount,
              filter: {
                categoryId: sp.category,
                locationId: sp.location,
                q: sp.q,
                minCapacity: sp.minCapacity,
                facilities: sp.facilities,
                date: sp.date,
                startTime: sp.startTime,
                endTime: sp.endTime,
                sort: sp.sort,
              },
            }}
          />
        );
      }

      const rawSpaces = await getShowcaseSpaces(config.maxItems);
      const spaces: SpaceListData[] = rawSpaces.map((s) => ({
        id: s.id,
        slug: s.slug,
        name: s.name,
        descriptionPlainText: s.descriptionPlainText,
        capacity: s.capacity,
        hourlyPrice: s.hourlyPrice,
        taxRateType: s.taxRateType,
        area: s.area,
        mainImageUrl: s.mainImageUrl,
      }));
      return (
        <SpaceListSection
          config={config}
          style={resolved}
          sectionId={section.id}
          mode={{ kind: "simple", spaces }}
        />
      );
    }

    case SectionType.SPACE_SHOWCASE: {
      const config = getSpaceShowcaseConfig(section.config);
      const rawSpaces = await getShowcaseSpaces(config.maxItems);
      const spaces: ShowcaseSpaceData[] = rawSpaces.map((s) => ({
        id: s.id,
        slug: s.slug,
        name: s.name,
        descriptionPlainText: s.descriptionPlainText,
        capacity: s.capacity,
        hourlyPrice: s.hourlyPrice,
        taxRateType: s.taxRateType,
        area: s.area,
        mainImageUrl: s.mainImageUrl,
        gallery: s.gallery,
        categoryName: s.category?.name ?? null,
        locationName: s.location?.name ?? null,
      }));
      return (
        <SpaceShowcaseSection
          config={config}
          spaces={spaces}
          style={resolved}
          sectionId={section.id}
        />
      );
    }

    case SectionType.NEWS_LIST: {
      const config = getNewsListConfig(section.config);

      if (config.displayLayout === "archive") {
        const sp = searchParams
          ? await newsSearchParams.parse(searchParams)
          : { page: 1, q: "" };
        const currentPage = Math.max(1, sp.page);
        const newsResult = await getPublishedNewsList(
          currentPage,
          NEWS_ARCHIVE_PER_PAGE,
          sp.q,
        );
        return (
          <NewsListSection
            config={config}
            style={resolved}
            catalogBasePath={catalogBasePathFromPageSlug(pageSlug)}
            mode={{
              kind: "archive",
              items: newsResult.items,
              currentPage,
              totalPages: newsResult.totalPages,
              query: sp.q,
            }}
          />
        );
      }

      const rawNews = await getPublishedNews(config.maxItems);
      const news: NewsData[] = rawNews.map((n) => ({
        id: n.id,
        slug: n.slug,
        url: n.url,
        title: n.title,
        publishedAt: n.publishedAt,
      }));
      return (
        <NewsListSection
          config={config}
          style={resolved}
          mode={{ kind: "simple", news }}
        />
      );
    }

    case SectionType.POST_LIST: {
      const config = getPostListConfig(section.config);

      if (config.displayLayout === "archive") {
        const sp = searchParams
          ? await postsSearchParams.parse(searchParams)
          : { page: 1, q: "" };
        const currentPage = Math.max(1, sp.page);
        const [postsResult, categories] = await Promise.all([
          getPublishedPostsList(currentPage, POSTS_ARCHIVE_PER_PAGE, sp.q),
          getPostCategories(),
        ]);
        return (
          <PostListSection
            config={config}
            style={resolved}
            catalogBasePath={catalogBasePathFromPageSlug(pageSlug)}
            mode={{
              kind: "archive",
              posts: postsResult.posts,
              categories,
              currentPage,
              totalPages: postsResult.totalPages,
              query: sp.q,
            }}
          />
        );
      }

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
      return (
        <PostListSection
          config={config}
          style={resolved}
          mode={{ kind: "simple", posts }}
        />
      );
    }

    case SectionType.FAQ_LIST: {
      const config = getFaqListConfig(section.config);
      // Dual source: config.items (inline) or DB
      const inlineItems = config.items;
      const hasInlineItems = inlineItems != null && inlineItems.length > 0;

      if (hasInlineItems) {
        // FaqData.question / answer は string 契約（DB 由来 FaqItem と統一）。
        // Section.config.items[].question は PortableTextSpan[]、
        // .answer は PortableTextBlock[] に格上げしたが、
        // FaqListSection 描画は plain text 前提のため境界で派生する
        // （inline 項目の rich rendering は将来 FaqData 型拡張で対応）。
        const items: FaqData[] = inlineItems.map((item, index) => ({
          id: `inline-${index}`,
          question: spansToPlainText(item.question),
          answer: blocksToPlainText(item.answer),
        }));
        return (
          <FaqListSection config={config} items={items} style={resolved} />
        );
      }

      // categoryId 指定時は単一カテゴリの flat items
      if (config.categoryId) {
        const items: FaqData[] = (
          await getPublishedFaqItems(config.maxItems, config.categoryId)
        ).map((f) => ({
          id: f.id,
          question: f.question,
          answer: f.answer,
          helpfulCount: f.helpfulCount,
          notHelpfulCount: f.notHelpfulCount,
        }));
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

    case SectionType.TERMS_LIST: {
      const config = getTermsListConfig(section.config);
      const items = await getPublishedTermsList();
      return (
        <TermsListSection config={config} items={items} style={resolved} />
      );
    }

    // =========================================================================
    // Features & Social proof
    // =========================================================================

    case SectionType.FEATURES: {
      const config = getFeaturesConfig(section.config);
      return <FeaturesSection config={config} style={resolved} />;
    }

    case SectionType.VALUE_PROPS: {
      const config = getValuePropsConfig(section.config);
      return <ValuePropsSection config={config} />;
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
        getRequiredTermsByScope(TermsScope.INQUIRY),
      ]);
      return (
        <ContactFormSection
          config={config}
          style={resolved}
          sectionId={section.id}
          turnstileSiteKey={turnstileSiteKey}
          requiredTerms={requiredTerms}
          {...(inquiryDefaults !== undefined && { inquiryDefaults })}
        />
      );
    }

    case SectionType.RESERVATION_FORM: {
      const config = getReservationFormConfig(section.config);
      const sp = searchParams
        ? await reservationSearchParams.parse(searchParams)
        : { spaceId: null };
      return (
        <ReservationFormSection
          config={config}
          style={resolved}
          searchParamSpaceId={sp.spaceId ?? undefined}
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
      const layout = config.displayLayout;

      function toEventCardData(e: PublicEventCardSource): EventCardData {
        return {
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
          slots: e.slots.map((slot) => ({
            id: slot.id,
            startTime: slot.startAt,
            endTime: slot.endAt,
            capacity: slot.capacity,
          })),
          price: e.tickets[0]?.price ?? null,
          registrationOpen: e.registrationOpen,
          spaceName: e.space?.name ?? null,
          thumbnailUrl: e.thumbnailUrl ?? null,
          gallery: e.gallery,
          category: e.category,
        };
      }

      async function fetchEventListData() {
        const sp = await eventsListSearchParams.parse(
          searchParams ?? Promise.resolve({}),
        );
        const filter = { tab: sp.tab, q: sp.q, categoryId: sp.categoryId };
        const [paginated, categories] = await Promise.all([
          getPublishedEventsPaginated({ ...filter, page: sp.page }),
          getActiveEventCategories(),
        ]);
        return {
          items: paginated.items.map(toEventCardData),
          categories,
          currentPage: paginated.currentPage,
          totalPages: paginated.totalPages,
          totalCount: paginated.totalCount,
          filter,
        };
      }

      let mode: EventCalendarMode;
      if (layout === "calendar") {
        const rawEvents = await getPublishedEvents();
        mode = { kind: "calendar", events: rawEvents.map(toEventCardData) };
      } else if (layout === "list") {
        mode = { kind: "list", listData: await fetchEventListData() };
      } else {
        const [rawEvents, listData] = await Promise.all([
          getPublishedEvents(),
          fetchEventListData(),
        ]);
        mode = {
          kind: "toggle",
          events: rawEvents.map(toEventCardData),
          listData,
        };
      }

      return (
        <EventCalendarSection config={config} style={resolved} mode={mode} />
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

    default: {
      logger.warn("SectionRenderer: unknown section type", {
        sectionType: section.type,
        sectionId: section.id,
      });
      return null;
    }
  }
}
