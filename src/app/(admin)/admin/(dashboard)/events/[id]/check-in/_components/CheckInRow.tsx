"use client";

import { IconCheck } from "@tabler/icons-react";
import { cn } from "@/shared/lib/cn";

type Attendee = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  quantity: number;
  attendedAt: string | null;
  ticket: { id: string; name: string };
};

type Props = {
  readonly attendee: Attendee;
  readonly disabled: boolean;
  readonly onToggle: () => void;
};

export function CheckInRow({ attendee, disabled, onToggle }: Props) {
  const attended = attendee.attendedAt !== null;

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={attended}
      aria-label={`${attendee.name} の出席を${attended ? "取消" : "記録"}`}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors",
        "hover:bg-accent/40 active:bg-accent/60",
        "disabled:cursor-not-allowed disabled:opacity-60",
        attended && "border-primary/40 bg-primary/5",
      )}
    >
      {/* 44px チェックボックス (Apple HIG / WCAG AAA タッチ標的) */}
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-md border-2",
          attended
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/40 bg-background",
        )}
      >
        {attended && <IconCheck className="h-6 w-6" strokeWidth={3} />}
      </span>

      {/* 参加者情報 */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-medium">{attendee.name}</span>
          {attendee.quantity > 1 && (
            <span className="text-xs text-muted-foreground">
              {attendee.quantity}名
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {attendee.ticket.name}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          {attendee.email && <span>{attendee.email}</span>}
          {attendee.phone && <span>{attendee.phone}</span>}
          {!attendee.email && !attendee.phone && (
            <span className="italic">連絡先未登録</span>
          )}
        </div>
      </div>

      {/* ステータスラベル */}
      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
          attended
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground",
        )}
      >
        {attended ? "出席済" : "未出席"}
      </span>
    </button>
  );
}
