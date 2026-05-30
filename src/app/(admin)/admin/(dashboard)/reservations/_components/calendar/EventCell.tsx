"use client";

import { cn } from "@/shared/lib/cn";
import { formatTimeShort } from "@/shared/lib/date-format";
import { getStatusColorClass } from "@/admin/lib/calendar";
import type { CalendarEvent, PositionedEvent } from "@/admin/lib/calendar";
import { CuratedIcon } from "@/shared/components/icon-curation/CuratedIcon";
import { RESERVATION_STATUS_ICONS } from "@/shared/lib/validations/enums/helpers";

interface EventCellProps {
  event: PositionedEvent;
  onClick: (event: CalendarEvent) => void;
}

/**
 * 時間軸カレンダー (Week/Day/Resource) の絶対配置イベントセル。
 *
 * - 高さに応じて情報量を 3 段階で出し分け（time-only / +title / +space）
 * - キャンセル予約は line-through + opacity で控えめに表示
 * - WCAG 2.5.5 (44px) — 最小高さ20pxは calculateEventPosition で担保、本体は 44px 以下でも click可能
 */
export function EventCell({ event, onClick }: EventCellProps) {
  const { position } = event;
  const isCancelled = event.status === "CANCELLED";
  const iconName = RESERVATION_STATUS_ICONS[event.status];
  const showTitle = position.height >= 36;
  const showMeta = position.height >= 60;

  return (
    <button
      type="button"
      title={`${formatTimeShort(event.startTime)}-${formatTimeShort(event.endTime)}  ${event.title}  (${event.spaceName})`}
      className={cn(
        "group absolute overflow-hidden rounded-md border-l-4 px-2 py-1 text-left text-xs transition-all",
        "focus-visible:z-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        "hover:z-20 hover:shadow-md",
        getStatusColorClass(event.status),
        isCancelled && "opacity-60",
      )}
      style={{
        top: `${position.top}px`,
        height: `${position.height}px`,
        left: `${position.left}%`,
        width: `${position.width}%`,
        zIndex: position.zIndex,
      }}
      onClick={() => onClick(event)}
    >
      <div className="flex items-center gap-1 font-semibold leading-tight tabular-nums">
        <CuratedIcon name={iconName} className="h-3 w-3 shrink-0" />
        <span className="truncate">{formatTimeShort(event.startTime)}</span>
      </div>
      {showTitle && (
        <div
          className={cn(
            "mt-0.5 truncate font-medium leading-tight",
            isCancelled && "line-through",
          )}
        >
          {event.title}
        </div>
      )}
      {showMeta && (
        <div className="mt-0.5 truncate text-[0.6875rem] leading-tight text-muted-foreground">
          {event.spaceName}
        </div>
      )}
    </button>
  );
}

interface EventBadgeProps {
  event: CalendarEvent;
  onClick: (event: CalendarEvent) => void;
}

/**
 * 月ビューのコンパクトな1行イベントバッジ。
 *
 * - 縦に並ぶため、時刻 + タイトル のみ表示
 * - 取消線は CANCELLED のみ
 */
export function EventBadge({ event, onClick }: EventBadgeProps) {
  const isCancelled = event.status === "CANCELLED";
  const iconName = RESERVATION_STATUS_ICONS[event.status];

  return (
    <button
      type="button"
      title={`${formatTimeShort(event.startTime)}-${formatTimeShort(event.endTime)}  ${event.title}  (${event.spaceName})`}
      className={cn(
        "mb-0.5 flex w-full items-center gap-1 truncate rounded border-l-2 px-1.5 py-0.5 text-left text-xs transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        getStatusColorClass(event.status),
        isCancelled && "opacity-60",
      )}
      onClick={() => onClick(event)}
    >
      <CuratedIcon name={iconName} className="h-3 w-3 shrink-0" />
      <span className="shrink-0 font-semibold tabular-nums">
        {formatTimeShort(event.startTime)}
      </span>
      <span className={cn("truncate", isCancelled && "line-through")}>
        {event.title}
      </span>
    </button>
  );
}
