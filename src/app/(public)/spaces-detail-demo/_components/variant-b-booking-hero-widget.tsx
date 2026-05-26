import type { ReactElement } from "react";
import Image from "next/image";
import {
  IconStar,
  IconUsers,
  IconRuler2,
  IconCheck,
} from "@tabler/icons-react";
import { DEMO_SPACE, formatPrice } from "./_data";

/**
 * Variant B: Booking.com Hero + Side Widget
 * - Hero: gallery full-width + price widget が hero 同行右側にすぐ表示
 * - Body: features / amenities / map 縦並び
 */
export function VariantBBookingHeroWidget(): ReactElement {
  const space = DEMO_SPACE;
  return (
    <div className="bg-background">
      {/* Breadcrumb + Title */}
      <header className="border-b border-divider bg-surface px-6 py-6 md:px-12">
        <nav
          aria-label="パンくずリスト"
          className="mb-3 text-xs text-muted-foreground"
        >
          <a href="#">ホーム</a> / <a href="#">スペース一覧</a> /{" "}
          <span className="text-foreground">{space.name}</span>
        </nav>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-light tracking-tight md:text-4xl">
              {space.name}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {space.location} · {space.addressLine}
            </p>
          </div>
          <div className="flex items-center gap-2 bg-foreground px-4 py-2 text-background">
            <IconStar
              className="h-4 w-4 fill-background text-background"
              aria-hidden="true"
            />
            <span className="text-base font-bold">
              {space.reviews.averageRating}
            </span>
            <span className="text-xs">({space.reviews.totalCount}件)</span>
          </div>
        </div>
      </header>

      {/* Hero: gallery 左 + price widget 右 (Booking.com pattern) */}
      <div className="grid gap-4 px-6 py-6 md:px-12 lg:grid-cols-[1fr_360px] lg:gap-6">
        {/* Gallery: main + 3 sub grid */}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 lg:grid-rows-2">
          <div className="relative col-span-2 row-span-2 aspect-[4/3] overflow-hidden lg:col-span-2 lg:aspect-auto">
            <Image
              src={space.mainImage}
              alt={space.name}
              fill
              sizes="(min-width: 1024px) 40vw, 100vw"
              className="object-cover"
            />
          </div>
          {space.subImages.slice(0, 2).map((img) => (
            <div
              key={img}
              className="relative aspect-[4/3] overflow-hidden lg:aspect-auto"
            >
              <Image
                src={img}
                alt={`${space.name} の写真`}
                fill
                sizes="(min-width: 1024px) 20vw, 50vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>

        {/* Price widget hero 同行右 */}
        <aside className="border-2 border-accent bg-background p-5">
          <div className="mb-1 text-xs uppercase tracking-[0.18em] text-accent">
            お得な料金
          </div>
          <div className="mb-4 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-foreground">
              {formatPrice(space.hourlyPrice)}
            </span>
            <span className="text-sm text-muted-foreground">/ 時間〜</span>
          </div>
          <ul className="mb-4 space-y-2 text-sm">
            <li className="flex items-baseline justify-between border-b border-divider pb-2">
              <span className="text-muted-foreground">1 時間</span>
              <span className="font-medium text-foreground">
                {formatPrice(space.hourlyPrice)}
              </span>
            </li>
            <li className="flex items-baseline justify-between border-b border-divider pb-2">
              <span className="text-muted-foreground">1 日</span>
              <span className="font-medium text-foreground">
                {formatPrice(space.dailyPrice)}
              </span>
            </li>
          </ul>
          <div className="mb-4 space-y-1.5 text-xs text-success">
            <p className="flex items-center gap-1">
              <IconCheck className="h-3.5 w-3.5" aria-hidden="true" />
              即時予約可能
            </p>
            <p className="flex items-center gap-1">
              <IconCheck className="h-3.5 w-3.5" aria-hidden="true" />
              無料キャンセル (24h 前まで)
            </p>
            <p className="flex items-center gap-1">
              <IconCheck className="h-3.5 w-3.5" aria-hidden="true" />
              事前決済不要
            </p>
          </div>
          <button
            type="button"
            className="mb-2 w-full min-h-12 bg-accent px-6 py-3 text-base font-bold text-accent-foreground transition-opacity hover:opacity-90"
          >
            今すぐ予約
          </button>
          <button
            type="button"
            className="w-full min-h-11 border border-foreground px-6 py-2.5 text-sm text-foreground transition-colors hover:bg-surface"
          >
            空き状況を確認
          </button>
        </aside>
      </div>

      {/* Body */}
      <div className="space-y-10 px-6 pb-12 md:px-12">
        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-4 border-y border-divider py-6 md:grid-cols-4">
          <div className="flex items-center gap-2">
            <IconUsers
              className="h-5 w-5 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="text-sm">最大 {space.capacity} 名</span>
          </div>
          <div className="flex items-center gap-2">
            <IconRuler2
              className="h-5 w-5 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="text-sm">{space.area}㎡</span>
          </div>
          <div className="flex items-center gap-2">
            <IconCheck className="h-5 w-5 text-success" aria-hidden="true" />
            <span className="text-sm">Wi-Fi 完備</span>
          </div>
          <div className="flex items-center gap-2">
            <IconCheck className="h-5 w-5 text-success" aria-hidden="true" />
            <span className="text-sm">即時予約</span>
          </div>
        </div>

        {/* Description */}
        <section>
          <h2 className="mb-4 text-xl font-bold">スペースの説明</h2>
          <p className="mb-3 text-sm text-foreground">
            {space.descriptionLead}
          </p>
          {space.descriptionParagraphs.slice(0, 2).map((p) => (
            <p
              key={p}
              className="mb-3 text-sm leading-relaxed text-muted-foreground"
            >
              {p}
            </p>
          ))}
        </section>

        {/* Amenities table */}
        <section>
          <h2 className="mb-4 text-xl font-bold">設備・アメニティ</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {space.facilities.map((f) => (
              <div
                key={f.name}
                className="flex items-center gap-2 text-sm text-foreground"
              >
                <IconCheck
                  className="h-4 w-4 text-success"
                  aria-hidden="true"
                />
                {f.name}
              </div>
            ))}
          </div>
        </section>

        {/* Access */}
        <section className="border-t border-divider pt-8">
          <h2 className="mb-4 text-xl font-bold">アクセス</h2>
          <ul className="space-y-1.5 text-sm text-foreground">
            {space.accessLines.map((line) => (
              <li key={line}>・{line}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
