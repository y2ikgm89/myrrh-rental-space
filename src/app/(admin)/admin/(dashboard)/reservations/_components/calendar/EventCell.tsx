"use client";

import type { CSSProperties } from "react";
import { cn } from "@/shared/lib/cn";
import { formatTimeShort } from "@/shared/lib/date-format";
import { getStatusColorClass } from "@/admin/lib/calendar";
import type { CalendarEvent, PositionedEvent } from "@/admin/lib/calendar";
import { CuratedIcon } from "@/shared/components/icon-curation/CuratedIcon";
import {
  RESERVATION_STATUS_ICONS,
  RESERVATION_STATUS_LABELS,
} from "@/shared/lib/validations/enums/helpers";

interface EventCellProps {
  event: PositionedEvent;
  onClick: (event: CalendarEvent) => void;
  /** イベント終了時刻が現在より過去か (Google Calendar 同等の muted 表示) */
  isPast?: boolean;
}

/**
 * 構造化された aria-label を生成する。
 * 視覚的な title (hover tooltip) と SR 向け aria-label を分離。
 */
function buildAriaLabel(event: CalendarEvent): string {
  const time = `${formatTimeShort(event.startTime)} から ${formatTimeShort(event.endTime)}`;
  const status = RESERVATION_STATUS_LABELS[event.status];
  return `${time}・${event.title}・スペース ${event.spaceName}・${status}`;
}

/**
 * 時間軸カレンダー (Week/Day/Resource) の絶対配置イベントセル。
 *
 * - 高さに応じて情報量を 3 段階で出し分け (time-only / +title / +space)
 * - キャンセル予約は line-through + opacity で控えめに表示
 * - z-index は CSS 変数 `--event-z` 経由で渡し、focus-visible:z-30 / hover:z-20 が
 *   Tailwind 側で specificity 勝ちできるようにする (inline `style.zIndex` を使うと
 *   class の `focus-visible:z-30` が specificity 負けして corner sticky の背後に
 *   隠れる a11y 回帰を起こす)
 * - WCAG 2.5.5 (44px) — 最小高さ 20px は calculateEventPosition が担保、本体は
 *   click 可能。aria-label に「開始-終了・タイトル・スペース・ステータス」を構造化
 */
export function EventCell({ event, onClick, isPast = false }: EventCellProps) {
  const { position } = event;
  const isCancelled = event.status === "CANCELLED";
  const iconName = RESERVATION_STATUS_ICONS[event.status];
  const showTitle = position.height >= 36;
  const showMeta = position.height >= 60;
  // 過去イベント / キャンセルは統一的に muted (Google Calendar 同等)
  const isMuted = isCancelled || isPast;

  const style: CSSProperties = {
    top: `${position.top}px`,
    height: `${position.height}px`,
    left: `${position.left}%`,
    width: `${position.width}%`,
    // Tailwind v4 CSS var arbitrary: `z-[var(--event-z)]` で参照
    ["--event-z" as string]: position.zIndex,
  };

  return (
    <button
      type="button"
      title={`${formatTimeShort(event.startTime)}-${formatTimeShort(event.endTime)}  ${event.title}  (${event.spaceName})`}
      aria-label={buildAriaLabel(event)}
      className={cn(
        "group absolute overflow-hidden rounded-md border-l-4 px-1.5 py-1 text-left text-xs transition-all",
        "z-[var(--event-z)] hover:z-20 focus-visible:z-30",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        "hover:shadow-md",
        getStatusColorClass(event.status),
        isMuted && "opacity-60",
      )}
      style={style}
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
  /** イベント終了時刻が現在より過去か (Google Calendar 同等の muted 表示) */
  isPast?: boolean;
}

/**
 * 月ビューのコンパクトな 1 行イベントバッジ。
 *
 * - 縦に並ぶため時刻 + タイトルのみ表示
 * - 取消線は CANCELLED のみ
 * - SR 向け aria-label は EventCell と統一フォーマット
 */
export function EventBadge({
  event,
  onClick,
  isPast = false,
}: EventBadgeProps) {
  const isCancelled = event.status === "CANCELLED";
  const iconName = RESERVATION_STATUS_ICONS[event.status];
  const isMuted = isCancelled || isPast;

  return (
    <button
      type="button"
      title={`${formatTimeShort(event.startTime)}-${formatTimeShort(event.endTime)}  ${event.title}  (${event.spaceName})`}
      aria-label={buildAriaLabel(event)}
      className={cn(
        "mb-0.5 flex w-full items-center gap-1 truncate rounded border-l-2 px-1.5 py-0.5 text-left text-xs transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        getStatusColorClass(event.status),
        isMuted && "opacity-60",
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
