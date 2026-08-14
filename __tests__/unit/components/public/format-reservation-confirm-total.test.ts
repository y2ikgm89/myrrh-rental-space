import { describe, expect, test } from "bun:test";
import { formatReservationConfirmTotal } from "@/app/(public)/reservation/_components/format-reservation-confirm-total";
import { calculateReservationPricing } from "@/shared/lib/pricing/calculate-reservation-pricing";
import { formatPrice, formatPriceWithTax } from "@/shared/lib/pricing/format";
import { TaxDisplayMode } from "@/shared/lib/validations/enums/prisma-types";

const jst = (iso: string) => new Date(`${iso}:00+09:00`);

/**
 * F-104: hourlyPrice=5000 × 2h、軽減 8%。
 * サーバー SSoT は totalPriceWithTax=10800。STANDARD 再課税すると 11000。
 */
const reducedPreview = calculateReservationPricing({
  startDateTime: jst("2026-07-15T10:00"),
  endDateTime: jst("2026-07-15T12:00"),
  space: {
    hourlyPrice: 5000,
    discountType: "NONE",
    discountValue: null,
    durationDiscountOverride: "INHERIT",
    taxRateType: "REDUCED",
  },
  ratePlans: [],
  reservationSettings: {
    taxStandardRate: 10,
    taxReducedRate: 8,
    taxDisplayModePublic: "TAX_INCLUDED",
    durationDiscountEnabled: false,
    durationDiscountRules: null,
    discountCombinationMode: "BEST",
    showOriginalPrice: false,
  },
  coupon: null,
  holidayJudge: () => false,
});

describe("formatReservationConfirmTotal", () => {
  test("REDUCED preview draws server totalPriceWithTax, not STANDARD re-tax", () => {
    expect(reducedPreview.totalPrice).toBe(10_000);
    expect(reducedPreview.totalPriceWithTax).toBe(10_800);

    const standardRetaxed = formatPriceWithTax({
      taxExcludedPrice: reducedPreview.totalPrice,
      taxRate: 10,
      displayMode: TaxDisplayMode.TAX_INCLUDED,
    });
    expect(standardRetaxed).toBe("¥11,000（税込）");

    const label = formatReservationConfirmTotal(reducedPreview);
    expect(label).toBe(
      `${formatPrice(reducedPreview.totalPriceWithTax)}（税込）`,
    );
    expect(label).toBe("¥10,800（税込）");
    expect(label).not.toBe(standardRetaxed);
    expect(label).not.toContain("11,000");
  });
});
