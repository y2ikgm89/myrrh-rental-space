/**
 * per-location LocalBusiness JSON-LD ビルダー（Google 公式準拠）
 *
 * 各物理拠点ごとに独立した LocalBusiness markup を生成。
 * Google Search Central の Local Business 構造化データガイドに準拠。
 *
 * @see https://developers.google.com/search/docs/appearance/structured-data/local-business
 */

import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { getBaseUrl, CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import {
  getPublishedLocationsForSeo,
  type LocationForSeo,
} from "@/shared/domain/locations/public-queries";
import { omitUndefined } from "@/shared/lib/serialize";
import {
  parseBusinessAttributes,
  parseStringArray,
} from "@/shared/lib/json-validators";
import {
  convertToOpeningHoursSpecification,
  ATTR_LABELS,
} from "@/public/lib/seo/json-ld-config";

export interface LocationLocalBusinessJsonLdData {
  "@id"?: string;
  name: string;
  url: string;
  description?: string;
  image?: string | string[];
  telephone?: string;
  email?: string;
  address?: {
    streetAddress?: string;
    addressLocality?: string;
    addressRegion?: string;
    postalCode?: string;
    addressCountry?: string;
  };
  priceRange?: string;
  geo?: { latitude: number; longitude: number };
  hasMap?: string;
  currenciesAccepted?: string;
  paymentAccepted?: string;
  openingHoursSpecification?: Array<{
    "@type": "OpeningHoursSpecification";
    dayOfWeek: string | string[];
    opens: string;
    closes: string;
  }>;
  specialOpeningHoursSpecification?: Array<{
    "@type": "OpeningHoursSpecification";
    validFrom: string;
    validThrough: string;
    opens: string;
    closes: string;
  }>;
  amenityFeature?: Array<{
    "@type": "LocationFeatureSpecification";
    name: string;
    value: boolean;
  }>;
  branchOf?: { "@id": string };
}

/**
 * 1 拠点分の LocalBusiness JSON-LD データを生成（pure function）
 *
 * @param location - SEO 用 Location データ
 * @param options.includeBranchOf - true で branchOf を併記（複数拠点時のみ）
 */
export function buildLocationLocalBusinessJsonLdData(
  location: LocationForSeo,
  options: { includeBranchOf: boolean },
): LocationLocalBusinessJsonLdData {
  const baseUrl = getBaseUrl();
  const streetAddress = [location.streetAddress, location.buildingName]
    .filter(Boolean)
    .join(" ");

  const geo =
    location.latitude !== null && location.longitude !== null
      ? { latitude: location.latitude, longitude: location.longitude }
      : undefined;

  const hasMap = geo
    ? `https://www.google.com/maps?q=${geo.latitude},${geo.longitude}`
    : undefined;

  const openingHoursSpecification =
    convertToOpeningHoursSpecification(location.businessHours) ?? undefined;

  const specialHolidayDates = parseStringArray(location.specialHolidays);
  const specialOpeningHoursSpecification =
    specialHolidayDates.length > 0
      ? specialHolidayDates.map((date) => ({
          "@type": "OpeningHoursSpecification" as const,
          validFrom: date,
          validThrough: date,
          opens: "00:00",
          closes: "00:00",
        }))
      : undefined;

  const parsedAttributes = parseBusinessAttributes(location.amenities);
  const amenityFeature = parsedAttributes
    ? Object.entries(parsedAttributes).map(([key, value]) => ({
        "@type": "LocationFeatureSpecification" as const,
        name: ATTR_LABELS[key] ?? key,
        value,
      }))
    : undefined;

  return omitUndefined({
    "@id": `${baseUrl}/access#${location.slug}-localbusiness`,
    name: location.name,
    url: `${baseUrl}/access#${location.slug}`,
    description: location.description ?? undefined,
    image: location.imageUrl ? [location.imageUrl] : undefined,
    telephone: location.phoneNumber ?? undefined,
    email: location.email ?? undefined,
    address:
      location.postalCode || location.prefecture
        ? omitUndefined({
            postalCode: location.postalCode ?? undefined,
            addressRegion: location.prefecture ?? undefined,
            addressLocality: location.city ?? undefined,
            streetAddress: streetAddress || undefined,
            addressCountry: "JP",
          })
        : undefined,
    priceRange: location.priceRange ?? undefined,
    geo,
    hasMap,
    currenciesAccepted: "JPY",
    paymentAccepted: location.paymentAccepted ?? undefined,
    openingHoursSpecification,
    specialOpeningHoursSpecification,
    amenityFeature:
      amenityFeature && amenityFeature.length > 0 ? amenityFeature : undefined,
    branchOf: options.includeBranchOf
      ? { "@id": `${baseUrl}/#organization` }
      : undefined,
  });
}

/**
 * 公開済み全 Location 分の JSON-LD データを取得（/access ページ用）
 */
export async function getAllPublishedLocationsJsonLdData(): Promise<
  LocationLocalBusinessJsonLdData[]
> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.LOCATIONS);

  const locations = await getPublishedLocationsForSeo();
  const includeBranchOf = locations.length > 1;
  return locations.map((loc) =>
    buildLocationLocalBusinessJsonLdData(loc, { includeBranchOf }),
  );
}
