"use client";

import { useState, type ReactElement } from "react";
import Image from "next/image";
import { IconCheck } from "@tabler/icons-react";
import { cn } from "@/shared/lib/cn";
import { DEMO_SPACES, DEMO_TIME_SLOTS, formatPrice } from "./_data";

/**
 * Variant F: Marketplace Split
 *
 * 左カラム: スペース一覧 / 右カラム: 選択中スペース詳細 + 予約フォーム。
 * Airbnb listing / Spacemarket detail の業界標準 UX。
 */
export function VariantFMarketplaceSplit(): ReactElement {
  const [selectedId, setSelectedId] = useState<string>(
    DEMO_SPACES[0]?.id ?? "",
  );
  const [time, setTime] = useState<string | null>(null);
  const selected = DEMO_SPACES.find((s) => s.id === selectedId);

  return (
    <div className="@container grid grid-cols-1 gap-0 @md:grid-cols-[260px_1fr] @md:divide-x @md:divide-divider">
      {/* Left: space list */}
      <aside>
        <div className="border-b border-border p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Spaces
          </p>
          <h3 className="mt-1 font-heading text-base font-light tracking-tight">
            スペース一覧
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {DEMO_SPACES.length} 件
          </p>
        </div>
        <div className="divide-y divide-divider">
          {DEMO_SPACES.map((space) => {
            const isActive = space.id === selectedId;
            return (
              <button
                type="button"
                key={space.id}
                onClick={() => setSelectedId(space.id)}
                className={cn(
                  "flex w-full items-stretch gap-3 p-3 text-left transition-colors min-h-11",
                  isActive ? "bg-accent/5" : "hover:bg-surface",
                )}
              >
                <div className="relative aspect-square h-20 shrink-0 overflow-hidden bg-surface">
                  <Image
                    src={space.imageUrl}
                    alt={space.name}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1 py-1">
                  <p className="font-heading text-sm font-light">
                    {space.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    定員{space.capacity}名
                  </p>
                  <p className="mt-1 text-sm font-light text-accent">
                    {formatPrice(space.hourlyPrice)}
                    <span className="text-xs text-muted-foreground"> / h</span>
                  </p>
                </div>
                {isActive ? (
                  <IconCheck
                    className="h-4 w-4 shrink-0 self-center text-accent"
                    aria-hidden="true"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </aside>

      {/* Right: detail + booking */}
      <div>
        {selected ? (
          <>
            <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface">
              <Image
                src={selected.imageUrl}
                alt={selected.name}
                fill
                sizes="(max-width: 768px) 100vw, 60vw"
                className="object-cover"
              />
            </div>
            <div className="p-6 @md:p-8">
              <p className="text-xs uppercase tracking-[0.18em] text-accent">
                Selected
              </p>
              <h3 className="mt-2 font-heading text-2xl font-light tracking-tight">
                {selected.name}
              </h3>
              <p className="mt-1 text-sm italic text-muted-foreground">
                {selected.tagline}
              </p>

              <dl className="mt-6 grid grid-cols-3 gap-4 border-y border-divider py-5 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
                    定員
                  </dt>
                  <dd className="mt-1 font-heading text-lg font-light">
                    {selected.capacity} 名
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
                    広さ
                  </dt>
                  <dd className="mt-1 font-heading text-lg font-light">
                    {selected.area} ㎡
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
                    料金
                  </dt>
                  <dd className="mt-1 font-heading text-lg font-light text-accent">
                    {formatPrice(selected.hourlyPrice)}
                  </dd>
                </div>
              </dl>

              <p className="mt-6 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Facilities
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {selected.facilities.map((f) => (
                  <li
                    key={f}
                    className="border border-border px-3 py-1 text-xs text-muted-foreground"
                  >
                    {f}
                  </li>
                ))}
              </ul>

              <div className="mt-8 border border-border bg-surface p-5">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Book this space
                </p>
                <div className="mt-4 grid grid-cols-1 gap-4 @md:grid-cols-2">
                  <label className="block">
                    <span className="text-xs text-muted-foreground">日付</span>
                    <input
                      type="date"
                      defaultValue="2026-06-15"
                      className="mt-1 block w-full border border-border bg-background px-3 py-2 text-sm min-h-11"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-muted-foreground">
                      開始時刻
                    </span>
                    <select
                      value={time ?? ""}
                      onChange={(e) => setTime(e.target.value || null)}
                      className="mt-1 block w-full border border-border bg-background px-3 py-2 text-sm min-h-11"
                    >
                      <option value="">選択</option>
                      {DEMO_TIME_SLOTS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button
                  type="button"
                  className="mt-5 w-full min-h-11 border border-foreground bg-foreground text-sm uppercase tracking-[0.18em] text-background"
                >
                  予約に進む
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center p-12 text-sm text-muted-foreground">
            スペースを選択してください
          </div>
        )}
      </div>
    </div>
  );
}
