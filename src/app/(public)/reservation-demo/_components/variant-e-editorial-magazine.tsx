"use client";

import { useState, type ReactElement } from "react";
import Image from "next/image";
import { cn } from "@/shared/lib/cn";
import { DEMO_SPACES, formatPrice, type DemoSpace } from "./_data";

/**
 * Variant E: Editorial Magazine
 *
 * 1 ステップ = 1 画面の editorial composition。大余白、セリフ大見出し、
 * 大きな写真。ホテル系・高級不動産系の予約 UX。
 */
export function VariantEEditorialMagazine(): ReactElement {
  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<DemoSpace | null>(null);

  if (step === 1) {
    return (
      <div className="px-6 py-16 @md:px-12 @md:py-24">
        <div className="mx-auto max-w-[var(--container-editorial)]">
          <p className="mb-4 text-xs uppercase tracking-[0.24em] text-accent">
            Step One — Select Space
          </p>
          <h2 className="font-heading text-4xl font-light leading-[1.1] tracking-tight @md:text-5xl">
            あなたに合った
            <br />
            <em className="font-normal italic">空間</em> を選ぶ
          </h2>
          <p className="mt-6 max-w-[var(--prose-medium)] text-sm leading-[1.9] text-muted-foreground">
            一日を共にする場所を、ゆっくりとお選びください。
            それぞれの空間には、異なる時間の流れがあります。
          </p>

          <div className="mt-16 space-y-20">
            {DEMO_SPACES.map((space, idx) => {
              const isReverse = idx % 2 === 1;
              const isSelected = selected?.id === space.id;
              return (
                <article
                  key={space.id}
                  className={cn(
                    "@container grid grid-cols-1 gap-8 @md:grid-cols-2 @md:gap-12",
                    isReverse && "@md:[&>*:first-child]:order-2",
                  )}
                >
                  <div className="relative aspect-[4/5] w-full overflow-hidden bg-surface">
                    <Image
                      src={space.imageUrl}
                      alt={space.name}
                      fill
                      sizes="(max-width: 768px) 100vw, 50vw"
                      className="object-cover"
                    />
                  </div>
                  <div className="flex flex-col justify-center">
                    <p className="text-xs uppercase tracking-[0.24em] text-accent">
                      0{idx + 1} / 0{DEMO_SPACES.length}
                    </p>
                    <h3 className="mt-3 font-heading text-3xl font-light leading-tight tracking-tight">
                      {space.name}
                    </h3>
                    <p className="mt-2 text-sm italic text-muted-foreground">
                      {space.tagline}
                    </p>

                    <dl className="mt-8 grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <dt className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          Capacity
                        </dt>
                        <dd className="mt-1 font-heading text-lg font-light">
                          {space.capacity} 名
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          Area
                        </dt>
                        <dd className="mt-1 font-heading text-lg font-light">
                          {space.area} ㎡
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-8 flex items-baseline justify-between border-t border-divider pt-5">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Hourly
                      </p>
                      <p className="font-heading text-2xl font-light text-accent">
                        {formatPrice(space.hourlyPrice)}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelected(space);
                        setStep(2);
                      }}
                      aria-pressed={isSelected}
                      className={cn(
                        "mt-8 min-h-11 border px-8 py-3 text-xs uppercase tracking-[0.24em] transition-colors self-start",
                        isSelected
                          ? "border-accent bg-accent text-accent-foreground"
                          : "border-foreground text-foreground hover:bg-foreground hover:text-background",
                      )}
                    >
                      この空間を選ぶ →
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-16 @md:px-12 @md:py-24">
      <div className="mx-auto max-w-[var(--container-editorial)] text-center">
        <p className="mb-4 text-xs uppercase tracking-[0.24em] text-accent">
          Step Two — Date & Time
        </p>
        <h2 className="font-heading text-4xl font-light leading-[1.1] tracking-tight @md:text-5xl">
          <em className="italic">いつ</em> ご利用ですか
        </h2>
        <p className="mx-auto mt-6 max-w-[var(--prose-medium)] text-sm leading-[1.9] text-muted-foreground">
          {selected?.name} のご利用日時をお選びください。
        </p>

        <div className="mx-auto mt-12 max-w-md space-y-6">
          <label className="block text-left">
            <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              日付
            </span>
            <input
              type="date"
              defaultValue="2026-06-15"
              className="mt-2 block w-full border-b border-border bg-transparent px-1 py-3 font-heading text-lg font-light min-h-11 focus:border-foreground focus:outline-none"
            />
          </label>
          <label className="block text-left">
            <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              開始時刻
            </span>
            <input
              type="time"
              defaultValue="10:00"
              className="mt-2 block w-full border-b border-border bg-transparent px-1 py-3 font-heading text-lg font-light min-h-11 focus:border-foreground focus:outline-none"
            />
          </label>

          <div className="flex gap-3 pt-6">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="min-h-11 flex-1 border border-border px-6 text-xs uppercase tracking-[0.18em]"
            >
              ← 戻る
            </button>
            <button
              type="button"
              className="min-h-11 flex-1 border border-foreground bg-foreground px-6 text-xs uppercase tracking-[0.18em] text-background"
            >
              次へ →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
