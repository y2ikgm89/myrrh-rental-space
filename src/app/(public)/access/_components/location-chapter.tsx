/**
 * LocationChapter — /access ページの拠点単位の Editorial ブロック
 *
 * Hoshinoya / Aman / Cotton Club のパターンを踏襲した縦型「章」構造:
 *   1. Eyebrow（拠点番号 + ラテン名）+ Serif italic h2（拠点名）
 *   2. Hero image（landscape 2:1）
 *   3. Featured address + Google Maps editorial link
 *   4. Map iframe（拠点ごと）
 *   5. 2-col grid: Routes（ナンバリング）/ Hours（divide-y テーブル）
 */

import type { ReactElement } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
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
import { DAY_LABELS, ATTR_LABELS } from "@/public/lib/seo/json-ld-config";
import { cn } from "@/shared/lib/cn";
import { isRecord } from "@/shared/lib/serialize";
import { AccessMap } from "./access-map";
import type { LocationForAccess } from "@/shared/domain/locations/public-queries";

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

function parseAmenitiesEntries(value: unknown): string[] {
  if (!isRecord(value)) return [];
  return Object.entries(value)
    .filter(([, v]) => v === true)
    .map(([k]) => k);
}

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

interface LocationChapterProps {
  readonly anchorId: string;
  readonly index: number;
  readonly location: LocationForAccess;
  readonly googleMapsUrl?: string | null;
  readonly showSectionDivider?: boolean;
}

export function LocationChapter({
  anchorId,
  index,
  location,
  googleMapsUrl,
  showSectionDivider = false,
}: LocationChapterProps): ReactElement {
  const transitLines = location.accessLines;

  const hoursDisplay = parseBusinessHoursForDisplay(location.businessHours);
  const amenityKeys = parseAmenitiesEntries(location.amenities);

  const indexLabel = String(index).padStart(2, "0");
  const mapsHref = googleMapsUrl
    ? googleMapsUrl
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.address)}`;

  return (
    <article
      id={anchorId}
      className={cn(
        "scroll-mt-[calc(var(--header-height)+2rem)] space-y-12",
        showSectionDivider && "border-t border-border pt-20 md:pt-24",
      )}
      itemScope
      itemType="https://schema.org/Place"
    >
      <meta itemProp="name" content={location.name} />

      {/* Chapter header */}
      <header className="space-y-3 text-center">
        <p className="font-heading text-base italic tracking-[0.18em] text-accent">
          Location {indexLabel}
        </p>
        <h2 className="font-heading text-[clamp(2rem,4vw,2.75rem)] font-light italic leading-tight text-foreground">
          {location.name}
        </h2>
        {location.description && (
          <p className="mx-auto max-w-2xl pt-2 text-sm leading-relaxed text-muted-foreground md:text-base">
            {location.description}
          </p>
        )}
        {location.slug !== "main-location" && (
          <div className="pt-1">
            <Link
              href={`/access/${location.slug}` as Route<string>}
              className="text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
            >
              詳細を見る
            </Link>
          </div>
        )}
      </header>

      {/* Hero image (optional — fallback location may not have image) */}
      {location.imageUrl && (
        <ImageFrame
          src={location.imageUrl}
          alt={`${location.name} の建物外観`}
          fill
          aspect="wide"
          rounded={false}
          sizes="(max-width: 1280px) 100vw, 1280px"
        />
      )}

      {/* Address + Routes pair — spatial pair（どこに / どう行く）
          Routes 不在時は Address full-width にフォールバック */}
      <div
        className={cn(
          "grid gap-12 lg:gap-16",
          transitLines.length > 0 && "lg:grid-cols-2",
        )}
      >
        {/* Address (always present) */}
        <div
          className="space-y-6"
          itemProp="address"
          itemScope
          itemType="https://schema.org/PostalAddress"
        >
          <div className="border-b border-border pb-3">
            <p className="text-eyebrow uppercase text-muted-foreground">
              Address / 住所
            </p>
          </div>
          <p
            className="font-heading text-[clamp(1.25rem,2vw,1.625rem)] font-light italic leading-snug text-foreground"
            itemProp="streetAddress"
          >
            {location.address}
          </p>
          <a
            href={mapsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-foreground"
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

        {/* Routes (optional, paired with Address) */}
        {transitLines.length > 0 && (
          <div className="space-y-6">
            <div className="border-b border-border pb-3">
              <p className="text-eyebrow uppercase text-muted-foreground">
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
                  <p className="pt-0.5 text-sm leading-relaxed text-foreground">
                    {line}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {/* Hours — standalone（present 時のみ） */}
      {hoursDisplay.length > 0 && (
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="border-b border-border pb-3">
            <p className="text-eyebrow uppercase text-muted-foreground">
              Hours / 営業時間
            </p>
          </div>
          <dl className="divide-y divide-border border-b border-border">
            {hoursDisplay.map((h) => (
              <div
                key={h.microdataContent}
                className="grid grid-cols-[5rem_1fr] items-baseline gap-4 py-3"
              >
                <dt className="text-eyebrow uppercase text-muted-foreground">
                  {h.label}
                </dt>
                <dd className="font-heading text-base italic text-foreground md:text-lg">
                  <time itemProp="openingHours" content={h.microdataContent}>
                    {h.time}
                  </time>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Parking + Amenities pair — 両方ある時のみ 2-col、片方なら full-width */}
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
                <p className="text-eyebrow uppercase text-muted-foreground">
                  Parking / 駐車場
                </p>
              </div>
              <p className="whitespace-pre-line text-sm leading-relaxed text-foreground md:text-base">
                {location.parkingInfo}
              </p>
            </div>
          )}

          {amenityKeys.length > 0 && (
            <div className="space-y-6">
              <div className="border-b border-border pb-3">
                <p className="text-eyebrow uppercase text-muted-foreground">
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
                      className="inline-flex items-center gap-2 text-sm text-foreground"
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

      {/* Map iframe — 章末に配置（読み終わったら地図で位置を確認）
          Cotton Club Tokyo の調査済み pattern + NN/g lazy-load best practice */}
      <div className="space-y-4">
        <div className="border-b border-border pb-3">
          <p className="text-eyebrow uppercase text-muted-foreground">
            Map / マップ
          </p>
        </div>
        <AccessMap
          address={location.address}
          title={`${location.name} のアクセスマップ`}
        />
      </div>
    </article>
  );
}
