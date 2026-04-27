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
  getPublishedLocationForSeoBySlug,
  type LocationForSeo,
} from "@/shared/domain/locations/public-queries";
import { omitUndefined } from "@/shared/lib/serialize";

const BASE_URL = getBaseUrl();

export interface LocationLocalBusinessJsonLdData {
  "@id"?: string;
  name: string;
  url: string;
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

  return omitUndefined({
    "@id": `${BASE_URL}/access/${location.slug}#localbusiness`,
    name: location.name,
    url: `${BASE_URL}/access/${location.slug}`,
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
    branchOf: options.includeBranchOf
      ? { "@id": `${BASE_URL}/#organization` }
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

/**
 * 拠点単体ページ向け JSON-LD データを取得（/access/[locationSlug] 用）
 */
export async function getLocationJsonLdDataBySlug(
  slug: string,
): Promise<LocationLocalBusinessJsonLdData | null> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.LOCATIONS);

  const [location, all] = await Promise.all([
    getPublishedLocationForSeoBySlug(slug),
    getPublishedLocationsForSeo(),
  ]);
  if (!location) return null;
  return buildLocationLocalBusinessJsonLdData(location, {
    includeBranchOf: all.length > 1,
  });
}
