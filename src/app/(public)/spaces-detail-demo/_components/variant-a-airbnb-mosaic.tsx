import type { ReactElement } from "react";
import Image from "next/image";
import {
  IconStar,
  IconUsers,
  IconRuler2,
  IconMapPin,
} from "@tabler/icons-react";
import { DEMO_SPACE, formatPrice } from "./_data";

/**
 * Variant A: Airbnb-style Photo Mosaic
 * - Hero: 4-grid mosaic gallery (main + 3 sub) full-width
 * - Body: description / amenities / location 縦長 scroll
 * - Sticky: pricing widget 右
 */
export function VariantAAirbnbMosaic(): ReactElement {
  const space = DEMO_SPACE;
  return (
    <div className="bg-background">
      {/* Breadcrumb */}
      <nav
        aria-label="パンくずリスト"
        className="border-b border-divider px-6 py-3 text-xs text-muted-foreground"
      >
        <a href="#" className="hover:text-foreground">
          ホーム
        </a>{" "}
        / <a href="#">スペース一覧</a> /{" "}
        <span className="text-foreground">{space.name}</span>
      </nav>

      {/* Title + meta */}
      <header className="px-6 pt-6 md:px-12">
        <h1 className="font-heading text-3xl font-light tracking-tight md:text-4xl">
          {space.name}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <IconStar
              className="h-4 w-4 fill-accent text-accent"
              aria-hidden="true"
            />
            <span className="text-foreground">
              {space.reviews.averageRating}
            </span>
            <span>({space.reviews.totalCount}件)</span>
          </span>
          <span aria-hidden="true">·</span>
          <span>{space.location}</span>
          <span aria-hidden="true">·</span>
          <span>{space.addressLine}</span>
        </div>
      </header>

      {/* Photo mosaic: main + 3 sub */}
      <div className="mt-6 grid grid-cols-1 gap-2 px-6 md:grid-cols-[2fr_1fr_1fr] md:px-12">
        <div className="relative aspect-[4/3] overflow-hidden rounded-lg md:row-span-2 md:aspect-auto md:h-[460px]">
          <Image
            src={space.mainImage}
            alt={space.name}
            fill
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover"
          />
        </div>
        {space.subImages.slice(0, 2).map((img) => (
          <div
            key={img}
            className="relative hidden aspect-[3/2] overflow-hidden rounded-lg md:block md:h-[226px]"
          >
            <Image
              src={img}
              alt={`${space.name} の写真`}
              fill
              sizes="25vw"
              className="object-cover"
            />
          </div>
        ))}
      </div>

      {/* Body 2-col + sticky */}
      <div className="grid gap-10 px-6 py-12 md:px-12 lg:grid-cols-[1fr_360px] lg:gap-16">
        <div className="space-y-12">
          {/* Meta highlights */}
          <div className="border-b border-divider pb-8">
            <h2 className="font-heading text-2xl font-light">スペースの概要</h2>
            <div className="mt-6 grid grid-cols-3 gap-4 text-sm">
              <div>
                <IconUsers
                  className="mb-2 h-5 w-5 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="text-foreground">最大{space.capacity}名</p>
              </div>
              <div>
                <IconRuler2
                  className="mb-2 h-5 w-5 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="text-foreground">{space.area}㎡</p>
              </div>
              <div>
                <IconMapPin
                  className="mb-2 h-5 w-5 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="text-foreground">{space.location}</p>
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <h2 className="mb-4 font-heading text-2xl font-light">
              このスペースについて
            </h2>
            <p className="mb-4 text-base leading-relaxed text-foreground">
              {space.descriptionLead}
            </p>
            {space.descriptionParagraphs.map((p) => (
              <p
                key={p}
                className="mb-4 text-sm leading-[1.9] text-muted-foreground"
              >
                {p}
              </p>
            ))}
          </div>

          {/* Amenities */}
          <div className="border-t border-divider pt-12">
            <h2 className="mb-6 font-heading text-2xl font-light">設備</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {space.facilities.map((f) => (
                <div
                  key={f.name}
                  className="flex items-center gap-3 border border-border px-4 py-3 text-sm"
                >
                  <span className="h-2 w-2 rounded-full bg-accent" />
                  {f.name}
                </div>
              ))}
            </div>
          </div>

          {/* Access */}
          <div className="border-t border-divider pt-12">
            <h2 className="mb-6 font-heading text-2xl font-light">アクセス</h2>
            <ol className="space-y-2 text-sm text-muted-foreground">
              {space.accessLines.map((line) => (
                <li key={line}>・{line}</li>
              ))}
            </ol>
            <p className="mt-4 text-sm text-muted-foreground">
              <strong className="text-foreground">駐車場:</strong>{" "}
              {space.parkingInfo}
            </p>
          </div>

          {/* Reviews */}
          <div className="border-t border-divider pt-12">
            <div className="mb-6 flex items-baseline gap-3">
              <h2 className="font-heading text-2xl font-light">
                <IconStar
                  className="mr-2 inline h-5 w-5 fill-accent text-accent"
                  aria-hidden="true"
                />
                {space.reviews.averageRating}
              </h2>
              <span className="text-sm text-muted-foreground">
                {space.reviews.totalCount} 件のレビュー
              </span>
            </div>
            <div className="space-y-6">
              {space.reviews.items.map((r) => (
                <div key={r.id}>
                  <p className="text-sm font-medium">{r.authorName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString("ja-JP")}
                  </p>
                  <p className="mt-2 text-sm text-foreground">{r.comment}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sticky pricing widget */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="border border-border bg-background p-6 shadow-sm">
            <div className="mb-4 flex items-baseline gap-1">
              <span className="text-2xl font-bold">
                {formatPrice(space.hourlyPrice)}
              </span>
              <span className="text-sm text-muted-foreground">/ 時間</span>
            </div>
            <div className="mb-6 space-y-2 text-sm text-muted-foreground">
              <div className="flex justify-between">
                <span>1 時間</span>
                <span className="text-foreground">
                  {formatPrice(space.hourlyPrice)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>1 日</span>
                <span className="text-foreground">
                  {formatPrice(space.dailyPrice)}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="mb-3 w-full min-h-12 bg-foreground px-6 py-3 text-base text-background transition-opacity hover:opacity-90"
            >
              予約する
            </button>
            <button
              type="button"
              className="w-full min-h-11 border border-border px-6 py-2.5 text-sm text-foreground transition-colors hover:bg-surface"
            >
              お問い合わせ
            </button>
            <p className="mt-4 text-xs text-muted-foreground">
              ※ 予約はまだ確定しません
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
