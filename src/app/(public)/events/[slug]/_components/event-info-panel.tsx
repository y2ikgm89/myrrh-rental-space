import type { ReactElement, ReactNode } from "react";
import Link from "next/link";
import {
  IconCalendar,
  IconCoin,
  IconMapPin,
  IconUsers,
} from "@tabler/icons-react";
import { Badge } from "@/public/components/design-system/badge";
import {
  formatEventDate,
  formatEventTimeRange,
} from "@/public/lib/format-event-date";
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
 * Minimal editorial pattern (Apple Store / Stripe / Notion booking 業界標準)。
 * Hero block の `bg-surface` 強調を廃し、全ての情報を一様な `bg-background` の
 * Detail list として scan しやすく並べる。typographic rhythm と hairline divider
 * のみで構造化、Luxury White × Bronze brand と最も整合。
 *
 * 1. **Status band** — Badge 単独配置（申込受付中 / 申込締切 等）
 * 2. **Detail list** — 開催日時 / 開催場所 / 定員 / 参加費 の 4 行（全 DetailRow）
 * 3. **CTA block** — `bg-foreground` ボタン（`registration.kind === "open"` のみ）
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
      <div className="px-8 pb-5 pt-7 sm:px-10">
        <RegistrationBadgeRow registration={registration} />
      </div>
      <dl className="px-8 sm:px-10">
        <DetailRow
          icon={<IconCalendar className="h-4 w-4" aria-hidden="true" />}
          label="開催日時"
        >
          <span className="flex flex-col gap-0.5">
            <span>{formatEventDate(startTime)}</span>
            <span>{formatEventTimeRange(startTime, endTime)}</span>
          </span>
        </DetailRow>
        {venues.length > 0 ? (
          <DetailRow
            icon={<IconMapPin className="h-4 w-4" aria-hidden="true" />}
            label="開催場所"
          >
            <VenueList venues={venues} />
          </DetailRow>
        ) : null}
        {capacity !== null ? (
          <DetailRow
            icon={<IconUsers className="h-4 w-4" aria-hidden="true" />}
            label="定員"
          >
            <CapacityValue capacity={capacity} registration={registration} />
          </DetailRow>
        ) : null}
        {price !== null ? (
          <DetailRow
            icon={<IconCoin className="h-4 w-4" aria-hidden="true" />}
            label="参加費"
          >
            <PriceValue price={price} />
          </DetailRow>
        ) : null}
      </dl>
      {registration.kind === "open" ? (
        <div className="px-8 pb-6 sm:px-10">
          <Link
            href={`#${registerAnchorId}`}
            className="inline-flex min-h-12 w-full items-center justify-center bg-foreground px-6 text-sm font-medium tracking-[0.08em] text-background transition-colors hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
      return <OutlineBadge>申込締切</OutlineBadge>;
    case "closed":
      return <OutlineBadge>申込受付終了</OutlineBadge>;
  }
}

/**
 * `bg-background` 上で visible なネガティブ状態 Badge。
 * Badge primitive の `variant="default"` は `bg-surface text-foreground` で
 * いずれの背景でも同色に溶けやすいため、border + bg-background の outline 枠で描画。
 */
function OutlineBadge({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      {children}
    </span>
  );
}

function CapacityValue({
  capacity,
  registration,
}: {
  readonly capacity: number;
  readonly registration: RegistrationState;
}): ReactElement {
  if (registration.kind === "open" && registration.remainingCapacity !== null) {
    return (
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span>{capacity} 名</span>
        <span className="text-xs text-muted-foreground">
          残り{" "}
          <span className="font-medium text-accent">
            {registration.remainingCapacity} 席
          </span>
        </span>
      </span>
    );
  }

  if (registration.kind === "full") {
    return (
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span>{capacity} 名</span>
        <span className="text-xs text-muted-foreground">満席</span>
      </span>
    );
  }

  return <span>{capacity} 名</span>;
}

function PriceValue({ price }: { readonly price: number }): ReactElement {
  if (price === 0) {
    return <span>無料</span>;
  }
  return (
    <span className="flex flex-wrap items-baseline gap-x-2">
      <span>{formatPrice(price)}</span>
      <span className="text-xs text-muted-foreground">/ 1 名（税込）</span>
    </span>
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
}): ReactElement {
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

function VenueList({
  venues,
}: {
  readonly venues: readonly EventInfoPanelVenue[];
}): ReactElement {
  return (
    <ul className="space-y-1.5">
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
            <span className="text-xs text-muted-foreground">
              {venue.address}
            </span>
          ) : null}
        </span>
      );
    case "addressDetail":
      return <span>{venue.text}</span>;
  }
}
