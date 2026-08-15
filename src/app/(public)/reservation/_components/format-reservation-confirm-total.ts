import { formatPrice } from "@/shared/lib/pricing/format";
import { TaxDisplayMode } from "@/shared/lib/validations/enums/prisma-types";

export type ReservationConfirmPricePreview = {
  readonly totalPrice: number;
  readonly totalPriceWithTax: number;
};

/**
 * 予約確認の合計。サーバー SSoT の額をそのまま描く。再課税しない（監査 F-104）。
 * TAX_EXCLUDED は税抜 `totalPrice`、それ以外は税込 `totalPriceWithTax`。
 */
export function formatReservationConfirmTotal(
  preview: ReservationConfirmPricePreview,
  displayMode: TaxDisplayMode,
): string {
  switch (displayMode) {
    case TaxDisplayMode.TAX_EXCLUDED:
      return `${formatPrice(preview.totalPrice)}（税抜）`;
    case TaxDisplayMode.TAX_INCLUDED:
    case TaxDisplayMode.BOTH:
      return `${formatPrice(preview.totalPriceWithTax)}（税込）`;
    default: {
      const _exhaustive: never = displayMode;
      return _exhaustive;
    }
  }
}
