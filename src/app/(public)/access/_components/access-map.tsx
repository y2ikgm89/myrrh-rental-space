/**
 * AccessMap — Google Maps Embed API
 *
 * Server Component。props で住所 or 緯度経度を受け取り埋め込み地図を表示。
 * https://developers.google.com/maps/documentation/embed/get-started
 *
 * 引数なしで呼ばれた場合は Settings の latitude/longitude/address にフォールバック。
 */

import type { ReactElement } from "react";
import { getOrganizationSettings } from "@/shared/domain/settings/queries/organization";
import { getDecryptedGoogleMapsApiKey } from "@/shared/domain/settings/api-key-queries";

interface AccessMapProps {
  readonly address?: string | null;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly title?: string;
  readonly heightClass?: string;
}

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

export async function AccessMap({
  address,
  latitude,
  longitude,
  title = "Google Maps - アクセスマップ",
  heightClass = "h-[360px] w-full md:h-[440px]",
}: AccessMapProps = {}): Promise<ReactElement> {
  const apiKey = await getDecryptedGoogleMapsApiKey();

  // props 未指定なら Settings にフォールバック（後方互換）
  let resolvedAddress = address ?? null;
  let resolvedLat = latitude ?? null;
  let resolvedLng = longitude ?? null;

  if (!resolvedAddress && resolvedLat == null && resolvedLng == null) {
    const settings = await getOrganizationSettings();
    resolvedLat = settings?.latitude ?? null;
    resolvedLng = settings?.longitude ?? null;
    resolvedAddress =
      [
        settings?.prefecture,
        settings?.city,
        settings?.streetAddress,
        settings?.buildingName,
      ]
        .filter(Boolean)
        .join("") || null;
  }

  const embedUrl = apiKey
    ? buildEmbedUrl(apiKey, resolvedLat, resolvedLng, resolvedAddress)
    : null;

  if (!embedUrl) {
    return (
      <div
        className={`flex items-center justify-center bg-surface ${heightClass}`}
      >
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
      className={`border-0 ${heightClass}`}
      allowFullScreen
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      title={title}
    />
  );
}
