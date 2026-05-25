"use client";

import { useState, type ReactElement } from "react";
import Image from "next/image";
import { cn } from "@/shared/lib/cn";
import {
  DEMO_SPACES,
  DEMO_TIME_SLOTS,
  DEMO_DURATIONS,
  formatPrice,
  type DemoSpace,
} from "./_data";

/**
 * Variant B: Sidebar Wizard
 *
 * 左ステップ / 右常時要約パネル。Airbnb / Booking.com の予約 UX。
 */
export function VariantBSidebarWizard(): ReactElement {
  const [selected, setSelected] = useState<DemoSpace | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [date, setDate] = useState<string>("2026-06-15");

  const total =
    selected && duration ? (selected.hourlyPrice * duration) / 60 : null;

  return (
    <div className="@container grid grid-cols-1 gap-8 px-6 py-8 @3xl:grid-cols-[1fr_320px]">
      {/* Left: wizard */}
      <div className="space-y-10">
        <section>
          <p className="mb-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            01 — Space
          </p>
          <h3 className="font-heading text-xl font-light tracking-tight">
            スペース
          </h3>
          <div className="mt-5 space-y-2">
            {DEMO_SPACES.map((space) => {
              const isSelected = selected?.id === space.id;
              return (
                <button
                  type="button"
                  key={space.id}
                  onClick={() => setSelected(space)}
                  aria-pressed={isSelected}
                  className={cn(
                    "flex w-full items-center gap-4 border p-3 text-left transition-colors min-h-11",
                    isSelected
                      ? "border-accent bg-accent/5"
                      : "border-border hover:border-foreground/30",
                  )}
                >
                  <div className="relative aspect-square w-16 shrink-0 overflow-hidden bg-surface">
                    <Image
                      src={space.imageUrl}
                      alt={space.name}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-heading text-sm font-light">
                      {space.name}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      定員{space.capacity}名 / {space.area}㎡
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-light text-accent">
                    {formatPrice(space.hourlyPrice)}
                    <span className="text-xs text-muted-foreground">/h</span>
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <p className="mb-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            02 — Date & Time
          </p>
          <h3 className="font-heading text-xl font-light tracking-tight">
            日時
          </h3>
          <div className="mt-5">
            <label className="block">
              <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                日付
              </span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-2 block w-full border border-border bg-background px-3 py-2 text-sm min-h-11 focus:border-foreground focus:outline-none"
              />
            </label>
            <p className="mt-5 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              開始時刻
            </p>
            <div className="mt-2 grid grid-cols-4 gap-2 @md:grid-cols-5">
              {DEMO_TIME_SLOTS.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setTime(slot)}
                  className={cn(
                    "min-h-11 border text-sm transition-colors",
                    time === slot
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border hover:border-foreground/30",
                  )}
                >
                  {slot}
                </button>
              ))}
            </div>
            <p className="mt-5 text-xs uppercase tracking-[0.18em] text-muted-foreground">
              利用時間
            </p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {DEMO_DURATIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDuration(d.value)}
                  className={cn(
                    "min-h-11 border text-sm transition-colors",
                    duration === d.value
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border hover:border-foreground/30",
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Right: persistent summary */}
      <aside className="@3xl:sticky @3xl:top-[calc(var(--header-height)+1rem)] @3xl:self-start">
        <div className="border border-border bg-surface p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-accent">
            Your Booking
          </p>
          <h4 className="mt-1 font-heading text-lg font-light tracking-tight">
            予約内容
          </h4>

          {selected ? (
            <div className="relative mt-4 aspect-[4/3] w-full overflow-hidden bg-background">
              <Image
                src={selected.imageUrl}
                alt={selected.name}
                fill
                sizes="320px"
                className="object-cover"
              />
            </div>
          ) : (
            <div className="mt-4 flex aspect-[4/3] w-full items-center justify-center border border-dashed border-border bg-background text-xs text-muted-foreground">
              スペースを選択
            </div>
          )}

          <dl className="mt-5 divide-y divide-divider text-sm">
            <div className="flex justify-between py-3">
              <dt className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
                スペース
              </dt>
              <dd className="text-foreground">{selected?.name ?? "—"}</dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
                日時
              </dt>
              <dd className="text-foreground">
                {date}
                {time ? ` ${time}~` : ""}
              </dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
                時間
              </dt>
              <dd className="text-foreground">
                {duration ? `${duration}分` : "—"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between py-3">
              <dt className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
                小計
              </dt>
              <dd className="text-lg font-light text-accent">
                {total != null ? formatPrice(total) : "—"}
              </dd>
            </div>
          </dl>

          <button
            type="button"
            disabled={!selected || !time || !duration}
            className={cn(
              "mt-5 w-full min-h-11 border text-sm uppercase tracking-[0.18em] transition-colors",
              selected && time && duration
                ? "border-foreground bg-foreground text-background"
                : "cursor-not-allowed border-border text-muted-foreground",
            )}
          >
            予約に進む
          </button>
        </div>
      </aside>
    </div>
  );
}
