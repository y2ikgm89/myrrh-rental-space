import type { ReactElement, ReactNode } from "react";
import Link from "next/link";
import { IconCalendar, IconMapPin, IconUsers } from "@tabler/icons-react";
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
 * Split Hero Card パターン（Lu.ma / Cal.com の現代 booking widget 業界標準）。
 *
 * 1. **Hero block (`bg-surface`)** — Status Badge + 価格 hero + 残席状況
 * 2. **Detail list (`bg-background`)** — 日時 + 開催場所（icon + label + 値）
 * 3. **CTA block** — `bg-foreground` ボタン（`registration.kind === "open"` のみ）
 *
 * 視覚ヒエラルキー: 一目で「予約可否 / 価格 / 残席」が分かる hero zone と、
 * scan して読む詳細情報 zone を明確に分離。Editorial Magazine ブランド
 * （`bg-surface` warm cream）を保持しつつ、申込導線を阻害しない設計。
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
        "overflow-hidden border border-border bg-background shadow-sm",
        isSidebar
          ? "lg:sticky lg:top-[calc(var(--header-height)+2rem)]"
          : "mb-12",
      )}
    >
      <HeroBlock registration={registration} price={price} />
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

function HeroBlock({
  registration,
  price,
}: {
  readonly registration: RegistrationState;
  readonly price: number | null;
}): ReactElement {
  const isInactive =
    registration.kind === "deadline-passed" || registration.kind === "closed";

  return (
    <div className="bg-surface px-8 pb-8 pt-8 sm:px-10 sm:pb-10 sm:pt-10">
      <RegistrationBadgeRow registration={registration} />
      {price !== null ? (
        <p
          className={cn(
            "mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-1 font-heading",
            isInactive && "opacity-60",
          )}
        >
          <span
            className={cn(
              "font-normal leading-none text-foreground",
              isInactive ? "text-3xl" : "text-[2.5rem]",
            )}
          >
            {price === 0 ? "無料" : formatPrice(price)}
          </span>
          {price > 0 ? (
            <span className="text-sm text-muted-foreground">
              / 1 名（税込）
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
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
 * Hero block (bg-surface) 上で visible なネガティブ状態 Badge。
 * Badge primitive の `variant="default"` は `bg-surface text-foreground` で
 * 同色背景に溶ける silent bug を回避するため、background + border の outline 枠で描画。
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
      <dt className="flex items-center gap-2 pt-5 text-xs text-muted-foreground first:pt-7">
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
