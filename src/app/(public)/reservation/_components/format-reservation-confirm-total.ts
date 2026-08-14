import { formatPrice } from "@/shared/lib/pricing/format";

export type ReservationConfirmPricePreview = {
  readonly totalPrice: number;
  readonly totalPriceWithTax: number;
};

/**
 * 予約確認の合計。サーバー SSoT の税込額をそのまま描く。
 * 税抜 totalPrice を STANDARD で再課税しない（監査 F-104）。
 */
export function formatReservationConfirmTotal(
  preview: ReservationConfirmPricePreview,
): string {
  return formatPrice(preview.totalPriceWithTax);
}
