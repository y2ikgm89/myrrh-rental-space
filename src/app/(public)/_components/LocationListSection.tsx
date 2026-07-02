/**
 * LocationListSection — 公開拠点を縦型 Editorial 章として表示
 *
 * Hoshinoya / Aman / Cotton Club のパターンを踏襲した縦型「章」構造を 1 つの
 * セクションコンポーネントに統合する。
 * - 章ごとに hero image / Address+Routes pair / Hours / Parking+Amenities pair / Map
 * - 拠点 2 件以上で上部に anchor index ナビ
 * - Settings の代表連絡先（電話 / メール）も config トグルで表示
 */

import type { ReactElement } from "react";
import {
  IconArrowDown,
  IconExternalLink,
  IconMapPin,
  IconWifi,
  IconCar,
  IconAccessible,
  IconArrowUp,
  IconSmoking,
  IconToolsKitchen2,
  IconAperture,
  IconMusic,
} from "@tabler/icons-react";
import { ImageFrame } from "@/public/components/design-system/image-frame";
import { Heading } from "@/public/components/design-system/heading";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { SectionWrapper } from "@/public/components/sections/SectionWrapper";
import {
  getTitleClasses,
  getTitleStyle,
} from "@/public/components/sections/section-style-helpers";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import { DAY_LABELS, ATTR_LABELS } from "@/public/lib/seo/json-ld-config";
import { cn } from "@/shared/lib/cn";
import { isRecord } from "@/shared/lib/serialize";
import { AccessMap } from "./access-map";
import type { LocationForAccess } from "@/shared/domain/locations/public-queries";
import type { LocationListConfig } from "@/shared/lib/sections/definitions/location-list/schema";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";
import { PortableTextSpans } from "@/shared/components/portable-text/PortableTextSpans";
import { spansToPlainText } from "@/shared/lib/portable-text";

const ATTR_ICONS: Record<string, typeof IconWifi> = {
  wifi: IconWifi,
  parking: IconCar,
  barrier_free: IconAccessible,
  elevator: IconArrowUp,
  smoking_area: IconSmoking,
  food_allowed: IconToolsKitchen2,
  photography_allowed: IconAperture,
  music_allowed: IconMusic,
};

const DAY_ORDER = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const DAY_ABBREV: Record<string, string> = {
  monday: "Mo",
  tuesday: "Tu",
  wednesday: "We",
  thursday: "Th",
  friday: "Fr",
  saturday: "Sa",
  sunday: "Su",
};

interface BusinessHoursDisplay {
  label: string;
  time: string;
  microdataContent: string;
}

function parseAmenitiesEntries(value: unknown): string[] {
  if (!isRecord(value)) return [];
  return Object.entries(value)
    .filter(([, v]) => v === true)
    .map(([k]) => k);
}

function parseBusinessHoursForDisplay(
  businessHours: unknown,
): BusinessHoursDisplay[] {
  if (!isRecord(businessHours)) return [];

  const dayTimes: { key: string; label: string; time: string }[] = [];
  for (const dayKey of DAY_ORDER) {
    const dayValue = businessHours[dayKey];
    if (
      !isRecord(dayValue) ||
      !dayValue["isOpen"] ||
      !Array.isArray(dayValue["slots"])
    )
      continue;

    for (const slot of dayValue["slots"]) {
      if (
        !isRecord(slot) ||
        typeof slot["openTime"] !== "string" ||
        typeof slot["closeTime"] !== "string"
      )
        continue;
      dayTimes.push({
        key: dayKey,
        label: DAY_LABELS[dayKey] ?? dayKey,
        time: `${slot["openTime"]}-${slot["closeTime"]}`,
      });
    }
  }

  if (dayTimes.length === 0) return [];

  const groups = new Map<string, string[]>();
  const groupKeys = new Map<string, string[]>();
  for (const dt of dayTimes) {
    const existing = groups.get(dt.time);
    const existingKeys = groupKeys.get(dt.time);
    if (existing && existingKeys) {
      existing.push(dt.label);
      existingKeys.push(dt.key);
    } else {
      groups.set(dt.time, [dt.label]);
      groupKeys.set(dt.time, [dt.key]);
    }
  }

  const result: BusinessHoursDisplay[] = [];
  for (const [time, labels] of groups) {
    const keys = groupKeys.get(time) ?? [];
    const [opens = "", closes = ""] = time.split("-");
    const abbrevs = keys.map((k) => DAY_ABBREV[k] ?? k);
    const firstAbbrev = abbrevs[0] ?? "";
    const lastAbbrev = abbrevs[abbrevs.length - 1] ?? "";
    const microdataContent =
      abbrevs.length > 1
        ? `${firstAbbrev}-${lastAbbrev} ${opens}-${closes}`
        : `${firstAbbrev} ${opens}-${closes}`;

    const firstLabel = labels[0] ?? "";
    const lastLabel = labels[labels.length - 1] ?? "";
    result.push({
      label: labels.length > 1 ? `${firstLabel}〜${lastLabel}` : firstLabel,
      time: `${opens} – ${closes}`,
      microdataContent,
    });
  }

  return result;
}

interface BusinessInfoProps {
  readonly phone: string | null;
  readonly email: string | null;
  readonly name: string;
}

interface LocationListSectionProps {
  readonly config: LocationListConfig;
  readonly locations: readonly LocationForAccess[];
  readonly businessInfo: BusinessInfoProps;
  readonly style: SectionStylePayload;
}

function buildFallbackLocation(
  info: BusinessInfoProps,
): LocationForAccess | null {
  if (!info.phone && !info.email) return null;

  return {
    id: "fallback",
    slug: "main-location",
    name: info.name || "本拠点",
    description: null,
    address: "",
    postalCode: null,
    prefecture: null,
    city: null,
    streetAddress: null,
    buildingName: null,
    accessLines: [],
    parkingInfo: null,
    amenities: {},
    imageUrl: "",
    businessHours: null,
    specialHolidays: null,
    phoneNumber: info.phone,
    email: info.email,
    latitude: null,
    longitude: null,
    googleReviewUrl: null,
    googleBusinessPlaceId: null,
    priceRange: null,
    paymentAccepted: null,
  };
}

interface LocationChapterEntry {
  readonly anchorId: string;
  readonly index: number;
  readonly location: LocationForAccess;
}

interface LocationChapterProps {
  readonly anchorId: string;
  readonly index: number;
  readonly location: LocationForAccess;
  readonly isFirst: boolean;
  readonly showSectionDivider: boolean;
}

function LocationChapter({
  anchorId,
  index,
  location,
  isFirst,
  showSectionDivider,
}: LocationChapterProps): ReactElement {
  const transitLines = location.accessLines;
  const hoursDisplay = parseBusinessHoursForDisplay(location.businessHours);
  const amenityKeys = parseAmenitiesEntries(location.amenities);
  const indexLabel = String(index).padStart(2, "0");
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.address)}`;

  return (
    <article
      id={anchorId}
      className={cn(
        "scroll-mt-[calc(var(--header-height)+2rem)] space-y-12",
        showSectionDivider && "border-t border-border pt-12 md:pt-16",
      )}
      itemScope
      itemType="https://schema.org/Place"
    >
      <meta itemProp="name" content={location.name} />

      <header className="space-y-3 text-center">
        <p className="font-heading text-base italic tracking-eyebrow text-accent">
          Location {indexLabel}
        </p>
        <h2 className="text-h1 font-heading italic text-foreground">
          {location.name}
        </h2>
        {location.description && (
          <p className="mx-auto max-w-2xl pt-2 text-base leading-relaxed text-muted-foreground">
            {location.description}
          </p>
        )}
      </header>

      {location.imageUrl && (
        <ImageFrame
          src={location.imageUrl}
          alt={`${location.name} の建物外観`}
          fill
          aspect="wide"
          rounded={false}
          sizes="(max-width: 1280px) 100vw, 1280px"
          {...(isFirst && {
            loading: "eager",
            fetchPriority: "high",
          })}
        />
      )}

      {location.address && (
        <div
          className={cn(
            "grid gap-12 lg:gap-16",
            transitLines.length > 0 && "lg:grid-cols-2",
          )}
        >
          <div
            className="space-y-6"
            itemProp="address"
            itemScope
            itemType="https://schema.org/PostalAddress"
          >
            <div className="border-b border-border pb-3">
              <p className="text-sm font-medium uppercase tracking-eyebrow text-muted-foreground">
                Address / 住所
              </p>
            </div>
            <p
              className="text-h3 font-heading italic text-foreground"
              itemProp="streetAddress"
            >
              {location.address}
            </p>
            <a
              href={mapsHref}
              target="_blank"
              rel="noreferrer"
              className="group inline-flex min-h-11 items-center gap-2 text-sm uppercase tracking-eyebrow text-foreground"
            >
              <IconMapPin className="h-4 w-4 text-accent" aria-hidden="true" />
              <span className="border-b border-foreground pb-0.5 transition-opacity group-hover:opacity-60">
                Google Maps で開く
              </span>
              <IconExternalLink
                className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </a>
          </div>

          {transitLines.length > 0 && (
            <div className="space-y-6">
              <div className="border-b border-border pb-3">
                <p className="text-sm font-medium uppercase tracking-eyebrow text-muted-foreground">
                  Routes / アクセス
                </p>
              </div>
              <ol className="space-y-5 border-l border-accent/30 pl-6">
                {transitLines.map((line, idx) => (
                  <li
                    key={line}
                    className="-ml-[calc(1.5rem+1px)] flex gap-4 pl-6"
                  >
                    <span
                      aria-hidden="true"
                      className="shrink-0 font-heading text-2xl font-light italic leading-none text-accent/70"
                    >
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <p className="pt-0.5 text-base leading-relaxed text-foreground">
                      {line}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {hoursDisplay.length > 0 && (
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="border-b border-border pb-3">
            <p className="text-sm font-medium uppercase tracking-eyebrow text-muted-foreground">
              Hours / 営業時間
            </p>
          </div>
          <dl className="divide-y divide-divider">
            {hoursDisplay.map((h) => (
              <div
                key={h.microdataContent}
                className="grid grid-cols-[5rem_1fr] items-baseline gap-4 py-3"
              >
                <dt className="text-sm font-medium text-muted-foreground">
                  {h.label}
                </dt>
                <dd className="text-h4 font-heading italic text-foreground">
                  <time itemProp="openingHours" content={h.microdataContent}>
                    {h.time}
                  </time>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {(location.parkingInfo || amenityKeys.length > 0) && (
        <div
          className={cn(
            "grid gap-12 lg:gap-16",
            location.parkingInfo && amenityKeys.length > 0 && "lg:grid-cols-2",
          )}
        >
          {location.parkingInfo && (
            <div className="space-y-6">
              <div className="border-b border-border pb-3">
                <p className="text-sm font-medium uppercase tracking-eyebrow text-muted-foreground">
                  Parking / 駐車場
                </p>
              </div>
              <p className="whitespace-pre-line text-base leading-relaxed text-foreground">
                {location.parkingInfo}
              </p>
            </div>
          )}

          {amenityKeys.length > 0 && (
            <div className="space-y-6">
              <div className="border-b border-border pb-3">
                <p className="text-sm font-medium uppercase tracking-eyebrow text-muted-foreground">
                  Amenities / 設備
                </p>
              </div>
              <ul className="flex flex-wrap gap-x-6 gap-y-3">
                {amenityKeys.map((key) => {
                  const Icon = ATTR_ICONS[key];
                  const label = ATTR_LABELS[key] ?? key;
                  return (
                    <li
                      key={key}
                      className="inline-flex items-center gap-2 text-base text-foreground"
                    >
                      {Icon && (
                        <Icon
                          className="h-4 w-4 text-accent"
                          aria-hidden="true"
                        />
                      )}
                      <span>{label}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {location.address && (
        <div className="space-y-4">
          <div className="border-b border-border pb-3">
            <p className="text-sm font-medium uppercase tracking-eyebrow text-muted-foreground">
              Map / マップ
            </p>
          </div>
          <AccessMap
            address={location.address}
            title={`${location.name} のアクセスマップ`}
          />
        </div>
      )}
    </article>
  );
}

interface LocationsOverviewBlockProps {
  readonly entries: readonly LocationChapterEntry[];
  readonly headline: string;
}

function LocationsOverviewBlock({
  entries,
  headline,
}: LocationsOverviewBlockProps): ReactElement {
  const hasMultiple = entries.length > 1;

  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="text-sm font-medium uppercase tracking-eyebrow text-muted-foreground">
        Our Locations / 拠点一覧
      </p>
      <h2 className="text-h2 mt-4 font-heading italic text-foreground">
        {headline}
      </h2>

      {hasMultiple && (
        <nav
          aria-label="拠点ナビゲーション"
          className="mt-10 border-y border-border py-8"
        >
          <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-5 md:gap-x-14">
            {entries.map((entry) => (
              <li key={entry.anchorId}>
                <a
                  href={`#${entry.anchorId}`}
                  className="group inline-flex min-h-11 items-center gap-3 py-2 transition-opacity hover:opacity-60"
                >
                  <span
                    aria-hidden="true"
                    className="font-heading text-2xl font-light italic leading-none text-accent md:text-3xl"
                  >
                    {String(entry.index).padStart(2, "0")}
                  </span>
                  <span className="border-b border-transparent pb-0.5 text-base text-foreground transition-colors group-hover:border-foreground md:text-lg">
                    {entry.location.name}
                  </span>
                  <IconArrowDown
                    aria-hidden="true"
                    className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-y-0.5 md:h-5 md:w-5"
                  />
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}

interface GlobalContactBlockProps {
  readonly headline: string;
  readonly businessInfo: BusinessInfoProps;
}

function GlobalContactBlock({
  headline,
  businessInfo,
}: GlobalContactBlockProps): ReactElement {
  return (
    <div
      className="space-y-12"
      itemScope
      itemType="https://schema.org/Organization"
    >
      <meta itemProp="name" content={businessInfo.name} />

      <div className="text-center">
        <p className="text-sm font-medium uppercase tracking-eyebrow text-muted-foreground">
          Get in Touch
        </p>
        <h2 className="text-h2 mt-3 font-heading italic text-foreground">
          {headline}
        </h2>
      </div>

      <div className="@container">
        <dl className="mx-auto grid max-w-3xl gap-10 @sm:grid-cols-2 @sm:gap-12">
          {businessInfo.phone && (
            <div className="text-center">
              <dt className="text-sm font-medium text-muted-foreground">
                電話
              </dt>
              <dd className="mt-4">
                <a
                  itemProp="telephone"
                  href={`tel:${businessInfo.phone}`}
                  className="text-h1 inline-flex min-h-11 items-center font-heading italic text-foreground transition-opacity hover:opacity-60"
                >
                  {businessInfo.phone}
                </a>
              </dd>
            </div>
          )}

          {businessInfo.email && (
            <div className="text-center">
              <dt className="text-sm font-medium text-muted-foreground">
                メール
              </dt>
              <dd className="mt-4">
                <a
                  itemProp="email"
                  href={`mailto:${businessInfo.email}`}
                  className="text-h3 inline-flex min-h-11 items-center break-all border-b border-foreground pb-1 text-foreground transition-opacity hover:opacity-60"
                >
                  {businessInfo.email}
                </a>
              </dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}

export function LocationListSection({
  config,
  locations,
  businessInfo,
  style,
}: LocationListSectionProps): ReactElement {
  // mode=selected の場合は config.locationSlugs の指定順に並べ替え
  let orderedLocations: readonly LocationForAccess[];
  if (config.mode === "selected") {
    const slugOrder = config.locationSlugs.map((s) => s.slug);
    const bySlug = new Map(locations.map((l) => [l.slug, l]));
    const ordered: LocationForAccess[] = [];
    for (const slug of slugOrder) {
      const loc = bySlug.get(slug);
      if (loc) ordered.push(loc);
    }
    orderedLocations = ordered;
  } else {
    orderedLocations = locations;
  }

  // 拠点 0 件かつ mode=all 時は Settings から fallback location を合成
  let resolvedLocations: readonly LocationForAccess[];
  if (orderedLocations.length === 0 && config.mode === "all") {
    const fallback = buildFallbackLocation(businessInfo);
    resolvedLocations = fallback ? [fallback] : [];
  } else {
    resolvedLocations = orderedLocations;
  }

  const entries: LocationChapterEntry[] = resolvedLocations.map((loc, i) => ({
    anchorId: loc.slug,
    index: i + 1,
    location: loc,
  }));

  const overviewHeadline =
    config.overviewHeadline ||
    (entries.length > 1
      ? "全拠点のご案内"
      : (entries[0]?.location.name ?? "拠点のご案内"));

  const showOverview = config.overviewNavEnabled && entries.length > 0;
  const showGlobalContact =
    config.globalContactEnabled &&
    Boolean(businessInfo.phone || businessInfo.email);

  return (
    <SectionWrapper style={style} layout={config.layout}>
      {config.title.length > 0 && (
        <div className="mb-8 text-center md:mb-12">
          <ScrollReveal>
            {config.sectionLabel && (
              <SectionLabel>{config.sectionLabel}</SectionLabel>
            )}
            <div style={getTitleStyle(style)}>
              <Heading
                level={2}
                className={cn("mt-4 tracking-tight", getTitleClasses(style))}
              >
                <PortableTextSpans spans={config.title} />
              </Heading>
            </div>
          </ScrollReveal>
        </div>
      )}

      {showOverview && (
        <ScrollReveal>
          <div className="pb-12 md:pb-16">
            <LocationsOverviewBlock
              entries={entries}
              headline={spansToPlainText(overviewHeadline)}
            />
          </div>
        </ScrollReveal>
      )}

      {showGlobalContact && (
        <ScrollReveal>
          <div className="border-b border-border pb-12 md:pb-16">
            <GlobalContactBlock
              headline={spansToPlainText(config.globalContactHeadline)}
              businessInfo={businessInfo}
            />
          </div>
        </ScrollReveal>
      )}

      {entries.length > 0 && (
        <div
          className={cn(
            "space-y-16 md:space-y-20",
            (showOverview || showGlobalContact) && "pt-12 md:pt-16",
          )}
        >
          {entries.map((entry, i) => (
            <ScrollReveal key={entry.anchorId} delay={Math.min(0.1 * i, 0.3)}>
              <LocationChapter
                anchorId={entry.anchorId}
                index={entry.index}
                location={entry.location}
                isFirst={i === 0}
                showSectionDivider={i > 0}
              />
            </ScrollReveal>
          ))}
        </div>
      )}
    </SectionWrapper>
  );
}
