import type { Metadata } from "next";
import type { ReactElement, ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import {
  IconCalendar,
  IconMapPin,
  IconBuilding,
  IconUsers,
  IconCoin,
  IconAlertCircle,
} from "@tabler/icons-react";
import { Container } from "@/public/components/design-system/container";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { Prose } from "@/public/components/design-system/prose";
import { Badge } from "@/public/components/design-system/badge";
import { Section } from "@/public/components/design-system/section";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { PageHero } from "@/public/components/layouts/page-hero";
import { Breadcrumb } from "@/public/components/layouts/breadcrumb";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { EventJsonLd } from "@/public/components/seo/json-ld";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
import { formatEventDateTimeRange } from "@/public/lib/format-event-date";
import {
  getPublishedEventBySlug,
  isEventRegistrationPastDeadline,
} from "@/shared/domain/events/public-queries";
import { getRegistrationCount } from "@/shared/domain/events/registration-queries";
import {
  formatEventAddress,
  formatEventVenue,
} from "@/shared/domain/events/venue";
import { getTurnstileSiteKey } from "@/public/data/turnstile";
import { buildAddToCalendarUrls } from "@/shared/lib/ical/urls";
import { AddToCalendar } from "@/app/(public)/_shared/components/ui/add-to-calendar";
import { getBaseUrl } from "@/shared/lib/constants";
import { formatPrice } from "@/shared/lib/pricing/format";
import { EventStatus } from "@/shared/lib/validations/enums/prisma-types";
import { EventRegistrationForm } from "./_components/event-registration-form";
import { RelatedEvents } from "./_components/related-events";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await connection();

  const { slug } = await params;
  const event = await getPublishedEventBySlug(slug);

  if (!event) {
    return { title: "イベントが見つかりません" };
  }

  const description =
    event.descriptionPlainText.trim() !== ""
      ? event.descriptionPlainText
      : `${event.title} - イベント詳細`;
  const canonicalUrl = `${getBaseUrl()}/events/${slug}`;

  return {
    title: event.title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      type: "website",
      title: event.title,
      description,
      url: canonicalUrl,
      ...(event.thumbnailUrl ? { images: [event.thumbnailUrl] } : {}),
    },
  };
}

export default async function EventDetailPage({
  params,
}: PageProps): Promise<ReactElement> {
  await connection();

  const { slug } = await params;
  const event = await getPublishedEventBySlug(slug);

  if (!event) {
    notFound();
  }

  const [registrationCount, turnstileSiteKey] = await Promise.all([
    getRegistrationCount(event.id),
    getTurnstileSiteKey(),
  ]);

  const remainingCapacity =
    event.capacity != null ? event.capacity - registrationCount : null;
  const isFull = remainingCapacity !== null && remainingCapacity <= 0;
  // 申込締切：未設定なら開始時刻、設定があればその時刻まで受付（domain ヘルパー）
  const isPastDeadline = isEventRegistrationPastDeadline(event);
  const canRegister =
    event.registrationOpen &&
    event.status === EventStatus.PUBLISHED &&
    !isFull &&
    !isPastDeadline;

  const baseUrl = getBaseUrl();
  const eventUrl = `${baseUrl}/events/${slug}`;
  const startDateIso = new Date(event.startTime).toISOString();
  const endDateIso = new Date(event.endTime).toISOString();

  const venueName = formatEventVenue({
    location: event.location,
    space: event.space,
    addressDetail: event.addressDetail,
  });
  const venueAddress = formatEventAddress({
    location: event.location,
    addressDetail: event.addressDetail,
  });

  const breadcrumbItems: readonly { label: string; href?: string }[] = [
    { label: "イベント一覧", href: "/events" },
    { label: event.title },
  ];

  return (
    <PageLayout
      variant="content"
      hero={
        event.thumbnailUrl ? (
          <PageHero
            variant="editorial"
            title={event.title}
            label="EVENT"
            image={{ src: event.thumbnailUrl, alt: event.title }}
            breadcrumb={<Breadcrumb items={breadcrumbItems} />}
          />
        ) : (
          <PageHero
            variant="compact"
            title={event.title}
            breadcrumb={<Breadcrumb items={breadcrumbItems} />}
          />
        )
      }
      cta={<SiteCTA />}
    >
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
        eventAttendanceMode="OfflineEventAttendanceMode"
        {...(venueName
          ? {
              location: {
                name: venueName,
                ...(venueAddress ? { address: venueAddress } : {}),
                ...(event.space?.slug
                  ? { url: `${baseUrl}/spaces/${event.space.slug}` }
                  : {}),
              },
            }
          : {})}
        {...(event.price != null
          ? {
              offers: {
                price: event.price,
                priceCurrency: "JPY",
                availability: isFull ? "SoldOut" : "InStock",
                url: eventUrl,
              },
            }
          : {})}
        {...(event.capacity != null
          ? { maximumAttendeeCapacity: event.capacity }
          : {})}
      />

      <Section className="pt-10 pb-[var(--spacing-section)] md:pt-14">
        <Container variant="narrow">
          <Stack gap="lg">
            <div className="flex flex-wrap gap-2">
              {isFull ? (
                <Badge variant="warning">満員</Badge>
              ) : event.registrationOpen ? (
                <Badge variant="success">申込受付中</Badge>
              ) : (
                <Badge variant="warning">申込受付終了</Badge>
              )}
              {event.capacity != null ? (
                <Badge variant="default">定員 {event.capacity}名</Badge>
              ) : null}
              {event.space ? (
                <Badge variant="info">{event.space.name}</Badge>
              ) : null}
            </div>

            <dl className="grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2">
              <InfoCell
                icon={<IconCalendar className="h-5 w-5" aria-hidden="true" />}
                label="日時"
              >
                {formatEventDateTimeRange(event.startTime, event.endTime)}
              </InfoCell>

              {event.space ? (
                <InfoCell
                  icon={<IconBuilding className="h-5 w-5" aria-hidden="true" />}
                  label="スペース"
                >
                  <Link
                    href={`/spaces/${event.space.slug}`}
                    className="underline decoration-border decoration-1 underline-offset-4 transition-colors hover:decoration-foreground"
                  >
                    {event.space.name}
                  </Link>
                </InfoCell>
              ) : null}

              {event.location ? (
                <InfoCell
                  icon={<IconMapPin className="h-5 w-5" aria-hidden="true" />}
                  label="会場"
                >
                  {event.location.name}
                  {event.location.address ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {event.location.address}
                    </span>
                  ) : null}
                </InfoCell>
              ) : null}

              {event.addressDetail ? (
                <InfoCell
                  icon={<IconMapPin className="h-5 w-5" aria-hidden="true" />}
                  label="補足"
                >
                  {event.addressDetail}
                </InfoCell>
              ) : null}

              {event.capacity != null ? (
                <InfoCell
                  icon={<IconUsers className="h-5 w-5" aria-hidden="true" />}
                  label="定員"
                >
                  {event.capacity}名
                  {remainingCapacity !== null && !isFull ? (
                    <span className="ml-2 text-xs text-accent">
                      残り {remainingCapacity} 名
                    </span>
                  ) : null}
                </InfoCell>
              ) : null}

              {event.price != null ? (
                <InfoCell
                  icon={<IconCoin className="h-5 w-5" aria-hidden="true" />}
                  label="参加費"
                >
                  {event.price === 0 ? "無料" : formatPrice(event.price)}
                </InfoCell>
              ) : null}
            </dl>

            <AddToCalendar
              variant="public"
              urls={buildAddToCalendarUrls({
                summary: event.title,
                description:
                  event.descriptionPlainText.trim() !== ""
                    ? event.descriptionPlainText
                    : event.title,
                startTime: new Date(event.startTime),
                endTime: new Date(event.endTime),
                ...(venueName !== null ? { location: venueName } : {}),
                icsDownloadUrl: "",
              })}
            />

            {event.descriptionHtml.trim() !== "" ? (
              <div className="space-y-4">
                <Heading level={2}>イベント詳細</Heading>
                <Prose variant="editorial">
                  <SanitizedHtml html={event.descriptionHtml} />
                </Prose>
              </div>
            ) : null}

            {canRegister ? (
              <EventRegistrationForm
                key={event.id}
                eventId={event.id}
                turnstileSiteKey={turnstileSiteKey}
                remainingCapacity={remainingCapacity}
              />
            ) : isFull ? (
              <EventStatusNotice
                variant="warning"
                title="定員に達しました"
                description="このイベントは満員のため、現在お申し込みいただけません。"
              />
            ) : isPastDeadline ? (
              <EventStatusNotice
                variant="muted"
                title="申込受付を終了しました"
                description="申込締切を過ぎたため、現在お申し込みいただけません。"
              />
            ) : !event.registrationOpen ? (
              <EventStatusNotice
                variant="muted"
                title="申込受付を終了しました"
                description="このイベントの申込受付は終了しました。"
              />
            ) : null}
          </Stack>
        </Container>
      </Section>

      <RelatedEvents
        excludeEventId={event.id}
        spaceId={event.space?.id ?? null}
      />
    </PageLayout>
  );
}

interface InfoCellProps {
  readonly icon: ReactElement;
  readonly label: string;
  readonly children: ReactNode;
}

function InfoCell({ icon, label, children }: InfoCellProps): ReactElement {
  return (
    <div className="flex items-start gap-3 bg-background p-4 sm:p-5">
      <span className="mt-0.5 shrink-0 text-accent">{icon}</span>
      <div className="min-w-0 space-y-1">
        <dt className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </dt>
        <dd className="text-sm leading-relaxed text-foreground">{children}</dd>
      </div>
    </div>
  );
}

interface EventStatusNoticeProps {
  readonly variant: "warning" | "muted";
  readonly title: string;
  readonly description: string;
}

function EventStatusNotice({
  variant,
  title,
  description,
}: EventStatusNoticeProps): ReactElement {
  return (
    <div
      className="flex items-start gap-4 border border-border bg-surface p-6 sm:p-8"
      role="status"
    >
      <IconAlertCircle
        className={
          variant === "warning"
            ? "mt-0.5 h-6 w-6 shrink-0 text-accent"
            : "mt-0.5 h-6 w-6 shrink-0 text-muted-foreground"
        }
        aria-hidden="true"
      />
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
