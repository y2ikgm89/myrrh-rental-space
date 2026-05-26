"use client";

import { useState, type ReactElement } from "react";
import Image from "next/image";
import {
  IconStar,
  IconUsers,
  IconRuler2,
  IconMapPin,
  IconCheck,
} from "@tabler/icons-react";
import { cn } from "@/shared/lib/cn";
import { DEMO_SPACE, formatPrice } from "./_data";

const TABS = [
  { id: "overview", label: "概要" },
  { id: "facilities", label: "設備" },
  { id: "access", label: "アクセス" },
  { id: "reviews", label: "口コミ" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/**
 * Variant D: Tab Navigation (Spacemarket / インスタベース風)
 * - Cover + price widget 同行
 * - Tab で「概要 / 設備 / アクセス / 口コミ」切替
 */
export function VariantDTabNavigation(): ReactElement {
  const space = DEMO_SPACE;
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  return (
    <div className="bg-background">
      {/* Breadcrumb + Title */}
      <header className="border-b border-divider px-6 py-4 md:px-12">
        <nav
          aria-label="パンくずリスト"
          className="mb-2 text-xs text-muted-foreground"
        >
          <a href="#">ホーム</a> / <a href="#">スペース一覧</a> /{" "}
          <span className="text-foreground">{space.name}</span>
        </nav>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          {space.name}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <IconStar
              className="h-4 w-4 fill-accent text-accent"
              aria-hidden="true"
            />
            <span className="font-bold text-foreground">
              {space.reviews.averageRating}
            </span>
            <span>({space.reviews.totalCount})</span>
          </span>
          <span aria-hidden="true">·</span>
          <span className="flex items-center gap-1">
            <IconMapPin className="h-3.5 w-3.5" aria-hidden="true" />
            {space.location}
          </span>
          <span aria-hidden="true">·</span>
          <span className="flex items-center gap-1">
            <IconUsers className="h-3.5 w-3.5" aria-hidden="true" />
            最大{space.capacity}名
          </span>
          <span aria-hidden="true">·</span>
          <span className="flex items-center gap-1">
            <IconRuler2 className="h-3.5 w-3.5" aria-hidden="true" />
            {space.area}㎡
          </span>
        </div>
      </header>

      {/* Cover + sticky widget */}
      <div className="grid gap-6 px-6 py-6 md:px-12 lg:grid-cols-[1fr_320px]">
        {/* Cover image */}
        <div className="relative aspect-[16/9] overflow-hidden rounded-lg">
          <Image
            src={space.mainImage}
            alt={space.name}
            fill
            sizes="(min-width: 1024px) 60vw, 100vw"
            className="object-cover"
          />
        </div>

        {/* Sticky pricing widget */}
        <aside className="border border-border bg-surface p-5">
          <div className="mb-3 flex items-baseline gap-1">
            <span className="text-2xl font-bold">
              {formatPrice(space.hourlyPrice)}
            </span>
            <span className="text-xs text-muted-foreground">/時間〜</span>
          </div>
          <ul className="mb-4 space-y-1.5 text-sm">
            <li className="flex justify-between">
              <span className="text-muted-foreground">時間料金</span>
              <span>{formatPrice(space.hourlyPrice)}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted-foreground">1日料金</span>
              <span>{formatPrice(space.dailyPrice)}</span>
            </li>
          </ul>
          <button
            type="button"
            className="mb-2 w-full min-h-12 bg-accent px-4 py-3 text-sm font-bold text-accent-foreground"
          >
            予約に進む
          </button>
          <button
            type="button"
            className="w-full min-h-11 border border-border px-4 py-2 text-xs text-foreground hover:bg-background"
          >
            お問い合わせ
          </button>
        </aside>
      </div>

      {/* Tabs (sticky) */}
      <div
        role="tablist"
        aria-label="スペース詳細"
        className="sticky top-0 z-10 flex border-y border-border bg-background px-6 md:px-12"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            id={`tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "min-h-11 border-b-2 px-4 py-3 text-sm transition-colors",
              activeTab === tab.id
                ? "border-accent font-bold text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div className="px-6 py-8 md:px-12 lg:max-w-3xl">
        {activeTab === "overview" ? (
          <div
            role="tabpanel"
            id="tabpanel-overview"
            aria-labelledby="tab-overview"
            className="space-y-4"
          >
            <h2 className="text-lg font-bold">スペースについて</h2>
            <p className="text-base text-foreground">{space.descriptionLead}</p>
            {space.descriptionParagraphs.map((p) => (
              <p
                key={p}
                className="text-sm leading-relaxed text-muted-foreground"
              >
                {p}
              </p>
            ))}
          </div>
        ) : null}

        {activeTab === "facilities" ? (
          <div
            role="tabpanel"
            id="tabpanel-facilities"
            aria-labelledby="tab-facilities"
          >
            <h2 className="mb-6 text-lg font-bold">設備・備品</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {space.facilities.map((f) => (
                <div
                  key={f.name}
                  className="flex items-center gap-2 border border-border bg-background px-4 py-3 text-sm"
                >
                  <IconCheck
                    className="h-4 w-4 text-success"
                    aria-hidden="true"
                  />
                  {f.name}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {activeTab === "access" ? (
          <div
            role="tabpanel"
            id="tabpanel-access"
            aria-labelledby="tab-access"
            className="space-y-6"
          >
            <h2 className="text-lg font-bold">アクセス</h2>
            <div>
              <p className="mb-3 text-sm font-bold">{space.addressLine}</p>
              <ul className="space-y-2 text-sm text-foreground">
                {space.accessLines.map((line) => (
                  <li key={line}>・{line}</li>
                ))}
              </ul>
            </div>
            <div className="border-t border-divider pt-6">
              <p className="mb-2 text-sm font-bold">駐車場</p>
              <p className="text-sm text-muted-foreground">
                {space.parkingInfo}
              </p>
            </div>
            <div className="aspect-[16/9] w-full bg-muted text-center text-sm text-muted-foreground">
              <div className="flex h-full items-center justify-center">
                Map placeholder
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === "reviews" ? (
          <div
            role="tabpanel"
            id="tabpanel-reviews"
            aria-labelledby="tab-reviews"
          >
            <div className="mb-6 flex items-baseline gap-3 border-b border-divider pb-4">
              <span className="flex items-center gap-1">
                <IconStar
                  className="h-5 w-5 fill-accent text-accent"
                  aria-hidden="true"
                />
                <span className="text-2xl font-bold">
                  {space.reviews.averageRating}
                </span>
              </span>
              <span className="text-sm text-muted-foreground">
                {space.reviews.totalCount} 件のレビュー
              </span>
            </div>
            <div className="space-y-5">
              {space.reviews.items.map((r) => (
                <div
                  key={r.id}
                  className="border-b border-divider pb-5 last:border-b-0"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold">{r.authorName}</p>
                    <div className="flex">
                      {Array.from({ length: r.rating }, (_, i) => (
                        <IconStar
                          key={`${r.id}-star-${i}`}
                          className="h-3.5 w-3.5 fill-accent text-accent"
                          aria-hidden="true"
                        />
                      ))}
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-foreground">{r.comment}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString("ja-JP")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
