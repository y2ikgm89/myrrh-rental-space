/**
 * BusinessInfo — アクセス・営業情報カード
 *
 * Server Component。DB からビジネス情報を取得して表示。
 * schema.org LocalBusiness microdata で NAP 一貫性を確保。
 */

import type { ReactElement } from "react";
import {
  ExternalLink,
  Wifi,
  Car,
  Accessibility,
  ArrowUpFromDot,
  Cigarette,
  Utensils,
  Aperture,
  Music,
  MapPin,
  Phone,
  Mail,
  Clock,
  CalendarOff,
} from "lucide-react";
import { getBusinessInfo } from "@/public/data/business";
import { DAY_LABELS, ATTR_LABELS } from "@/public/lib/seo/json-ld-config";
import { Heading } from "@/public/components/design-system/heading";
import { isRecord } from "@/shared/lib/serialize";

// =============================================================================
// Constants
// =============================================================================

const DAY_ORDER = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const ATTR_ICONS: Record<string, typeof Wifi> = {
  wifi: Wifi,
  parking: Car,
  barrier_free: Accessibility,
  elevator: ArrowUpFromDot,
  smoking_area: Cigarette,
  food_allowed: Utensils,
  photography_allowed: Aperture,
  music_allowed: Music,
};

const DAY_ABBREV: Record<string, string> = {
  monday: "Mo",
  tuesday: "Tu",
  wednesday: "We",
  thursday: "Th",
  friday: "Fr",
  saturday: "Sa",
  sunday: "Su",
};

// =============================================================================
// Helpers
// =============================================================================

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
      time: `${opens} - ${closes}`,
      microdataContent,
    });
  }

  return result;
}

// =============================================================================
// Sub-components
// =============================================================================

function InfoSection({
  icon: Icon,
  label,
  children,
}: {
  readonly icon: typeof MapPin;
  readonly label: string;
  readonly children: ReactElement;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <dt className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
          {label}
        </dt>
        <dd className="mt-1 text-sm text-foreground">{children}</dd>
      </div>
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export async function BusinessInfo(): Promise<ReactElement> {
  const info = await getBusinessInfo();
  const hoursDisplay = parseBusinessHoursForDisplay(info.businessHours);

  return (
    <div
      className="rounded-lg border border-border bg-surface p-6"
      itemScope
      itemType="https://schema.org/LocalBusiness"
    >
      <Heading level={3} className="!text-base">
        アクセス・営業情報
      </Heading>
      <meta itemProp="name" content={info.name} />

      <dl className="mt-5 space-y-4">
        {info.address && (
          <InfoSection icon={MapPin} label="住所">
            <div
              itemProp="address"
              itemScope
              itemType="https://schema.org/PostalAddress"
            >
              {info.postalCode && (
                <meta itemProp="postalCode" content={info.postalCode} />
              )}
              {info.prefecture && (
                <meta itemProp="addressRegion" content={info.prefecture} />
              )}
              {info.city && (
                <meta itemProp="addressLocality" content={info.city} />
              )}
              {info.streetAddress && (
                <meta itemProp="streetAddress" content={info.streetAddress} />
              )}
              {info.address}
            </div>
          </InfoSection>
        )}

        {info.phone && (
          <InfoSection icon={Phone} label="電話番号">
            <a
              itemProp="telephone"
              href={`tel:${info.phone}`}
              className="transition-colors hover:text-accent"
            >
              {info.phone}
            </a>
          </InfoSection>
        )}

        {info.email && (
          <InfoSection icon={Mail} label="メール">
            <a
              itemProp="email"
              href={`mailto:${info.email}`}
              className="break-all transition-colors hover:text-accent"
            >
              {info.email}
            </a>
          </InfoSection>
        )}

        {hoursDisplay.length > 0 && (
          <InfoSection icon={Clock} label="営業時間">
            <div className="space-y-1">
              {hoursDisplay.map((h) => (
                <div
                  key={h.microdataContent}
                  className="flex items-center gap-3"
                >
                  <span className="min-w-[4rem] text-muted-foreground">
                    {h.label}
                  </span>
                  <time itemProp="openingHours" content={h.microdataContent}>
                    {h.time}
                  </time>
                </div>
              ))}
            </div>
          </InfoSection>
        )}

        {info.holidayNotice && (
          <InfoSection icon={CalendarOff} label="休業日">
            <>{info.holidayNotice}</>
          </InfoSection>
        )}
      </dl>

      {/* 施設属性 */}
      {info.businessAttributes &&
        Object.values(info.businessAttributes).some(Boolean) && (
          <div className="mt-5 border-t border-border pt-5">
            <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
              設備・サービス
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(info.businessAttributes)
                .filter(([, value]) => value)
                .map(([key]) => {
                  const Icon = ATTR_ICONS[key];
                  const label = ATTR_LABELS[key] ?? key;
                  return (
                    <span
                      key={key}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground"
                    >
                      {Icon && <Icon className="h-3 w-3" />}
                      {label}
                    </span>
                  );
                })}
            </div>
          </div>
        )}

      {/* Google リンク */}
      {(info.googleMapsUrl || info.googleReviewUrl) && (
        <div className="mt-5 flex flex-col gap-2 border-t border-border pt-5 text-sm">
          {info.googleMapsUrl && (
            <a
              href={info.googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-foreground transition-colors hover:text-accent"
            >
              Google Maps で見る
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {info.googleReviewUrl && (
            <a
              href={info.googleReviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-foreground transition-colors hover:text-accent"
            >
              Google で口コミを書く
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
