"use client";

import { useState, type ReactElement } from "react";
import { IconInfoCircle } from "@tabler/icons-react";
import Image from "next/image";
import { cn } from "@/shared/lib/cn";
import {
  DEMO_SPACES,
  DEMO_TIME_SLOTS,
  formatPrice,
  type DemoSpace,
} from "./_data";

/**
 * Variant A: Compact Grid
 *
 * 現状改善 — 横長カード (画像 + 右テキスト) で密度向上 + Sticky 下部要約。
 */
export function VariantACompactGrid(): ReactElement {
  const [selected, setSelected] = useState<DemoSpace | null>(null);
  const [time, setTime] = useState<string | null>(null);

  return (
    <div className="@container relative">
      <section className="px-6 py-8">
        <p className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Step 1
        </p>
        <h3 className="font-heading text-xl font-light tracking-tight">
          スペースを選択
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          ご利用になるスペースをお選びください
        </p>

        <div
          role="radiogroup"
          aria-label="スペースを選択"
          className="mt-6 grid grid-cols-1 gap-3 @md:grid-cols-2 @3xl:grid-cols-3"
        >
          {DEMO_SPACES.map((space) => {
            const isSelected = selected?.id === space.id;
            return (
              <div
                key={space.id}
                role="radio"
                tabIndex={0}
                aria-checked={isSelected}
                onClick={() => setSelected(space)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(space);
                  }
                }}
                className={cn(
                  "grid cursor-pointer grid-cols-[110px_1fr] gap-3 border p-2 text-left transition-colors duration-200",
                  isSelected
                    ? "border-accent bg-accent/5"
                    : "border-border hover:border-foreground/30",
                )}
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface">
                  <Image
                    src={space.imageUrl}
                    alt={space.name}
                    fill
                    sizes="110px"
                    className="object-cover"
                  />
                </div>
                <div className="flex min-h-[110px] flex-col justify-between py-1">
                  <div>
                    <p className="font-heading text-sm font-light tracking-tight">
                      {space.name}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      定員{space.capacity}名 / {space.area}㎡
                    </p>
                  </div>
                  <p className="text-sm font-light text-accent">
                    {formatPrice(space.hourlyPrice)}
                    <span className="text-xs text-muted-foreground"> / h</span>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="border-t border-border px-6 py-8">
        <p className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Step 2
        </p>
        <h3 className="font-heading text-xl font-light tracking-tight">
          開始時刻を選択
        </h3>
        <div className="mt-6 grid grid-cols-3 gap-2 @md:grid-cols-5">
          {DEMO_TIME_SLOTS.map((slot) => (
            <button
              key={slot}
              type="button"
              onClick={() => setTime(slot)}
              className={cn(
                "min-h-11 border text-sm transition-colors",
                time === slot
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border text-foreground hover:border-foreground/30",
              )}
            >
              {slot}
            </button>
          ))}
        </div>
      </section>

      {/* Sticky bottom summary */}
      <div className="sticky bottom-0 border-t border-border bg-background/95 px-6 py-4 backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Selected
            </p>
            <p className="truncate text-sm font-light">
              {selected?.name ?? "未選択"}
              {time ? ` / ${time}~` : ""}
            </p>
          </div>
          <button
            type="button"
            disabled={!selected || !time}
            className={cn(
              "shrink-0 min-h-11 border px-6 text-sm uppercase tracking-[0.18em] transition-colors",
              selected && time
                ? "border-foreground bg-foreground text-background hover:bg-foreground/90"
                : "cursor-not-allowed border-border text-muted-foreground",
            )}
          >
            次へ
          </button>
        </div>
      </div>

      <button type="button" aria-label="詳細" className="hidden">
        <IconInfoCircle className="h-3 w-3" />
      </button>
    </div>
  );
}
