/**
 * JSON-LD構造化データ設定
 *
 * Settings / navigation domain から取得した設定を基にJSON-LD用データを生成
 */

import { getBaseUrl, SITE_DEFAULTS } from "@/shared/lib/constants";
import {
  getOrganizationSettings,
  getSocialLinkUrls,
} from "@/shared/domain/settings/queries/organization";
import { isRecord, omitUndefined } from "@/shared/lib/serialize";

// =============================================================================
// Types
// =============================================================================

export interface WebSiteJsonLdData {
  name: string;
  description: string;
  url: string;
}

export interface OrganizationJsonLdData {
  "@id"?: string;
  name: string;
  alternateName?: string;
  description?: string;
  url: string;
  logo?: string;
  telephone?: string;
  faxNumber?: string;
  email?: string;
  address?: {
    streetAddress?: string;
    addressLocality?: string;
    addressRegion?: string;
    postalCode?: string;
    addressCountry?: string;
  };
  sameAs?: string[];
  foundingDate?: string;
  additionalType?: string;
}

interface OpeningHoursSpec {
  "@type": "OpeningHoursSpecification";
  dayOfWeek: string | string[];
  opens: string;
  closes: string;
}

/** @graph パターン用の統合データ */
export interface GraphJsonLdData {
  organization: OrganizationJsonLdData;
  webSite: WebSiteJsonLdData;
}

// =============================================================================
// JSON-LD Data Generators
// =============================================================================

/**
 * WebSite JSON-LD用データを取得
 */
export async function getWebSiteJsonLdData(): Promise<WebSiteJsonLdData> {
  const baseUrl = getBaseUrl();
  const settings = await getOrganizationSettings();

  return {
    name: settings?.siteName || SITE_DEFAULTS.name,
    description: settings?.siteDescription || SITE_DEFAULTS.description,
    url: baseUrl,
  };
}

/**
 * Organization JSON-LD用データを取得
 */
export async function getOrganizationJsonLdData(): Promise<OrganizationJsonLdData> {
  const baseUrl = getBaseUrl();
  const [settings, sameAs] = await Promise.all([
    getOrganizationSettings(),
    getSocialLinkUrls(),
  ]);

  // 住所の構築
  const streetAddress = [settings?.streetAddress, settings?.buildingName]
    .filter(Boolean)
    .join(" ");

  // foundingDate: ISO 8601形式
  const foundingDate = settings?.establishedDate
    ? (new Date(settings.establishedDate).toISOString().split("T")[0] ??
      undefined)
    : undefined;

  return omitUndefined({
    "@id": `${baseUrl}/#organization`,
    name: settings?.businessName || settings?.siteName || SITE_DEFAULTS.name,
    alternateName: settings?.businessNameKana || undefined,
    description:
      settings?.businessDescription || settings?.siteDescription || undefined,
    url: baseUrl,
    logo: settings?.headerLogoUrl || undefined,
    telephone: settings?.phoneNumber || undefined,
    faxNumber: settings?.faxNumber || undefined,
    email: settings?.email || undefined,
    address:
      settings?.postalCode || settings?.prefecture
        ? omitUndefined({
            postalCode: settings?.postalCode || undefined,
            addressRegion: settings?.prefecture || undefined,
            addressLocality: settings?.city || undefined,
            streetAddress: streetAddress || undefined,
            addressCountry: "JP",
          })
        : undefined,
    sameAs: sameAs.length > 0 ? sameAs : undefined,
    foundingDate,
    additionalType: "https://en.wikipedia.org/wiki/Coworking",
  });
}

// =============================================================================
// LocalBusiness JSON-LD (MEO)
// =============================================================================

/** 曜日マッピング（フロントエンド表示でも再利用） */
export const DAY_MAP: Record<string, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

/** 曜日の日本語表示ラベル */
export const DAY_LABELS: Record<string, string> = {
  monday: "月",
  tuesday: "火",
  wednesday: "水",
  thursday: "木",
  friday: "金",
  saturday: "土",
  sunday: "日",
};

/**
 * businessHours JSON → OpeningHoursSpecification 変換
 * 同じ時間帯の曜日をグループ化
 */
export function convertToOpeningHoursSpecification(
  businessHours: unknown,
): OpeningHoursSpec[] | undefined {
  if (!isRecord(businessHours)) {
    return undefined;
  }

  const hours = businessHours;

  // 時間帯ごとに曜日をグループ化
  const groupMap = new Map<string, string[]>();

  for (const [dayKey, dayValue] of Object.entries(hours)) {
    const englishDay = DAY_MAP[dayKey];
    if (!englishDay) continue;

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
      const key = `${slot["openTime"]}-${slot["closeTime"]}`;
      const existing = groupMap.get(key);
      if (existing) {
        existing.push(englishDay);
      } else {
        groupMap.set(key, [englishDay]);
      }
    }
  }

  if (groupMap.size === 0) return undefined;

  const specs: OpeningHoursSpec[] = [];
  for (const [timeRange, days] of groupMap) {
    const [opens = "", closes = ""] = timeRange.split("-");
    const firstDay = days[0];
    if (!firstDay) continue;
    specs.push({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: days.length === 1 ? firstDay : days,
      opens,
      closes,
    });
  }

  return specs.length > 0 ? specs : undefined;
}

/** 施設属性ラベルマッピング（フロントエンド表示でも再利用） */
export const ATTR_LABELS: Record<string, string> = {
  wifi: "Wi-Fi",
  parking: "駐車場",
  barrier_free: "バリアフリー",
  elevator: "エレベーター",
  smoking_area: "喫煙所",
  food_allowed: "飲食可",
  photography_allowed: "撮影可",
  music_allowed: "楽器演奏可",
};

/**
 * @graph パターン用の統合データを取得
 * Organization + WebSite を1つの JSON-LD で出力
 */
export async function getGraphJsonLdData(): Promise<GraphJsonLdData> {
  const [organization, webSite] = await Promise.all([
    getOrganizationJsonLdData(),
    getWebSiteJsonLdData(),
  ]);

  return { organization, webSite };
}
