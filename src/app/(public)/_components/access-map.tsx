/**
 * AccessMap — Google Maps Embed API
 *
 * Server Component。props で住所 or 緯度経度を受け取り埋め込み地図を表示。
 * https://developers.google.com/maps/documentation/embed/get-started
 */

import type { ReactElement } from "react";
import { connection } from "next/server";
import { cn } from "@/shared/lib/cn";
import { getDecryptedGoogleMapsApiKey } from "@/shared/domain/settings/api-key-queries";

interface AccessMapBaseProps {
  readonly title?: string;
  readonly heightClass?: string;
}

type AccessMapLocationProps =
  | {
      readonly address: string;
      readonly latitude?: number | null;
      readonly longitude?: number | null;
    }
  | {
      readonly address?: string | null;
      readonly latitude: number;
      readonly longitude: number;
    };

type AccessMapProps = AccessMapBaseProps & AccessMapLocationProps;

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
}: AccessMapProps): Promise<ReactElement> {
  await connection();

  const apiKey = await getDecryptedGoogleMapsApiKey();

  const embedUrl = apiKey
    ? buildEmbedUrl(
        apiKey,
        latitude ?? null,
        longitude ?? null,
        address ?? null,
      )
    : null;

  if (!embedUrl) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-surface",
          heightClass,
        )}
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
      className={cn("border-0", heightClass)}
      allowFullScreen
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      title={title}
    />
  );
}
