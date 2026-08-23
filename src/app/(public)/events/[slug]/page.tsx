import type { Metadata } from "next";
import type { ReactElement } from "react";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArticleLayout } from "@/public/components/layouts/article-layout";
import { ArticleHeader } from "@/public/components/layouts/article-header";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { Prose } from "@/public/components/design-system/prose";
import { ArticleFooter } from "@/public/components/ui/article-footer";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
import { sanitizeRenderedContentHtml } from "@/shared/lib/html/sanitize";
import { resolveInternalLinkCards } from "@/shared/domain/link-cards/resolve-internal-link-cards";
import { resolveSpaceCardEmbeds } from "@/shared/domain/spaces/resolve-space-card-embeds";
import { getPublishedEventBySlug } from "@/shared/domain/events/public-queries";
import {
  formatEventAddress,
  formatEventVenue,
  publicEventSpaceVenuePath,
} from "@/shared/lib/events/venue";
import { buildAddToCalendarUrls } from "@/shared/lib/ical/urls";
import { getBaseUrl } from "@/shared/lib/constants";
import { toAppRoute } from "@/shared/lib/typed-routes";
import { withFeatureGate } from "@/public/lib/seo/feature-gated-metadata";
import {
  generateArticleMetadata,
  getSeoSettings,
  resolveSiteBranding,
} from "@/public/lib/seo/metadata-factory";
import { EventDetailFeatureGate } from "./_components/event-detail-feature-gate";
import { EventCalendarDisclosure } from "./_components/event-calendar-disclosure";
import {
  EventInfoPanelInventory,
  EventInfoPanelInventoryFallback,
} from "./_components/event-info-panel-inventory";
import {
  EventRegistrationSection,
  EventRegistrationSectionFallback,
  EventRegistrationSectionShell,
  REGISTER_ANCHOR_ID,
} from "./_components/event-registration-section";
import { RelatedEvents } from "./_components/related-events";
import { EventJsonLd } from "./_components/event-json-ld";
import { GalleryGrid } from "@/shared/components/gallery/GalleryGrid";
import { ImageFrame } from "@/public/components/design-system/image-frame";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await connection();

  const { slug } = await params;
  return withFeatureGate("events", async () => {
    const [event, settings] = await Promise.all([
      getPublishedEventBySlug(slug),
      getSeoSettings(),
    ]);

    if (!event) {
      return {
        title: "イベントが見つかりません",
        robots: { index: false, follow: false },
      };
    }

    const fallbackDescription =
      event.descriptionPlainText.trim() !== ""
        ? event.descriptionPlainText
        : `${event.title} - イベント詳細`;

    return await generateArticleMetadata(
      {
        title: event.title,
        description: event.metaDescription ?? fallbackDescription,
        image: event.ogpImageUrl ?? event.thumbnailUrl,
        ogpTitle: event.ogpTitle,
        ogpDescription: event.ogpDescription,
        metaKeywords: event.metaKeywords,
      },
      settings,
      {
        canonicalUrl: `${getBaseUrl()}/events/${slug}`,
        ogType: "website",
      },
    );
  });
}

export default async function EventDetailPage({
  params,
}: PageProps): Promise<ReactElement> {
  const { slug } = await params;
  const [event, seoSettings] = await Promise.all([
    getPublishedEventBySlug(slug),
    getSeoSettings(),
  ]);

  if (!event) {
    notFound();
  }

  const { siteName } = resolveSiteBranding(seoSettings);

  const baseUrl = getBaseUrl();
  const eventUrl = `${baseUrl}/events/${slug}`;
  const startDateIso = new Date(event.startTime).toISOString();
  const endDateIso = new Date(event.endTime).toISOString();
  const totalCapacity =
    event.slots.length > 0
      ? event.slots.reduce((sum, slot) => sum + slot.capacity, 0)
      : null;

  const venueName = formatEventVenue({
    location: event.location,
    space: event.space,
    addressDetail: event.addressDetail,
  });
  const venueAddress = formatEventAddress({
    location: event.location,
    addressDetail: event.addressDetail,
  });
  const spaceVenuePath = publicEventSpaceVenuePath(event.space);

  const linkCardsResolvedDescriptionHtml = await resolveInternalLinkCards(
    event.descriptionHtml,
  );
  const resolvedDescriptionHtml = await resolveSpaceCardEmbeds(
    linkCardsResolvedDescriptionHtml,
  );

  const calendarUrls = buildAddToCalendarUrls({
    summary: event.title,
    description:
      event.descriptionPlainText.trim() !== ""
        ? event.descriptionPlainText
        : event.title,
    startTime: new Date(event.startTime),
    endTime: new Date(event.endTime),
    ...(venueName !== null ? { location: venueName } : {}),
  });

  const inventoryPanelFallback = (
    <EventInfoPanelInventoryFallback
      variant="sidebar"
      event={event}
      registerAnchorId={REGISTER_ANCHOR_ID}
    />
  );
  const inventoryMobilePanelFallback = (
    <EventInfoPanelInventoryFallback
      variant="mobile"
      event={event}
      registerAnchorId={REGISTER_ANCHOR_ID}
    />
  );

  return (
    <>
      <Suspense fallback={null}>
        <EventDetailFeatureGate />
      </Suspense>
      <ArticleLayout
        jsonLd={
          <EventJsonLd
            name={event.title}
            {...(event.descriptionPlainText.trim() !== ""
              ? { description: event.descriptionPlainText }
              : {})}
            startDate={startDateIso}
            endDate={endDateIso}
            url={eventUrl}
            {...(event.thumbnailUrl ? { image: event.thumbnailUrl } : {})}
            eventStatus="EventScheduled"
            format={event.format}
            organizerName={siteName}
            {...(venueName
              ? {
                  venue: {
                    name: venueName,
                    ...(venueAddress ? { address: venueAddress } : {}),
                    ...(spaceVenuePath
                      ? {
                          url: `${baseUrl}${toAppRoute(spaceVenuePath)}`,
                        }
                      : {}),
                  },
                }
              : {})}
            {...(event.tickets.length > 0
              ? {
                  offers: {
                    price: event.tickets[0]?.price ?? 0,
                    priceCurrency: "JPY",
                    url: eventUrl,
                  },
                }
              : {})}
            {...(totalCapacity != null
              ? { maximumAttendeeCapacity: totalCapacity }
              : {})}
          />
        }
        breadcrumb={[
          { label: "イベント", href: "/events" },
          { label: event.title },
        ]}
        hero={
          <ArticleHeader
            align="center"
            eyebrow="Event"
            title={event.title}
            {...(event.thumbnailUrl && {
              media: (
                <ImageFrame
                  src={event.thumbnailUrl}
                  alt={event.title}
                  aspect="video"
                  fill
                  sizes="(min-width: 1024px) 60vw, 100vw"
                  rounded
                  loading="eager"
                  fetchPriority="high"
                />
              ),
            })}
          />
        }
        toc={
          <Suspense fallback={inventoryPanelFallback}>
            <EventInfoPanelInventory
              variant="sidebar"
              event={event}
              registerAnchorId={REGISTER_ANCHOR_ID}
            />
          </Suspense>
        }
        mobileToc={
          <Suspense fallback={inventoryMobilePanelFallback}>
            <EventInfoPanelInventory
              variant="mobile"
              event={event}
              registerAnchorId={REGISTER_ANCHOR_ID}
            />
          </Suspense>
        }
        showCta={false}
      >
        {event.descriptionHtml.trim() !== "" ? (
          <Prose variant="editorial" className="max-w-none">
            <SanitizedHtml
              sanitizedHtml={sanitizeRenderedContentHtml(
                resolvedDescriptionHtml,
              )}
            />
          </Prose>
        ) : null}

        {event.gallery.length > 0 ? (
          <section aria-label="イベントギャラリー" className="mt-12">
            <GalleryGrid items={event.gallery} />
          </section>
        ) : null}

        {/* 外殻 (id / 見出し) は Suspense の外。中身だけを差し替えることで
            ストリーミング中の重複 ID を防ぐ。 */}
        <EventRegistrationSectionShell>
          <Suspense fallback={<EventRegistrationSectionFallback />}>
            <EventRegistrationSection event={event} slug={slug} />
          </Suspense>
        </EventRegistrationSectionShell>

        <EventCalendarDisclosure urls={calendarUrls} />

        <ArticleFooter url={eventUrl} title={event.title} />
      </ArticleLayout>

      <Suspense fallback={null}>
        <RelatedEvents
          excludeEventId={event.id}
          spaceId={event.space?.id ?? null}
        />
      </Suspense>
      <SiteCTA />
    </>
  );
}
