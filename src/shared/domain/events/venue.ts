import type { EventFormatValue } from "@/shared/lib/validations/enums/prisma-types";

/**
 * イベント会場の表示文字列を構築する共通ヘルパー。
 *
 * Event は会場情報を 3 ソース（location relation / space relation / addressDetail）
 * から組み立てる。iCal・メール・カード表示・JSON-LD などで使い回すため SSoT 化する。
 *
 * 優先順位:
 *   1. space 選択済み: "{location.name} / {space.name} ({addressDetail})"
 *   2. location のみ選択:  "{location.name} ({addressDetail})"
 *   3. 両方 null: "{addressDetail}"
 *   4. すべて null: null
 */

type VenueParts = {
  readonly location?: { readonly name: string } | null;
  readonly space?: { readonly name: string } | null;
  readonly addressDetail?: string | null;
};

export function formatEventVenue(parts: VenueParts): string | null {
  const locationName = parts.location?.name?.trim() ?? "";
  const spaceName = parts.space?.name?.trim() ?? "";
  const detail = parts.addressDetail?.trim() ?? "";

  const venue =
    locationName && spaceName
      ? `${locationName} / ${spaceName}`
      : locationName || spaceName;

  if (venue && detail) return `${venue}（${detail}）`;
  if (venue) return venue;
  if (detail) return detail;
  return null;
}

/**
 * 郵便住所を含めた完全な会場住所を組み立てる（メール・JSON-LD 用）。
 * location.address をベースとし addressDetail を補足として付ける。
 * location が無い場合は addressDetail のみ。
 */
type VenueAddressParts = {
  readonly location?: { readonly address: string } | null;
  readonly addressDetail?: string | null;
};

export function formatEventAddress(parts: VenueAddressParts): string | null {
  const baseAddress = parts.location?.address?.trim() ?? "";
  const detail = parts.addressDetail?.trim() ?? "";

  if (baseAddress && detail) return `${baseAddress} ${detail}`;
  if (baseAddress) return baseAddress;
  if (detail) return detail;
  return null;
}

/**
 * イベント開催形態に応じた UI 向け表示文字列を構築する。
 *
 * - OFFLINE: 物理会場のみを primary に表示
 * - ONLINE: "オンライン開催" を primary に表示
 * - HYBRID: 物理会場を primary、"オンラインでも参加可" を secondary に表示
 */
type EventVenueDisplayInput = {
  readonly format: EventFormatValue;
  readonly meetingUrl: string | null;
  readonly location?: { readonly name: string } | null;
  readonly space?: { readonly name: string } | null;
  readonly addressDetail?: string | null;
};

export function formatEventVenueDisplay(event: EventVenueDisplayInput): {
  primary: string | null;
  secondary: string | null;
} {
  const physical = formatEventVenue(event);
  switch (event.format) {
    case "OFFLINE":
      return { primary: physical, secondary: null };
    case "ONLINE":
      return { primary: "オンライン開催", secondary: null };
    case "HYBRID":
      return { primary: physical, secondary: "オンラインでも参加可" };
  }
}

/**
 * イベントがオンラインでのアクセスに対応しているか判定する。
 * ONLINE / HYBRID の場合 true、OFFLINE の場合 false。
 */
export function isEventVirtualAccessible(event: {
  readonly format: EventFormatValue;
}): boolean {
  return event.format === "ONLINE" || event.format === "HYBRID";
}
