"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  IconBolt,
  IconCalendarOff,
  IconCoin,
  IconCreditCardOff,
} from "@tabler/icons-react";
import { Badge } from "@/public/components/design-system/badge";
import { useFormatPrice } from "@/public/hooks/use-format-price";
import { toAppRoute } from "@/shared/lib/typed-routes";

// `formatTotal` の戻り値（例: `¥550（税込）`）を hero typography 用に
// price / tax-label に分離するローカル helper。`both` mode の
// `¥605（税込）/ ¥550（税抜）` は対象外 (null を返し caller が raw 表示にフォールバック)。
function splitTaxedPrice(
  formatted: string,
): { readonly value: string; readonly taxLabel: string | null } | null {
  if (formatted.includes("/")) return null;
  const match = /^(.+?)（(税込|税抜)）$/.exec(formatted);
  if (match) {
    const [, value, taxLabel] = match;
    if (value && taxLabel) return { value, taxLabel };
  }
  return { value: formatted, taxLabel: null };
}

interface ReservationWidgetProps {
  readonly spaceId: string;
  readonly spaceName: string;
  readonly hourlyPrice: number;
  /** キャンセル無料受付の期限（予約開始の X 時間前まで）。Settings 由来の実値 */
  readonly cancellationDeadlineHours: number;
  /** 公開中のキャンセルポリシー規約 URL。無ければリンクを出さない */
  readonly cancellationPolicyUrl: string | undefined;
}

/**
 * ReservationWidget — spaces 詳細ページのサイドバー予約サマリー + CTA パネル
 *
 * EventInfoPanel と視覚言語を統一: `border border-accent bg-background` 4 辺枠 +
 * `— Reservation —` eyebrow + Status Badge + 価格 hero + `<dl>` rhythm +
 * sharp-edge CTA。Airbnb / Vrbo / Booking listing widget の業界標準パターン
 * (価格 hero + 構造化条件リスト + 予約 CTA) に整合。
 *
 * 1. **Eyebrow** — "— Reservation —" uppercase tracking (Kinfolk hairline)
 * 2. **Status band** — Badge「即時予約可」(events `申込受付中` と同 success variant)
 * 3. **Price hero** — 時間料金 (sans + tabular-nums、Stripe / Airbnb 標準)
 * 4. **Detail list** — 予約 / キャンセル / 決済 の USP を `<dl>` で構造化
 * 5. **CTA block** — Reserve this space (primary) + Inquiry (secondary)
 *
 * 外側の `<aside lg:sticky>` は呼び出し側 (page.tsx) で wrap される。
 */
export function ReservationWidget({
  spaceId,
  hourlyPrice,
  cancellationDeadlineHours,
  cancellationPolicyUrl,
}: ReservationWidgetProps) {
  const { formatTotal, formatUnit } = useFormatPrice();
  const hourly = splitTaxedPrice(formatTotal(hourlyPrice));

  return (
    <div className="border border-accent bg-background">
      <p className="px-8 pt-7 text-xs uppercase tracking-eyebrow-wide text-muted-foreground sm:px-10">
        — Reservation —
      </p>
      <div className="px-8 pb-5 pt-4 sm:px-10">
        <Badge variant="success">即時予約可</Badge>
      </div>
      <div className="px-8 pb-5 sm:px-10">
        <p className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="text-accent">
            <IconCoin className="h-4 w-4" aria-hidden="true" />
          </span>
          <span>料金</span>
        </p>
        {hourly ? (
          <div className="flex items-baseline gap-x-2">
            <span className="text-3xl font-medium leading-none tabular-nums text-foreground">
              {hourly.value}
            </span>
            <span className="text-xs uppercase tracking-eyebrow text-muted-foreground">
              / hour
            </span>
            {hourly.taxLabel ? (
              <span className="text-xs text-muted-foreground">
                （{hourly.taxLabel}）
              </span>
            ) : null}
          </div>
        ) : (
          <p className="text-3xl font-medium leading-none tabular-nums text-foreground">
            {formatUnit(hourlyPrice, "/h")}
          </p>
        )}
      </div>
      <dl className="px-8 sm:px-10">
        <DetailRow
          icon={<IconBolt className="h-4 w-4" aria-hidden="true" />}
          label="予約"
        >
          即時予約成立
        </DetailRow>
        <DetailRow
          icon={<IconCalendarOff className="h-4 w-4" aria-hidden="true" />}
          label="キャンセル"
        >
          {cancellationDeadlineHours} 時間前まで無料
          {cancellationPolicyUrl && (
            <>
              {" "}
              <Link
                href={toAppRoute(cancellationPolicyUrl)}
                className="underline underline-offset-4 hover:text-foreground"
              >
                詳細
              </Link>
            </>
          )}
        </DetailRow>
        <DetailRow
          icon={<IconCreditCardOff className="h-4 w-4" aria-hidden="true" />}
          label="決済"
        >
          事前決済不要
        </DetailRow>
      </dl>
      <div className="space-y-2 px-8 pb-7 sm:px-10">
        <Link
          href={toAppRoute(`/reservation?spaceId=${spaceId}`)}
          className="inline-flex min-h-12 w-full items-center justify-center border border-foreground bg-foreground px-6 text-xs uppercase tracking-eyebrow text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Reserve this space
        </Link>
        <Link
          href="/contact"
          className="inline-flex min-h-11 w-full items-center justify-center border border-foreground px-6 text-xs uppercase tracking-eyebrow text-foreground transition-colors hover:bg-foreground hover:text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Inquiry
        </Link>
      </div>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  children,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <>
      <dt className="flex items-center gap-2 pt-5 text-xs text-muted-foreground">
        <span className="text-accent">{icon}</span>
        <span>{label}</span>
      </dt>
      <dd className="mb-5 mt-1.5 text-sm leading-relaxed text-foreground last:mb-7">
        {children}
      </dd>
    </>
  );
}
