"use client";

import { useState, type ReactElement } from "react";
import Image from "next/image";
import { IconCheck } from "@tabler/icons-react";
import { cn } from "@/shared/lib/cn";
import {
  DEMO_SPACES,
  DEMO_TIME_SLOTS,
  DEMO_DURATIONS,
  formatPrice,
  type DemoSpace,
} from "./_data";

/**
 * Variant C: Single Page Scroll
 *
 * ステップ分割なし、1 画面の縦スクロールで全完結。
 * 各セクションが選択完了で次の入力を促す形で展開。
 */
export function VariantCSinglePageScroll(): ReactElement {
  const [selected, setSelected] = useState<DemoSpace | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);

  return (
    <div className="@container divide-y divide-divider">
      <SectionBlock
        number="01"
        title="スペース"
        completed={selected !== null}
        summary={selected?.name}
      >
        <div
          role="radiogroup"
          aria-label="スペースを選択"
          className="grid grid-cols-1 gap-3 @md:grid-cols-2 @3xl:grid-cols-3"
        >
          {DEMO_SPACES.map((space) => {
            const isSelected = selected?.id === space.id;
            return (
              <button
                type="button"
                key={space.id}
                role="radio"
                aria-checked={isSelected}
                onClick={() => setSelected(space)}
                className={cn(
                  "flex flex-col border text-left transition-colors min-h-11",
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
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover"
                  />
                </div>
                <div className="p-3">
                  <p className="font-heading text-sm font-light">
                    {space.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    定員{space.capacity}名 / {space.area}㎡
                  </p>
                  <p className="mt-1.5 text-sm font-light text-accent">
                    {formatPrice(space.hourlyPrice)} / h
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </SectionBlock>

      <SectionBlock
        number="02"
        title="開始時刻"
        completed={time !== null}
        summary={time ? `${time}~` : undefined}
        disabled={selected === null}
      >
        <div className="grid grid-cols-3 gap-2 @md:grid-cols-5">
          {DEMO_TIME_SLOTS.map((slot) => (
            <button
              key={slot}
              type="button"
              disabled={selected === null}
              onClick={() => setTime(slot)}
              className={cn(
                "min-h-11 border text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                time === slot
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border hover:border-foreground/30",
              )}
            >
              {slot}
            </button>
          ))}
        </div>
      </SectionBlock>

      <SectionBlock
        number="03"
        title="利用時間"
        completed={duration !== null}
        summary={duration != null ? `${duration}分` : undefined}
        disabled={time === null}
      >
        <div className="grid grid-cols-4 gap-2">
          {DEMO_DURATIONS.map((d) => (
            <button
              key={d.value}
              type="button"
              disabled={time === null}
              onClick={() => setDuration(d.value)}
              className={cn(
                "min-h-11 border text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                duration === d.value
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border hover:border-foreground/30",
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
      </SectionBlock>

      <SectionBlock
        number="04"
        title="情報入力"
        completed={false}
        disabled={duration === null}
      >
        <div className="space-y-4">
          <input
            type="text"
            placeholder="お名前"
            disabled={duration === null}
            className="block w-full border-b border-border bg-transparent px-1 py-3 text-sm min-h-11 focus:border-foreground focus:outline-none disabled:opacity-40"
          />
          <input
            type="email"
            placeholder="メールアドレス"
            disabled={duration === null}
            className="block w-full border-b border-border bg-transparent px-1 py-3 text-sm min-h-11 focus:border-foreground focus:outline-none disabled:opacity-40"
          />
          <button
            type="button"
            disabled={duration === null}
            className={cn(
              "w-full min-h-11 border text-sm uppercase tracking-[0.18em] transition-colors mt-6",
              duration !== null
                ? "border-foreground bg-foreground text-background"
                : "cursor-not-allowed border-border text-muted-foreground",
            )}
          >
            予約を確定する
          </button>
        </div>
      </SectionBlock>
    </div>
  );
}

function SectionBlock({
  number,
  title,
  completed,
  summary,
  disabled = false,
  children,
}: {
  readonly number: string;
  readonly title: string;
  readonly completed: boolean;
  readonly summary?: string | undefined;
  readonly disabled?: boolean;
  readonly children: React.ReactNode;
}): ReactElement {
  return (
    <section
      className={cn("px-6 py-8 transition-opacity", disabled && "opacity-50")}
    >
      <header className="mb-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center border text-xs",
              completed
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border text-muted-foreground",
            )}
            aria-hidden="true"
          >
            {completed ? <IconCheck className="h-3.5 w-3.5" /> : number}
          </span>
          <h3 className="font-heading text-lg font-light tracking-tight">
            {title}
          </h3>
        </div>
        {summary ? (
          <p className="text-xs uppercase tracking-[0.15em] text-accent">
            {summary}
          </p>
        ) : null}
      </header>
      {children}
    </section>
  );
}
