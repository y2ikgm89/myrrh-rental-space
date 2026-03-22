"use client";

import type { ReactElement } from "react";

interface BookingSummaryProps {
  readonly spaceName: string;
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly guests: number;
  readonly price: number | null;
  readonly onEdit?: () => void;
}

function formatDateJa(dateStr: string): string {
  try {
    const date = new Date(`${dateStr}T00:00:00`);
    return date.toLocaleDateString("ja-JP", {
      month: "long",
      day: "numeric",
      weekday: "short",
    });
  } catch {
    return dateStr;
  }
}

function formatDurationLabel(start: string, end: string): string {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startMin = (sh ?? 0) * 60 + (sm ?? 0);
  const endMin = (eh ?? 0) * 60 + (em ?? 0);
  const diff = endMin - startMin;
  if (diff < 60) return `${diff}分`;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

export function BookingSummary({
  spaceName,
  date,
  startTime,
  endTime,
  guests,
  price,
  onEdit,
}: BookingSummaryProps): ReactElement {
  return (
    <div className="rounded-lg border border-accent/20 bg-accent/5 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="font-heading text-sm font-medium tracking-tight">
            {spaceName}
          </p>
          <p className="text-sm text-muted-foreground">
            {formatDateJa(date)} {startTime} → {endTime}（
            {formatDurationLabel(startTime, endTime)}）
          </p>
          <p className="text-sm text-muted-foreground">{guests}名</p>
        </div>
        <div className="text-right">
          {price !== null ? (
            <p className="font-heading text-lg text-accent">
              &yen;{price.toLocaleString()}
            </p>
          ) : null}
          {onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="mt-1 text-xs text-accent underline underline-offset-2 hover:text-accent/80"
            >
              変更する
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
