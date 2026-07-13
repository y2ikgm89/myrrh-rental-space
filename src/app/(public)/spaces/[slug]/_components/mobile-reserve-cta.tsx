"use client";

import Link from "next/link";
import { IconArrowRight } from "@tabler/icons-react";
import { StickyBottomBar } from "@/app/(public)/_shared/components/ui/sticky-bottom-bar";
import { useFormatPrice } from "@/public/hooks/use-format-price";
import { toAppRoute } from "@/shared/lib/typed-routes";

interface MobileReserveCTAProps {
  readonly spaceId: string;
  readonly hourlyPrice: number;
}

/**
 * spaces 詳細ページのモバイル / タブレット (< lg) 用 sticky 予約 CTA。
 *
 * lg 以上では右カラムの sticky `ReservationWidget` が本文追従するため非表示。
 * lg 未満では widget が本文末尾に stack されるためユーザーが CTA へ届くまで
 * スクロール距離が長くなる。Airbnb / Vrbo のモバイル listing パターンに準拠し、
 * 画面下部固定で価格 + 「予約する」を常時表示する。
 */
export function MobileReserveCTA({
  spaceId,
  hourlyPrice,
}: MobileReserveCTAProps) {
  const { formatUnit } = useFormatPrice();
  return (
    <StickyBottomBar hiddenFrom="lg">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 leading-tight">
          <p className="text-lg font-medium tabular-nums text-foreground">
            {formatUnit(hourlyPrice, "/h")}
          </p>
        </div>
        <Link
          href={toAppRoute(`/reservation?spaceId=${spaceId}`)}
          className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 border border-foreground bg-foreground px-6 text-xs uppercase tracking-eyebrow text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span>予約する</span>
          <IconArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </StickyBottomBar>
  );
}
