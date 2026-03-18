/**
 * Footer — Clean minimal footer with DB business data
 *
 * Server Component. Business info + navigation from DB.
 * schema.org microdata for NAP consistency.
 * 営業時間 / Google口コミリンク を含む
 */

import type { ReactElement } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { getBusinessInfo } from "@/public/data/business";
import { getFooterNavigation } from "@/shared/domain/navigation/queries";
import {
  getFooterSettings,
  getSocialLinksForFooter,
} from "@/shared/domain/settings/queries";
import { DAY_LABELS } from "@/public/lib/seo/json-ld-config";
import { isRecord } from "@/shared/lib/serialize";
import { CopyrightYear } from "./CopyrightYear";
import { SocialLinks } from "./SocialLinks";

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

interface FooterHoursDisplay {
  label: string;
  time: string;
  microdataContent: string;
}

function parseFooterHours(businessHours: unknown): FooterHoursDisplay[] {
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

  const result: FooterHoursDisplay[] = [];
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
// Component
// =============================================================================

export async function Footer(): Promise<ReactElement> {
  const [info, footerNav, footerSettings, socialLinks] = await Promise.all([
    getBusinessInfo(),
    getFooterNavigation(),
    getFooterSettings(),
    getSocialLinksForFooter(),
  ]);
  const brandShort = (info.name.split(" ")[0] ?? "MYRRH").toUpperCase();
  const hoursDisplay = parseFooterHours(info.businessHours);

  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-5 py-12 md:px-8 md:py-16">
        <div className="grid gap-10 md:grid-cols-3 md:gap-12">
          {/* Brand */}
          <div>
            <Link
              href="/"
              className="font-heading text-xl tracking-[0.15em] text-foreground"
            >
              {brandShort}
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {(
                footerSettings.tagline ??
                "洗練された空間で、特別なひとときを。\n厳選されたレンタルスペースをご案内します。"
              )
                .split("\n")
                .map((line, i) => (
                  <span key={`tagline-${line}`}>
                    {i > 0 && <br />}
                    {line}
                  </span>
                ))}
            </p>
            {footerSettings.showSocialLinks && socialLinks.length > 0 && (
              <div className="mt-4">
                <SocialLinks links={socialLinks} />
              </div>
            )}
          </div>

          {/* Navigation */}
          <div>
            <h3 className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              {footerSettings.navigationLabel}
            </h3>
            <ul className="mt-4 space-y-3">
              {footerNav.length > 0 ? (
                footerNav.map((item) => (
                  <li key={item.id}>
                    {item.isExternal ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-foreground transition-colors hover:text-accent"
                      >
                        {item.label}
                        <span className="sr-only"> (新しいタブで開く)</span>
                      </a>
                    ) : (
                      <Link
                        href={item.url}
                        className="text-sm text-foreground transition-colors hover:text-accent"
                      >
                        {item.label}
                      </Link>
                    )}
                  </li>
                ))
              ) : (
                <>
                  <li>
                    <Link
                      href="/"
                      className="text-sm text-foreground transition-colors hover:text-accent"
                    >
                      Home
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/reservation"
                      className="text-sm text-foreground transition-colors hover:text-accent"
                    >
                      Reservation
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/contact"
                      className="text-sm text-foreground transition-colors hover:text-accent"
                    >
                      Contact
                    </Link>
                  </li>
                </>
              )}
            </ul>
          </div>

          {/* Contact — microdata for NAP consistency */}
          <address
            itemScope
            itemType="https://schema.org/LocalBusiness"
            className="not-italic"
          >
            <h3 className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              {footerSettings.contactLabel}
            </h3>
            <meta itemProp="name" content={info.name} />
            <ul className="mt-4 space-y-3 text-sm text-foreground">
              {info.email && (
                <li>
                  <a
                    itemProp="email"
                    href={`mailto:${info.email}`}
                    className="transition-colors hover:text-accent"
                  >
                    {info.email}
                  </a>
                </li>
              )}
              {info.phone && (
                <li>
                  <a
                    itemProp="telephone"
                    href={`tel:${info.phone}`}
                    className="transition-colors hover:text-accent"
                  >
                    {info.phone}
                  </a>
                </li>
              )}
              {info.address && (
                <li
                  itemProp="address"
                  itemScope
                  itemType="https://schema.org/PostalAddress"
                >
                  <span className="text-muted-foreground">
                    {info.postalCode && (
                      <meta itemProp="postalCode" content={info.postalCode} />
                    )}
                    {info.prefecture && (
                      <meta
                        itemProp="addressRegion"
                        content={info.prefecture}
                      />
                    )}
                    {info.city && (
                      <meta itemProp="addressLocality" content={info.city} />
                    )}
                    {info.streetAddress && (
                      <meta
                        itemProp="streetAddress"
                        content={info.streetAddress}
                      />
                    )}
                    {info.address}
                  </span>
                </li>
              )}

              {/* 営業時間（microdata付き） */}
              {hoursDisplay.length > 0 && (
                <li className="pt-1">
                  <span className="block text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                    {footerSettings.hoursLabel}
                  </span>
                  <div className="mt-2 space-y-1">
                    {hoursDisplay.map((h) => (
                      <div
                        key={h.microdataContent}
                        className="flex items-center gap-2 text-muted-foreground"
                      >
                        <span className="min-w-[3rem]">{h.label}</span>
                        <time
                          itemProp="openingHours"
                          content={h.microdataContent}
                        >
                          {h.time}
                        </time>
                      </div>
                    ))}
                  </div>
                </li>
              )}

              {/* Google リンク */}
              {(info.googleMapsUrl || info.googleReviewUrl) && (
                <li className="flex flex-col gap-2 pt-1">
                  {info.googleMapsUrl && (
                    <a
                      href={info.googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 transition-colors hover:text-accent"
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
                      className="inline-flex items-center gap-1.5 transition-colors hover:text-accent"
                    >
                      Google で口コミを書く
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </li>
              )}
            </ul>
          </address>
        </div>

        <div className="mt-12 border-t border-border pt-8">
          <p className="text-center text-xs text-muted-foreground">
            &copy; <CopyrightYear /> {info.name}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
