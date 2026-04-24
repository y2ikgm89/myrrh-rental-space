/**
 * Site Footer — Editorial Magazine 3-column layout
 *
 * Server Component. ナビ・ビジネス情報・SNS リンク・営業時間・規約を DB から取得。
 * schema.org LocalBusiness microdata で NAP (Name / Address / Phone) 整合性を確保。
 */

import type { ReactElement } from "react";
import Link from "next/link";
import { IconExternalLink } from "@tabler/icons-react";
import { getBusinessInfo } from "@/public/data/business";
import { getFooterNavigation } from "@/shared/domain/navigation/queries";
import { getFooterSettings } from "@/shared/domain/settings/queries/display";
import { getSocialLinksForFooter } from "@/shared/domain/settings/queries/organization";
import { getFooterTerms } from "@/shared/domain/terms/public-queries";
import { DAY_LABELS } from "@/public/lib/seo/json-ld-config";
import { isRecord } from "@/shared/lib/serialize";
import { cn } from "@/shared/lib/cn";
import { toAppRoute } from "@/shared/lib/typed-routes";
import { CopyrightYear } from "./copyright-year";
import { SiteBrand } from "./site-brand";
import { SocialLinks } from "./social-links";

/* -------------------------------------------------------------------------- */
/*  Business hours parsing                                                    */
/* -------------------------------------------------------------------------- */

const DAY_ORDER = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const DAY_ABBREV: Record<(typeof DAY_ORDER)[number], string> = {
  monday: "Mo",
  tuesday: "Tu",
  wednesday: "We",
  thursday: "Th",
  friday: "Fr",
  saturday: "Sa",
  sunday: "Su",
};

interface FooterHoursDisplay {
  readonly label: string;
  readonly time: string;
  readonly microdataContent: string;
}

interface DayTime {
  readonly key: (typeof DAY_ORDER)[number];
  readonly label: string;
  readonly time: string;
}

function extractDayTimes(businessHours: unknown): DayTime[] {
  if (!isRecord(businessHours)) return [];

  const result: DayTime[] = [];
  for (const dayKey of DAY_ORDER) {
    const dayValue = businessHours[dayKey];
    if (
      !isRecord(dayValue) ||
      !dayValue["isOpen"] ||
      !Array.isArray(dayValue["slots"])
    ) {
      continue;
    }
    for (const slot of dayValue["slots"]) {
      if (
        !isRecord(slot) ||
        typeof slot["openTime"] !== "string" ||
        typeof slot["closeTime"] !== "string"
      ) {
        continue;
      }
      result.push({
        key: dayKey,
        label: DAY_LABELS[dayKey] ?? dayKey,
        time: `${slot["openTime"]}-${slot["closeTime"]}`,
      });
    }
  }
  return result;
}

function parseFooterHours(businessHours: unknown): FooterHoursDisplay[] {
  const dayTimes = extractDayTimes(businessHours);
  if (dayTimes.length === 0) return [];

  const groups = new Map<
    string,
    { labels: string[]; keys: (typeof DAY_ORDER)[number][] }
  >();
  for (const dt of dayTimes) {
    const existing = groups.get(dt.time);
    if (existing) {
      existing.labels.push(dt.label);
      existing.keys.push(dt.key);
    } else {
      groups.set(dt.time, { labels: [dt.label], keys: [dt.key] });
    }
  }

  const result: FooterHoursDisplay[] = [];
  for (const [time, { labels, keys }] of groups) {
    const [opens = "", closes = ""] = time.split("-");
    const abbrevs = keys.map((k) => DAY_ABBREV[k]);
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

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

const NAV_LINK_CLASS =
  "text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none";

const CONTACT_LINK_CLASS =
  "text-foreground transition-colors hover:underline hover:underline-offset-4 focus-visible:underline focus-visible:underline-offset-4 focus-visible:outline-none";

const GOOGLE_LINK_CLASS =
  "inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none";

const HEADING_CLASS =
  "text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground";

export async function Footer(): Promise<ReactElement> {
  const [info, footerNav, footerSettings, socialLinks, footerTerms] =
    await Promise.all([
      getBusinessInfo(),
      getFooterNavigation(),
      getFooterSettings(),
      getSocialLinksForFooter(),
      getFooterTerms(),
    ]);
  const hoursDisplay = parseFooterHours(info.businessHours);
  const taglineLines = (
    footerSettings.tagline ??
    "洗練された空間で、特別なひとときを。\n厳選されたレンタルスペースをご案内します。"
  )
    .split("\n")
    .filter((line) => line.length > 0);

  return (
    <footer role="contentinfo" className="border-t border-border bg-surface">
      <div
        className="h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent"
        aria-hidden="true"
      />
      <div className="mx-auto max-w-6xl px-5 py-14 md:px-8 md:py-20">
        <div
          className={cn(
            "grid gap-10 md:gap-16",
            footerNav.length > 0 ? "md:grid-cols-3" : "md:grid-cols-2",
          )}
        >
          {/* Brand */}
          <div>
            <SiteBrand brand={footerSettings.brand} variant="footer" />
            <p className="mt-5 text-[0.8rem] leading-[2.2] text-muted-foreground">
              {taglineLines.map((line, i) => (
                <span key={line}>
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
          {footerNav.length > 0 && (
            <nav aria-label="フッターナビゲーション">
              <h2 className={HEADING_CLASS}>
                {footerSettings.navigationLabel}
              </h2>
              <ul className="mt-4 space-y-3">
                {footerNav.map((item) => (
                  <li key={item.id}>
                    {item.isExternal ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={NAV_LINK_CLASS}
                      >
                        {item.label}
                        <span className="sr-only"> (新しいタブで開く)</span>
                      </a>
                    ) : (
                      <Link
                        href={toAppRoute(item.url)}
                        className={NAV_LINK_CLASS}
                      >
                        {item.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          )}

          {/* Contact — schema.org microdata for NAP consistency */}
          <address
            itemScope
            itemType="https://schema.org/LocalBusiness"
            className="not-italic"
          >
            <h2 className={HEADING_CLASS}>{footerSettings.contactLabel}</h2>
            <meta itemProp="name" content={info.name} />
            <ul className="mt-4 space-y-3 text-sm text-foreground">
              {info.email && (
                <li>
                  <a
                    itemProp="email"
                    href={`mailto:${info.email}`}
                    className={CONTACT_LINK_CLASS}
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
                    className={CONTACT_LINK_CLASS}
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

              {hoursDisplay.length > 0 && (
                <li className="pt-1">
                  <span className={cn(HEADING_CLASS, "block")}>
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

              {(info.googleMapsUrl || info.googleReviewUrl) && (
                <li className="flex flex-col gap-2 pt-1">
                  {info.googleMapsUrl && (
                    <a
                      href={info.googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={GOOGLE_LINK_CLASS}
                    >
                      Google Maps で見る
                      <IconExternalLink
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                      <span className="sr-only"> (新しいタブで開く)</span>
                    </a>
                  )}
                  {info.googleReviewUrl && (
                    <a
                      href={info.googleReviewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={GOOGLE_LINK_CLASS}
                    >
                      Google で口コミを書く
                      <IconExternalLink
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                      <span className="sr-only"> (新しいタブで開く)</span>
                    </a>
                  )}
                </li>
              )}
            </ul>
          </address>
        </div>

        <div className="mt-14 border-t border-border pt-8">
          {footerTerms.length > 0 && (
            <nav
              aria-label="規約・法的文書"
              className="mb-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
            >
              {footerTerms.map((terms) => (
                <Link
                  key={terms.slug}
                  href={toAppRoute(`/terms/${terms.slug}`)}
                  className="transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
                >
                  {terms.title}
                </Link>
              ))}
            </nav>
          )}
          <p className="text-center text-[0.6rem] tracking-[0.1em] text-muted-foreground">
            &copy; <CopyrightYear /> {info.name}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
