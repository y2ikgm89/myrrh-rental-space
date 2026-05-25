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
 * Variant G: Step Wizard Improved (推奨)
 *
 * 現行 3 ステップ方式を温存しつつ:
 * - Step 1: 横長カード × 3 列 grid で 1 画面密度向上
 * - Step 2: sticky 下部バーに選択中スペース + 価格を常時表示
 * - Step 3: 既存 conform フォームを維持 (デモではモック表示)
 *
 * A (Compact Grid) + B (Sidebar Wizard 要約パネル発想) のハイブリッド。
 */

const STEPS = [
  { number: 1, label: "スペース選択" },
  { number: 2, label: "日時選択" },
  { number: 3, label: "情報入力" },
] as const;

export function VariantGStepWizardImproved(): ReactElement {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selected, setSelected] = useState<DemoSpace | null>(null);
  const [date, setDate] = useState<string>("2026-06-15");
  const [time, setTime] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);

  const total =
    selected && duration ? (selected.hourlyPrice * duration) / 60 : null;

  const canAdvanceFromStep1 = selected !== null;
  const canAdvanceFromStep2 = time !== null && duration !== null;

  return (
    <div className="@container relative px-6 py-8 md:px-10 md:py-10">
      {/* StepIndicator */}
      <ol
        className="mx-auto mb-10 flex max-w-md items-center justify-between gap-2"
        aria-label="予約ステップ"
      >
        {STEPS.map((s, idx) => {
          const isCurrent = s.number === step;
          const isCompleted = s.number < step;
          return (
            <li key={s.number} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  "inline-flex h-8 w-8 shrink-0 items-center justify-center border text-xs",
                  isCompleted
                    ? "border-accent bg-accent text-accent-foreground"
                    : isCurrent
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground",
                )}
                aria-current={isCurrent ? "step" : undefined}
              >
                {isCompleted ? (
                  <IconCheck className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  s.number
                )}
              </span>
              <span
                className={cn(
                  "hidden text-xs uppercase tracking-[0.12em] @md:inline",
                  isCurrent ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {s.label}
              </span>
              {idx < STEPS.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="ml-2 h-px flex-1 bg-divider"
                />
              ) : null}
            </li>
          );
        })}
      </ol>

      {/* Step 1: Space selection (横長カード × 3 列) */}
      {step === 1 ? (
        <section>
          <p className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Step 01
          </p>
          <h3 className="font-heading text-2xl font-light tracking-tight">
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
                      <p className="mt-1 line-clamp-1 text-xs italic text-muted-foreground">
                        {space.tagline}
                      </p>
                    </div>
                    <p className="text-sm font-light text-accent">
                      {formatPrice(space.hourlyPrice)}
                      <span className="text-xs text-muted-foreground">
                        {" "}
                        / h
                      </span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Step 2: Date & Time */}
      {step === 2 ? (
        <section>
          <p className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Step 02
          </p>
          <h3 className="font-heading text-2xl font-light tracking-tight">
            日時を選択
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {selected?.name} の予約日時をお選びください
          </p>

          <div className="mt-6 space-y-6">
            <label className="block">
              <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                日付
              </span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-2 block w-full min-h-11 border border-border bg-background px-3 py-2 text-sm focus:border-foreground focus:outline-none"
              />
            </label>

            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                開始時刻
              </p>
              <div className="mt-2 grid grid-cols-4 gap-2 @md:grid-cols-5">
                {DEMO_TIME_SLOTS.map((slot, idx) => {
                  const isBooked = idx % 4 === 2;
                  const isSelected = time === slot;
                  return (
                    <button
                      key={slot}
                      type="button"
                      disabled={isBooked}
                      onClick={() => setTime(slot)}
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

            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
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
          </div>
        </section>
      ) : null}

      {/* Step 3: Customer info (mock) */}
      {step === 3 ? (
        <section>
          <p className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Step 03
          </p>
          <h3 className="font-heading text-2xl font-light tracking-tight">
            情報を入力
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            予約内容を確認のうえ、お客様情報をご入力ください
          </p>

          {/* Summary card */}
          <div className="mt-6 border border-border bg-surface p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-accent">
              Booking Summary
            </p>
            <dl className="mt-4 divide-y divide-divider text-sm">
              <div className="flex justify-between py-2">
                <dt className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
                  スペース
                </dt>
                <dd>{selected?.name ?? "—"}</dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
                  日時
                </dt>
                <dd>
                  {date} {time}~
                </dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
                  時間
                </dt>
                <dd>{duration}分</dd>
              </div>
              <div className="flex items-baseline justify-between py-2">
                <dt className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
                  合計
                </dt>
                <dd className="text-lg font-light text-accent">
                  {total != null ? formatPrice(total) : "—"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="mt-6 space-y-4">
            <input
              type="text"
              placeholder="お名前"
              className="block w-full min-h-11 border-b border-border bg-transparent px-1 py-3 text-sm focus:border-foreground focus:outline-none"
            />
            <input
              type="email"
              placeholder="メールアドレス"
              className="block w-full min-h-11 border-b border-border bg-transparent px-1 py-3 text-sm focus:border-foreground focus:outline-none"
            />
          </div>
        </section>
      ) : null}

      {/* Sticky bottom bar — Step 2/3 で選択中サマリー + 進行ボタン */}
      <div className="sticky bottom-0 mt-10 border-t border-border bg-background/95 px-6 py-4 backdrop-blur md:-mx-10 md:px-10">
        <div className="flex items-center justify-between gap-4">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((step - 1) as 1 | 2 | 3)}
              className="shrink-0 min-h-11 border border-border bg-background px-4 text-xs uppercase tracking-[0.18em] hover:border-foreground/30"
            >
              戻る
            </button>
          ) : (
            <div />
          )}

          <div className="flex min-w-0 items-center gap-4">
            {/* 選択中サマリー (Step 2/3 で常時可視) */}
            {step >= 2 && selected ? (
              <div className="hidden min-w-0 text-right @md:block">
                <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
                  Selected
                </p>
                <p className="truncate text-sm">
                  {selected.name}
                  {total != null ? (
                    <span className="ml-2 text-accent">
                      {formatPrice(total)}
                    </span>
                  ) : null}
                </p>
              </div>
            ) : null}

            {step < 3 ? (
              <button
                type="button"
                disabled={
                  (step === 1 && !canAdvanceFromStep1) ||
                  (step === 2 && !canAdvanceFromStep2)
                }
                onClick={() => setStep((step + 1) as 1 | 2 | 3)}
                className={cn(
                  "shrink-0 min-h-11 border px-6 text-xs uppercase tracking-[0.18em] transition-colors",
                  (step === 1 && canAdvanceFromStep1) ||
                    (step === 2 && canAdvanceFromStep2)
                    ? "border-foreground bg-foreground text-background hover:bg-foreground/90"
                    : "cursor-not-allowed border-border text-muted-foreground",
                )}
              >
                次へ →
              </button>
            ) : (
              <button
                type="button"
                className="shrink-0 min-h-11 border border-accent bg-accent px-6 text-xs uppercase tracking-[0.18em] text-accent-foreground hover:bg-accent/90"
              >
                予約を確定する
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
