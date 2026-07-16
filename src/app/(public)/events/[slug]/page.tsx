import type { Metadata } from "next";
import type { ReactElement } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArticleLayout } from "@/public/components/layouts/article-layout";
import { ArticleHeader } from "@/public/components/layouts/article-header";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { Heading } from "@/public/components/design-system/heading";
import { ImageFrame } from "@/public/components/design-system/image-frame";
import { Prose } from "@/public/components/design-system/prose";
import { ArticleFooter } from "@/public/components/ui/article-footer";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
import { resolveInternalLinkCards } from "@/shared/lib/lexical/resolve-internal-link-cards";
import { getPublishedEventBySlug } from "@/shared/domain/events/public-queries";
import { getSlotRegistrationCounts } from "@/shared/domain/events/slot-queries";
import {
  buildCurrentPublicEventSlotOptions,
  derivePublicEventRegistrationState,
} from "@/shared/domain/events/public-slot-options";
import {
  formatEventAddress,
  formatEventVenue,
  formatEventVenueDisplay,
  isEventVirtualAccessible,
} from "@/shared/domain/events/venue";
import { getTurnstileSiteKey } from "@/shared/data/turnstile";
import { getCurrentCustomerUser } from "@/shared/lib/customer-auth";
import { getRequiredTermsByScope } from "@/shared/domain/terms/queries";
import {
  EVENT_FORMAT,
  TermsScope,
} from "@/shared/lib/validations/enums/prisma-types";
import { buildAddToCalendarUrls } from "@/shared/lib/ical/urls";
import { getBaseUrl } from "@/shared/lib/constants";
import { requireFeatureEnabled } from "@/shared/lib/features/check";
import {
  generateArticleMetadata,
  getSeoSettings,
} from "@/public/lib/seo/metadata-factory";
import {
  EventInfoPanel,
  type EventInfoPanelVenue,
} from "./_components/event-info-panel";
import { EventCalendarDisclosure } from "./_components/event-calendar-disclosure";
import { EventStatusNotice } from "./_components/event-status-notice";
import { EventRegistrationForm } from "./_components/event-registration-form";
import { RelatedEvents } from "./_components/related-events";
import { EventJsonLd } from "./_components/event-json-ld";
import { GalleryGrid } from "@/shared/components/gallery/GalleryGrid";

interface PageProps {
  params: Promise<{ slug: string }>;
}

const REGISTER_ANCHOR_ID = "event-register";

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await connection();

  const { slug } = await params;
  const [event, settings] = await Promise.all([
    getPublishedEventBySlug(slug),
    getSeoSettings(),
  ]);

  if (!event) {
    return { title: "イベントが見つかりません" };
  }

  const fallbackDescription =
    event.descriptionPlainText.trim() !== ""
      ? event.descriptionPlainText
      : `${event.title} - イベント詳細`;

  return generateArticleMetadata(
    {
      title: event.title,
      description: event.metaDescription ?? fallbackDescription,
      image: event.ogpImageUrl ?? event.thumbnailUrl,
      ogpTitle: event.ogpTitle,
      ogpDescription: event.ogpDescription ?? fallbackDescription,
      metaKeywords: event.metaKeywords,
    },
    settings,
    {
      canonicalUrl: `${getBaseUrl()}/events/${slug}`,
      ogType: "website",
    },
  );
}

export default async function EventDetailPage({
  params,
}: PageProps): Promise<ReactElement> {
  await connection();
  await requireFeatureEnabled("events");

  const { slug } = await params;
  const event = await getPublishedEventBySlug(slug);

  if (!event) {
    notFound();
  }

  const [slotInventory, turnstileSiteKey, requiredTerms, user] =
    await Promise.all([
      getSlotRegistrationCounts(event.id),
      getTurnstileSiteKey(),
      getRequiredTermsByScope(TermsScope.EVENT_REGISTRATION),
      getCurrentCustomerUser(),
    ]);

  const slotOptions = buildCurrentPublicEventSlotOptions({
    slots: slotInventory,
    registrationDeadline: event.registrationDeadline,
  });
  const registration = derivePublicEventRegistrationState({
    eventStatus: event.status,
    registrationOpen: event.registrationOpen,
    slots: slotOptions,
  });
  const canRegister =
    registration.kind === "open" || registration.kind === "waitlist-available";

  const baseUrl = getBaseUrl();
  const eventUrl = `${baseUrl}/events/${slug}`;
  const startDateIso = new Date(event.startTime).toISOString();
  const endDateIso = new Date(event.endTime).toISOString();
  const totalCapacity =
    slotOptions.length > 0
      ? slotOptions.reduce((sum, slot) => sum + slot.capacity, 0)
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
  // Phase B.1: 3 format (OFFLINE/ONLINE/HYBRID) 対応の会場表示。primary/secondary
  // は formatEventVenueDisplay が format を SSoT に構築する。event.meetingUrl は
  // 型を満たすため event ごと渡すのみで destructure しない（公開 JSX に render 禁止）。
  const venueDisplay = formatEventVenueDisplay(event);
  const virtualAccessible = isEventVirtualAccessible(event);

  // ONLINE では物理会場を表示しない。admin フォームは ONLINE 選択時に
  // PhysicalVenueFields を隠すだけで location/space/addressDetail の state は
  // 消去しないため、過去に OFFLINE/HYBRID で設定した値が DB に残存し得る。
  // 表示は format を正とする（formatEventVenueDisplay と同じ判断基準）。
  const venues: EventInfoPanelVenue[] = [];
  if (event.format !== EVENT_FORMAT.ONLINE) {
    if (event.space) {
      venues.push({
        kind: "space",
        slug: event.space.slug,
        name: event.space.name,
      });
    }
    if (event.location) {
      venues.push({
        kind: "location",
        name: event.location.name,
        address: event.location.address ?? null,
      });
    }
    if (event.addressDetail) {
      venues.push({ kind: "addressDetail", text: event.addressDetail });
    }
  }

  const resolvedDescriptionHtml = await resolveInternalLinkCards(
    event.descriptionHtml,
  );

  const infoPanelProps = {
    startTime: event.startTime,
    endTime: event.endTime,
    venues,
    venueDisplay,
    virtualAccessible,
    scheduleMode: event.scheduleMode,
    slots: slotOptions,
    tickets: event.tickets,
    registration,
    registerAnchorId: REGISTER_ANCHOR_ID,
  } as const;

  const calendarUrls = buildAddToCalendarUrls({
    summary: event.title,
    description:
      event.descriptionPlainText.trim() !== ""
        ? event.descriptionPlainText
        : event.title,
    startTime: new Date(event.startTime),
    endTime: new Date(event.endTime),
    ...(venueName !== null ? { location: venueName } : {}),
    icsDownloadUrl: "",
  });

  return (
    <>
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
            {...(venueName
              ? {
                  venue: {
                    name: venueName,
                    ...(venueAddress ? { address: venueAddress } : {}),
                    ...(event.space?.slug
                      ? { url: `${baseUrl}/spaces/${event.space.slug}` }
                      : {}),
                  },
                }
              : {})}
            {...(event.tickets.length > 0
              ? {
                  offers: {
                    price: event.tickets[0]?.price ?? 0,
                    priceCurrency: "JPY",
                    availability:
                      registration.kind === "waitlist-available"
                        ? "SoldOut"
                        : "InStock",
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
        toc={<EventInfoPanel variant="sidebar" {...infoPanelProps} />}
        mobileToc={<EventInfoPanel variant="mobile" {...infoPanelProps} />}
        showCta={false}
      >
        {event.descriptionHtml.trim() !== "" ? (
          <Prose variant="editorial" className="max-w-none">
            <SanitizedHtml html={resolvedDescriptionHtml} />
          </Prose>
        ) : null}

        {event.gallery.length > 0 && (
          <section aria-label="イベントギャラリー" className="mt-12">
            <GalleryGrid items={event.gallery} />
          </section>
        )}

        <section
          id={REGISTER_ANCHOR_ID}
          aria-labelledby="event-register-heading"
          className="mt-16 scroll-mt-[calc(var(--header-height)+2rem)]"
        >
          <Heading level={2} accent>
            <span id="event-register-heading">お申し込み</span>
          </Heading>
          <div className="mt-8 space-y-6">
            {registration.kind === "waitlist-available" && (
              <EventStatusNotice
                variant="warning"
                title="現在満員です"
                description="キャンセル待ちにご登録いただけます。繰り上げ当選のご連絡から24時間以内にご確定ください。"
              />
            )}
            {canRegister ? (
              <EventRegistrationForm
                key={event.id}
                eventId={event.id}
                turnstileSiteKey={turnstileSiteKey}
                scheduleMode={event.scheduleMode}
                slots={slotOptions}
                tickets={event.tickets.map((t) => ({
                  id: t.id,
                  name: t.name,
                  price: t.price,
                  unitSize: t.unitSize,
                }))}
                requiredTerms={requiredTerms.map((t) => ({
                  id: t.id,
                  slug: t.slug,
                  title: t.title,
                }))}
                isLoggedIn={user != null}
                slug={slug}
                mode={
                  registration.kind === "waitlist-available"
                    ? "waitlist"
                    : "register"
                }
              />
            ) : registration.kind === "deadline-passed" ? (
              <EventStatusNotice
                variant="muted"
                title="申込受付を終了しました"
                description="申込締切を過ぎたため、現在お申し込みいただけません。"
              />
            ) : (
              <EventStatusNotice
                variant="muted"
                title="申込受付を終了しました"
                description="このイベントの申込受付は終了しました。"
              />
            )}
          </div>
        </section>

        <EventCalendarDisclosure urls={calendarUrls} />

        <ArticleFooter url={eventUrl} title={event.title} />
      </ArticleLayout>

      <RelatedEvents
        excludeEventId={event.id}
        spaceId={event.space?.id ?? null}
      />
      <SiteCTA />
    </>
  );
}
