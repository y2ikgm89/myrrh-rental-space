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
import type { EventTicketSummary } from "@/shared/domain/events/ticket-types";
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
  readonly tickets: readonly EventTicketSummary[];
  readonly registration: RegistrationState;
  /** Anchor ID rendered on the registration form section (e.g. "event-register"). */
  readonly registerAnchorId: string;
}

/**
 * EventInfoPanel — イベント詳細ページの情報サマリー + CTA パネル
 *
 * Variant E (Minimal adaptation, 2026-05-27) — Eventbrite / Peatix / Lu.ma
 * 業界標準の Article-style hero は ArticleLayout 側で維持しつつ、本 panel
 * のみ spaces ReservationWidget と同様の **4 辺 border-accent + eyebrow +
 * sharp-edge CTA** で Editorial Magazine brand consistency を強化。
 *
 * 1. **Eyebrow** — "— Event —" uppercase tracking (Kinfolk hairline pattern)
 * 2. **Status band** — Badge 単独配置（申込受付中 / 申込締切 等）
 * 3. **Detail list** — 開催日時 / 開催場所 / 定員 / 参加費（全 DetailRow）
 * 4. **CTA block** — sharp-edge bronze-bordered ボタン（`registration.kind === "open"` のみ）
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
  tickets,
  registration,
  registerAnchorId,
}: EventInfoPanelProps): ReactElement {
  const isSidebar = variant === "sidebar";
  const wrapperClassName = cn(
    "border border-accent bg-background",
    isSidebar ? null : "mb-12",
  );
  const body = (
    <>
      <p className="px-8 pt-7 text-xs uppercase tracking-eyebrow-wide text-muted-foreground sm:px-10">
        — Event —
      </p>
      <div className="px-8 pb-5 pt-4 sm:px-10">
        <RegistrationBadgeRow registration={registration} />
      </div>
      {tickets.length > 0 ? (
        <div className="px-8 pb-5 sm:px-10">
          <p className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="text-accent">
              <IconCoin className="h-4 w-4" aria-hidden="true" />
            </span>
            <span>参加費</span>
          </p>
          <TicketHeroList tickets={tickets} />
        </div>
      ) : null}
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
      </dl>
      {registration.kind === "open" ? (
        <div className="px-8 pb-7 sm:px-10">
          <Link
            href={`#${registerAnchorId}`}
            className="inline-flex min-h-12 w-full items-center justify-center border border-foreground bg-foreground px-6 text-sm tracking-[0.12em] text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            お申し込みへ進む
          </Link>
        </div>
      ) : null}
    </>
  );

  if (isSidebar) {
    return <div className={wrapperClassName}>{body}</div>;
  }
  return (
    <aside aria-label="イベント情報" className={wrapperClassName}>
      {body}
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
        <span className="tabular-nums">{capacity} 名</span>
        <span className="text-xs text-muted-foreground">
          残り{" "}
          <span className="font-medium tabular-nums text-accent">
            {registration.remainingCapacity} 席
          </span>
        </span>
      </span>
    );
  }

  if (registration.kind === "full") {
    return (
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span className="tabular-nums">{capacity} 名</span>
        <span className="text-xs text-muted-foreground">満席</span>
      </span>
    );
  }

  return <span className="tabular-nums">{capacity} 名</span>;
}

/**
 * TicketHeroList — spaces ReservationWidget の価格 hero と揃えた pricing block。
 *
 * 単一 ticket は hero 単独 (text-3xl)、複数 ticket は最初の ticket を hero、
 * 残りを secondary tier (text-xl) として layered 表示する。
 * 表記規律は spaces 価格 hero と一致:
 *   [price tabular-nums] [/ unit muted] [（税込）muted]
 */
function TicketHeroList({
  tickets,
}: {
  readonly tickets: readonly EventTicketSummary[];
}): ReactElement | null {
  const [primary, ...secondary] = tickets;
  if (!primary) return null;
  return (
    <>
      <TicketHero
        ticket={primary}
        tier="primary"
        showName={tickets.length > 1}
      />
      {secondary.map((ticket) => (
        <TicketHero key={ticket.id} ticket={ticket} tier="secondary" showName />
      ))}
    </>
  );
}

function TicketHero({
  ticket,
  tier,
  showName,
}: {
  readonly ticket: EventTicketSummary;
  readonly tier: "primary" | "secondary";
  readonly showName: boolean;
}): ReactElement {
  const isFree = ticket.price === 0;
  const priceLabel = isFree ? "無料" : formatPrice(ticket.price);
  const unitSuffix = isFree
    ? null
    : ticket.unitSize === 1
      ? "/ 1 名"
      : `/ ${String(ticket.unitSize)} 名`;
  const isPrimary = tier === "primary";
  return (
    <div className={cn(!isPrimary && "mt-3")}>
      {showName ? (
        <p className="mb-1 text-xs text-muted-foreground">{ticket.name}</p>
      ) : null}
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span
          className={cn(
            "font-medium leading-none tabular-nums text-foreground",
            isPrimary ? "text-3xl" : "text-xl",
          )}
        >
          {priceLabel}
        </span>
        {unitSuffix ? (
          <span className="text-xs text-muted-foreground">{unitSuffix}</span>
        ) : null}
        {!isFree ? (
          <span className="text-xs text-muted-foreground">（税込）</span>
        ) : null}
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
