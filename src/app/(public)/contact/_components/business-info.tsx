/**
 * BusinessInfo — アクセス・営業情報カード
 *
 * Server Component。DB からビジネス情報を取得して表示。
 * schema.org LocalBusiness microdata で NAP 一貫性を確保。
 */

import type { ReactElement } from "react";
import {
  IconMapPin,
  IconPhone,
  IconMail,
  IconClock,
  IconCalendarOff,
} from "@tabler/icons-react";
import { getBusinessInfo } from "@/public/data/business";
import { DAY_LABELS } from "@/public/lib/seo/json-ld-config";
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
  readonly icon: typeof IconMapPin;
  readonly label: string;
  readonly children: ReactElement;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <dt className="text-eyebrow uppercase text-muted-foreground">
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
      className="border border-border p-6"
      itemScope
      itemType="https://schema.org/LocalBusiness"
    >
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        アクセス・営業情報
      </p>
      <meta itemProp="name" content={info.name} />

      <dl className="mt-5 space-y-4">
        {info.address && (
          <InfoSection icon={IconMapPin} label="住所">
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
          <InfoSection icon={IconPhone} label="電話番号">
            <a
              itemProp="telephone"
              href={`tel:${info.phone}`}
              className="transition-colors hover:text-foreground"
            >
              {info.phone}
            </a>
          </InfoSection>
        )}

        {info.email && (
          <InfoSection icon={IconMail} label="メール">
            <a
              itemProp="email"
              href={`mailto:${info.email}`}
              className="break-all transition-colors hover:text-foreground"
            >
              {info.email}
            </a>
          </InfoSection>
        )}

        {hoursDisplay.length > 0 && (
          <InfoSection icon={IconClock} label="営業時間">
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
          <InfoSection icon={IconCalendarOff} label="休業日">
            <>{info.holidayNotice}</>
          </InfoSection>
        )}
      </dl>

      {/* 施設属性・Google リンクは Location モデルの MEO フィールドへ移管 */}
    </div>
  );
}
