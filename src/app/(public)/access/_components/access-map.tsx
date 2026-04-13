/**
 * AccessMap — Google Maps Embed API（公式 API key 必須）
 *
 * Server Component。Settings の緯度経度 or 住所 + API key で地図表示。
 * https://developers.google.com/maps/documentation/embed/get-started
 */

import type { ReactElement } from "react";
import { getOrganizationSettings } from "@/shared/domain/settings/queries/organization";
import { getDecryptedGoogleMapsApiKey } from "@/shared/domain/settings/api-key-queries";

function buildEmbedUrl(
  apiKey: string,
  lat: number | null,
  lng: number | null,
  address: string | null,
): string | null {
  if (lat != null && lng != null) {
    return `https://www.google.com/maps/embed/v1/view?key=${apiKey}&center=${lat},${lng}&zoom=16&maptype=roadmap`;
  }
  if (address) {
    const q = encodeURIComponent(address);
    return `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${q}&zoom=16`;
  }
  return null;
}

export async function AccessMap(): Promise<ReactElement> {
  const [settings, apiKey] = await Promise.all([
    getOrganizationSettings(),
    getDecryptedGoogleMapsApiKey(),
  ]);

  const address = [
    settings?.prefecture,
    settings?.city,
    settings?.streetAddress,
    settings?.buildingName,
  ]
    .filter(Boolean)
    .join("");

  const embedUrl = apiKey
    ? buildEmbedUrl(
        apiKey,
        settings?.latitude ?? null,
        settings?.longitude ?? null,
        address || null,
      )
    : null;

  if (!embedUrl) {
    return (
      <div className="flex h-[400px] items-center justify-center bg-surface">
        <p className="text-sm text-muted-foreground">
          地図を表示するには、管理画面で Google Maps API
          キーと住所（または座標）を設定してください。
        </p>
      </div>
    );
  }

  return (
    <iframe
      src={embedUrl}
      className="h-[400px] w-full border-0 md:h-[500px]"
      allowFullScreen
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      title="Google Maps - アクセスマップ"
    />
  );
}
