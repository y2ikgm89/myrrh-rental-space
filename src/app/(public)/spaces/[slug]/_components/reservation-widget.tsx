"use client";

import Link from "next/link";
import { useFormatPrice } from "@/public/hooks/use-format-price";
import { toAppRoute } from "@/shared/lib/typed-routes";

interface ReservationWidgetProps {
  readonly spaceId: string;
  readonly spaceName: string;
  readonly hourlyPrice: number;
  readonly dailyPrice: number | null;
}

/**
 * ReservationWidget — Variant E (Booking 構造 × Editorial brand) 適用済 SSoT。
 *
 * - border-y accent (Kinfolk hairline) + 中央寄せ
 * - 価格は **sans + tabular-nums** (Stripe / Airbnb / Booking.com / Shopify と
 *   揃えた業界標準。Cormorant Garamond の old-style figures は数値スキャンに
 *   弱いため数字系では使わない、Editorial Magazine 通念とも整合)
 * - Reservation / Inquiry buttons (uppercase tracking-[0.18em], sharp edge, min-h-12 / 11)
 * - 即予約 USP 3 列 (accent uppercase)
 */
export function ReservationWidget({
  spaceId,
  hourlyPrice,
  dailyPrice,
}: ReservationWidgetProps) {
  const { formatUnit } = useFormatPrice();
  return (
    <div className="border border-accent bg-background py-6 text-center">
      <p className="text-[0.65rem] uppercase tracking-[0.24em] text-muted-foreground">
        — Reservation —
      </p>
      <p className="mt-3 text-3xl font-medium leading-none tabular-nums text-foreground">
        {formatUnit(hourlyPrice, "/h")}
      </p>
      {dailyPrice != null ? (
        <p className="mt-1 text-sm tabular-nums text-muted-foreground">
          / {formatUnit(dailyPrice, "/day")}
        </p>
      ) : null}

      <div className="mt-6 space-y-1.5 text-[0.7rem] uppercase tracking-[0.15em] text-accent">
        <p>＋ 即時予約</p>
        <p>＋ 24h 前まで無料キャンセル</p>
        <p>＋ 事前決済不要</p>
      </div>

      <div className="mt-6 space-y-2 px-6">
        <Link
          href={toAppRoute(`/reservation?spaceId=${spaceId}`)}
          className="inline-flex min-h-12 w-full items-center justify-center border border-foreground bg-foreground px-7 py-3 text-xs uppercase tracking-[0.18em] text-background transition-opacity hover:opacity-90"
        >
          Reserve this space
        </Link>
        <Link
          href="/contact"
          className="inline-flex min-h-11 w-full items-center justify-center border border-foreground px-5 py-2.5 text-xs uppercase tracking-[0.18em] text-foreground transition-colors hover:bg-foreground hover:text-background"
        >
          Inquiry
        </Link>
      </div>
    </div>
  );
}
