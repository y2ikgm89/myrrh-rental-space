/**
 * ビジネスデータ取得レイヤー
 *
 * getPublicBusinessSettings() をラップし、コンポーネント向けの形状にマッピング。
 * 新たな DB クエリは発行せず、既存キャッシュ済み関数を再利用。
 */

import { getPublicBusinessSettings } from "@/shared/domain/settings/queries";
import { isRecord } from "@/shared/lib/serialize";

export interface BusinessInfo {
  readonly name: string;
  readonly address: string | null;
  readonly postalCode: string | null;
  readonly prefecture: string | null;
  readonly city: string | null;
  readonly streetAddress: string | null;
  readonly buildingName: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly businessHours: unknown;
  readonly holidayNotice: string | null;
  readonly googleReviewUrl: string | null;
  readonly googleMapsUrl: string | null;
  readonly businessAttributes: Record<string, boolean> | null;
}

/**
 * ビジネス情報を取得
 *
 * DB の公開ビジネス設定を取得し、コンポーネントが使いやすい形状にマッピング。
 * 住所フィールドは結合済みの文字列も提供。
 */
export async function getBusinessInfo(): Promise<BusinessInfo> {
  const settings = await getPublicBusinessSettings();

  const addressParts = [
    settings?.postalCode ? `〒${settings.postalCode}` : null,
    settings?.prefecture,
    settings?.city,
    settings?.streetAddress,
    settings?.buildingName,
  ].filter(Boolean);

  // businessAttributes の型安全なパース
  const rawAttrs = settings?.businessAttributes;
  let parsedAttrs: Record<string, boolean> | null = null;
  if (isRecord(rawAttrs)) {
    const result: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(rawAttrs)) {
      if (typeof value === "boolean") {
        result[key] = value;
      }
    }
    if (Object.keys(result).length > 0) {
      parsedAttrs = result;
    }
  }

  return {
    name: settings?.businessName ?? "Myrrh Rental Space",
    address: addressParts.length > 0 ? addressParts.join("") : null,
    postalCode: settings?.postalCode ?? null,
    prefecture: settings?.prefecture ?? null,
    city: settings?.city ?? null,
    streetAddress: settings?.streetAddress ?? null,
    buildingName: settings?.buildingName ?? null,
    phone: settings?.phoneNumber ?? null,
    email: settings?.email ?? null,
    businessHours: settings?.businessHours ?? null,
    holidayNotice: settings?.holidayNotice ?? null,
    googleReviewUrl: settings?.googleReviewUrl ?? null,
    googleMapsUrl: settings?.googleBusinessPlaceId
      ? `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${settings.googleBusinessPlaceId}`
      : null,
    businessAttributes: parsedAttrs,
  };
}
