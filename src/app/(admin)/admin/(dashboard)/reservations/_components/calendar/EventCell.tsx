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

type EventCellStyle = CSSProperties & {
  readonly "--event-z": number;
};

/**
 * 構造化された aria-label を生成する。
 * 視覚的な title (hover tooltip) と SR 向け aria-label を分離。
 */
function buildAriaLabel(event: CalendarEvent): string {
  const time = `${formatTimeShort(event.startTime)} から ${formatTimeShort(event.endTime)}`;
  const status = RESERVATION_STATUS_LABELS[event.status];
  // Phase B.2 task 22: series instance であれば「N 回目 / 全 M 回」を aria-label に追加
  const series = formatSeriesLabel(event);
  return `${time}・${event.title}・スペース ${event.spaceName}・${status}${series ? `・${series}` : ""}`;
}

/**
 * Phase B.2 task 22: series instance label 生成。
 * `recurrenceInstanceIndex` は 0-based、表示は 1-based で「N 回目」形式。
 */
function formatSeriesLabel(event: CalendarEvent): string | null {
  if (!event.seriesId) return null;
  if (
    event.recurrenceInstanceIndex === undefined ||
    event.recurrenceInstanceIndex === null
  ) {
    return "定期予約";
  }
  const nth = event.recurrenceInstanceIndex + 1;
  if (event.seriesInstanceCount) {
    return `定期予約 ${nth} 回目 / 全 ${event.seriesInstanceCount} 回`;
  }
  return `定期予約 ${nth} 回目`;
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

  const style: EventCellStyle = {
    top: `${position.top}px`,
    height: `${position.height}px`,
    left: `${position.left}%`,
    width: `${position.width}%`,
    // Tailwind v4 CSS var arbitrary: `z-[var(--event-z)]` で参照
    "--event-z": position.zIndex,
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
        // Google Calendar 同等: 過去 / キャンセルは opacity に加え saturate も
        // 落とし、border-l-4 の鮮やかな色帯を desaturate して「明確に過去」感を出す。
        // Tailwind v4 公式 utility (saturate-{0,50,100,150,200} がデフォルトスケール)。
        isMuted && "opacity-60 saturate-50",
      )}
      style={style}
      onClick={() => onClick(event)}
    >
      <div className="flex items-center gap-1 font-semibold leading-tight tabular-nums">
        <CuratedIcon name={iconName} className="h-3 w-3 shrink-0" />
        <span className="truncate">{formatTimeShort(event.startTime)}</span>
        {event.seriesId && (
          // Phase B.2 task 22: series instance の視覚マーカー
          <span
            aria-hidden="true"
            className="ml-auto shrink-0 rounded bg-muted px-1 text-[0.6rem] font-medium text-muted-foreground leading-none"
          >
            定期
          </span>
        )}
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
        isMuted && "opacity-60 saturate-50",
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
      {event.seriesId && (
        // Phase B.2 task 22: series instance の視覚マーカー (月ビュー版)
        <span
          aria-hidden="true"
          className="ml-auto shrink-0 rounded bg-muted px-1 text-[0.55rem] font-medium text-muted-foreground leading-none"
        >
          定期
        </span>
      )}
    </button>
  );
}
