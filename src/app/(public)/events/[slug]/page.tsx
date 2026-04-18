import type { Metadata } from "next";
import type { ReactElement } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import {
  IconCalendar,
  IconMapPin,
  IconUsers,
  IconCurrencyYen,
} from "@tabler/icons-react";
import { Container } from "@/public/components/design-system/container";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { Badge } from "@/public/components/design-system/badge";
import { Section } from "@/public/components/design-system/section";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { PageHero } from "@/public/components/layouts/page-hero";
import { formatEventDateTimeRange } from "@/public/lib/format-event-date";
import { getPublishedEventBySlug } from "@/shared/domain/events/public-queries";
import { getRegistrationCount } from "@/shared/domain/events/registration-queries";
import { getTurnstileSiteKey } from "@/public/data/turnstile";
import { buildAddToCalendarUrls } from "@/shared/lib/ical";
import { AddToCalendar } from "@/app/(public)/_shared/components/ui/add-to-calendar";
import { EventRegistrationForm } from "./_components/event-registration-form";

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

  return {
    title: event.title,
    description: event.description ?? `${event.title} - イベント詳細`,
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
  const canRegister =
    event.registrationOpen && event.status === "PUBLISHED" && !isFull;

  return (
    <PageLayout
      variant="content"
      hero={<PageHero variant="compact" title={event.title} />}
    >
      <Section>
        <Container variant="narrow">
          <Stack gap="lg">
            <div className="flex flex-wrap gap-2">
              {event.space ? (
                <Badge variant="info">{event.space.name}</Badge>
              ) : null}
              {event.capacity != null ? (
                <Badge variant="default">定員 {event.capacity}名</Badge>
              ) : null}
              {isFull ? (
                <Badge variant="warning">満員</Badge>
              ) : event.registrationOpen ? (
                <Badge variant="success">申込受付中</Badge>
              ) : (
                <Badge variant="warning">申込受付終了</Badge>
              )}
            </div>

            <div className="space-y-4 border border-border p-4 sm:p-6">
              <div className="flex items-start gap-3">
                <IconCalendar
                  className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-medium text-foreground">日時</p>
                  <p className="text-sm text-muted-foreground">
                    {formatEventDateTimeRange(event.startTime, event.endTime)}
                  </p>
                </div>
              </div>

              {event.location ? (
                <div className="flex items-start gap-3">
                  <IconMapPin
                    className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">場所</p>
                    <p className="text-sm text-muted-foreground">
                      {event.location}
                    </p>
                  </div>
                </div>
              ) : null}

              {event.space ? (
                <div className="flex items-start gap-3">
                  <IconUsers
                    className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      スペース
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {event.space.name}
                    </p>
                  </div>
                </div>
              ) : null}

              {event.price != null ? (
                <div className="flex items-start gap-3">
                  <IconCurrencyYen
                    className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">料金</p>
                    <p className="text-sm text-muted-foreground">
                      {event.price === 0
                        ? "無料"
                        : `${event.price.toLocaleString("ja-JP")}円`}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            <AddToCalendar
              variant="public"
              urls={buildAddToCalendarUrls({
                summary: event.title,
                description: event.description ?? event.title,
                startTime: new Date(event.startTime),
                endTime: new Date(event.endTime),
                ...(event.location != null ? { location: event.location } : {}),
                icsDownloadUrl: "",
              })}
            />

            {event.description ? (
              <div className="space-y-2">
                <Heading level={2}>イベント詳細</Heading>
                <p className="whitespace-pre-wrap text-muted-foreground leading-relaxed">
                  {event.description}
                </p>
              </div>
            ) : null}

            {canRegister ? (
              <EventRegistrationForm
                eventId={event.id}
                turnstileSiteKey={turnstileSiteKey}
                remainingCapacity={remainingCapacity}
              />
            ) : isFull ? (
              <div className="border border-border bg-background p-4 text-center sm:p-6">
                <Badge variant="warning">満員です</Badge>
                <p className="mt-2 text-sm text-muted-foreground">
                  現在、定員に達しているためお申し込みいただけません
                </p>
              </div>
            ) : !event.registrationOpen ? (
              <div className="border border-border bg-background p-4 text-center sm:p-6">
                <p className="text-sm text-muted-foreground">
                  このイベントの申込受付は終了しました
                </p>
              </div>
            ) : null}
          </Stack>
        </Container>
      </Section>
    </PageLayout>
  );
}
