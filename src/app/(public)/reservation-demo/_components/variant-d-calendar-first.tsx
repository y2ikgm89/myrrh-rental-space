"use client";

import { useState, type ReactElement } from "react";
import { cn } from "@/shared/lib/cn";
import { DEMO_SPACES, DEMO_TIME_SLOTS, formatPrice } from "./_data";

/**
 * Variant D: Calendar First
 *
 * 大カレンダー中心レイアウト。左にスペースリスト、上に日付タブ、本体にタイムスロット。
 * Cal.com / Google Calendar Appointment の業界標準。
 */
export function VariantDCalendarFirst(): ReactElement {
  const [selectedSpaceId, setSelectedSpaceId] = useState<string>(
    DEMO_SPACES[0]?.id ?? "",
  );
  const [selectedDay, setSelectedDay] = useState<number>(15);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const selectedSpace = DEMO_SPACES.find((s) => s.id === selectedSpaceId);

  const days = Array.from({ length: 7 }, (_, i) => 15 + i);
  const dayNames = ["月", "火", "水", "木", "金", "土", "日"];

  return (
    <div className="@container grid grid-cols-1 gap-0 @md:grid-cols-[200px_1fr]">
      {/* Left: space list */}
      <aside className="border-border @md:border-r p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Space
        </p>
        <h3 className="mt-1 font-heading text-base font-light tracking-tight">
          スペース
        </h3>
        <div className="mt-4 space-y-1">
          {DEMO_SPACES.map((space) => {
            const isActive = space.id === selectedSpaceId;
            return (
              <button
                type="button"
                key={space.id}
                onClick={() => setSelectedSpaceId(space.id)}
                className={cn(
                  "block w-full border-l-2 px-3 py-2 text-left text-sm transition-colors min-h-11",
                  isActive
                    ? "border-l-accent bg-accent/5 text-foreground"
                    : "border-l-transparent text-muted-foreground hover:bg-surface hover:text-foreground",
                )}
              >
                <p className="font-heading font-light">{space.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatPrice(space.hourlyPrice)} / h
                </p>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Right: calendar */}
      <div className="p-5 @md:p-6">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              June 2026
            </p>
            <h3 className="mt-1 font-heading text-xl font-light tracking-tight">
              {selectedSpace?.name ?? "—"}
            </h3>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              aria-label="前の週"
              className="min-h-11 min-w-11 border border-border text-sm hover:border-foreground/30"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="次の週"
              className="min-h-11 min-w-11 border border-border text-sm hover:border-foreground/30"
            >
              ›
            </button>
          </div>
        </div>

        {/* Day tabs */}
        <div
          role="tablist"
          aria-label="日付"
          className="mt-6 grid grid-cols-7 gap-1"
        >
          {days.map((d, i) => {
            const isActive = d === selectedDay;
            return (
              <button
                role="tab"
                aria-selected={isActive}
                type="button"
                key={d}
                onClick={() => setSelectedDay(d)}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center border transition-colors",
                  isActive
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border hover:border-foreground/30",
                )}
              >
                <span className="text-xs uppercase tracking-[0.12em]">
                  {dayNames[i]}
                </span>
                <span className="font-heading text-base font-light">{d}</span>
              </button>
            );
          })}
        </div>

        {/* Time slot grid */}
        <div className="mt-6">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            空き時間
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 @md:grid-cols-5">
            {DEMO_TIME_SLOTS.map((slot, idx) => {
              // mock: every 3rd slot is booked
              const isBooked = idx % 4 === 2;
              const isSelected = selectedSlot === slot;
              return (
                <button
                  key={slot}
                  type="button"
                  disabled={isBooked}
                  onClick={() => setSelectedSlot(slot)}
                  className={cn(
                    "min-h-11 border text-sm transition-colors disabled:cursor-not-allowed",
                    isBooked
                      ? "border-border bg-muted text-muted-foreground line-through"
                      : isSelected
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border hover:border-foreground/30",
                  )}
                >
                  {slot}
                </button>
              );
            })}
          </div>
        </div>

        {selectedSlot ? (
          <div className="mt-6 flex items-center justify-between gap-4 border-t border-border pt-5">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Selected
              </p>
              <p className="text-sm">
                6月{selectedDay}日 {selectedSlot}~ /{" "}
                <span className="text-accent">{selectedSpace?.name}</span>
              </p>
            </div>
            <button
              type="button"
              className="min-h-11 border border-foreground bg-foreground px-6 text-sm uppercase tracking-[0.18em] text-background"
            >
              次へ
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
