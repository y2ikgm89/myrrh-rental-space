import type { ReactElement, ReactNode } from "react";
import Link from "next/link";
import {
  IconCalendar,
  IconMapPin,
  IconUsers,
  IconCoin,
} from "@tabler/icons-react";
import { Badge } from "@/public/components/design-system/badge";
import { formatEventDateTimeRange } from "@/public/lib/format-event-date";
import { formatPrice } from "@/shared/lib/pricing/format";
import { cn } from "@/shared/lib/cn";

type RegistrationState =
  | { readonly kind: "open"; readonly remainingCapacity: number | null }
  | { readonly kind: "full" }
  | { readonly kind: "deadline-passed" }
  | { readonly kind: "closed" };

export type EventInfoPanelVenue =
  | {
      readonly kind: "space";
      readonly slug: string;
      readonly name: string;
    }
  | {
      readonly kind: "location";
      readonly name: string;
      readonly address: string | null;
    }
  | {
      readonly kind: "addressDetail";
      readonly text: string;
    };

interface EventInfoPanelProps {
  readonly variant: "sidebar" | "mobile";
  readonly startTime: string;
  readonly endTime: string;
  readonly venues: readonly EventInfoPanelVenue[];
  readonly capacity: number | null;
  readonly price: number | null;
  readonly registration: RegistrationState;
  /** Anchor ID rendered on the registration form section (e.g. "event-register"). */
  readonly registerAnchorId: string;
}

/**
 * EventInfoPanel — イベント詳細ページの情報サマリー + CTA パネル
 *
 * Editorial Magazine トーンの「右サイド sticky 概要カード」（業界標準 — Eventbrite /
 * Peatix / Lu.ma / connpass のイベント詳細 sidebar と同パターン）。3 セクション
 * 構造で情報の視覚的階層を確保する:
 *
 * 1. **ステータス帯** — 申込状況 Badge（`申込受付中` / `満員` 等）
 * 2. **情報リスト** — 日時 / 会場 / 定員 / 参加費 を hairline 区切りで縦積み
 * 3. **CTA 帯** — 「お申し込みへ進む」アンカー（`registration.kind === "open"` のみ）
 *
 * 各セクションは `border-t border-divider` で flow 上に明確に分離され、内側 padding
 * （`px-8 sm:px-10`）で white space を確保。row 境界は dt の `border-t` で表現し、
 * dt-dd ペア間には線を引かない（divide-y dl で dt-dd 境界にも線が入る silent bug 回避）。
 *
 * `variant="sidebar"` は `lg+` で `ArticleLayout` の `toc` slot に渡され sticky 表示、
 * `variant="mobile"` は `<lg` で本文冒頭の inline カードとして展開される。
 */
export function EventInfoPanel({
  variant,
  startTime,
  endTime,
  venues,
  capacity,
  price,
  registration,
  registerAnchorId,
}: EventInfoPanelProps): ReactElement {
  const isSidebar = variant === "sidebar";

  return (
    <aside
      aria-label="イベント情報"
      className={cn(
        "border border-border bg-background shadow-sm",
        isSidebar
          ? "lg:sticky lg:top-[calc(var(--header-height)+2rem)]"
          : "mb-12",
      )}
    >
      <div className="px-8 py-5 sm:px-10">
        <RegistrationBadgeRow registration={registration} />
      </div>
      <dl className="border-t border-divider px-8 sm:px-10">
        <InfoRow
          icon={<IconCalendar className="h-[1.125rem] w-[1.125rem]" />}
          label="開催日時"
        >
          {formatEventDateTimeRange(startTime, endTime)}
        </InfoRow>
        {venues.length > 0 ? (
          <InfoRow
            icon={<IconMapPin className="h-[1.125rem] w-[1.125rem]" />}
            label="開催場所"
          >
            <VenueList venues={venues} />
          </InfoRow>
        ) : null}
        {capacity !== null ? (
          <InfoRow
            icon={<IconUsers className="h-[1.125rem] w-[1.125rem]" />}
            label="定員"
          >
            <CapacityValue
              capacity={capacity}
              remaining={
                registration.kind === "open"
                  ? registration.remainingCapacity
                  : null
              }
            />
          </InfoRow>
        ) : null}
        {price !== null ? (
          <InfoRow
            icon={<IconCoin className="h-[1.125rem] w-[1.125rem]" />}
            label="参加費"
            emphasize
          >
            <PriceValue price={price} />
          </InfoRow>
        ) : null}
      </dl>
      {registration.kind === "open" ? (
        <div className="border-t border-divider px-8 py-6 sm:px-10">
          <Link
            href={`#${registerAnchorId}`}
            className="inline-flex min-h-12 w-full items-center justify-center bg-accent px-6 py-3 text-sm font-medium tracking-[0.12em] text-accent-foreground transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            お申し込みへ進む
          </Link>
        </div>
      ) : null}
    </aside>
  );
}

function RegistrationBadgeRow({
  registration,
}: {
  readonly registration: RegistrationState;
}): ReactElement {
  switch (registration.kind) {
    case "open":
      return <Badge variant="success">申込受付中</Badge>;
    case "full":
      return <Badge variant="warning">満員</Badge>;
    case "deadline-passed":
      return <Badge variant="default">申込締切</Badge>;
    case "closed":
      return <Badge variant="default">申込受付終了</Badge>;
  }
}

function InfoRow({
  icon,
  label,
  emphasize,
  children,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly emphasize?: boolean;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <>
      <dt className="flex items-center gap-2 border-t border-divider pt-5 text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground first:border-t-0 first:pt-6">
        <span className="text-accent">{icon}</span>
        <span>{label}</span>
      </dt>
      <dd
        className={cn(
          "mt-2 text-base leading-relaxed text-foreground",
          emphasize ? "pb-6 last:pb-7" : "pb-5 last:pb-6",
        )}
      >
        {children}
      </dd>
    </>
  );
}

function VenueList({
  venues,
}: {
  readonly venues: readonly EventInfoPanelVenue[];
}): ReactElement {
  return (
    <ul className="space-y-2">
      {venues.map((venue, index) => (
        <li key={`${venue.kind}-${String(index)}`}>
          <VenueItem venue={venue} />
        </li>
      ))}
    </ul>
  );
}

function VenueItem({
  venue,
}: {
  readonly venue: EventInfoPanelVenue;
}): ReactElement {
  switch (venue.kind) {
    case "space":
      return (
        <Link
          href={`/spaces/${venue.slug}`}
          className="underline decoration-border decoration-1 underline-offset-4 transition-colors hover:decoration-foreground"
        >
          {venue.name}
        </Link>
      );
    case "location":
      return (
        <span className="flex flex-col gap-0.5">
          <span>{venue.name}</span>
          {venue.address ? (
            <span className="text-sm text-muted-foreground">
              {venue.address}
            </span>
          ) : null}
        </span>
      );
    case "addressDetail":
      return <span>{venue.text}</span>;
  }
}

function CapacityValue({
  capacity,
  remaining,
}: {
  readonly capacity: number;
  readonly remaining: number | null;
}): ReactElement {
  return (
    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span>定員 {capacity} 名</span>
      {remaining !== null ? (
        <span className="text-sm text-accent">残り {remaining} 名</span>
      ) : null}
    </span>
  );
}

function PriceValue({ price }: { readonly price: number }): ReactElement {
  if (price === 0) {
    return (
      <span className="font-heading text-h2 font-light leading-none text-foreground">
        無料
      </span>
    );
  }
  return (
    <span className="font-heading text-h2 font-light leading-none text-foreground">
      {formatPrice(price)}
    </span>
  );
}
