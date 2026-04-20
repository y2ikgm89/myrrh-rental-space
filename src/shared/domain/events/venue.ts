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
