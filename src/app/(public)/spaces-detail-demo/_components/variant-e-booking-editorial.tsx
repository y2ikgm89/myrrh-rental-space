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
 * Variant E: Booking.com pattern × Editorial Magazine brand
 * - B の構造: hero gallery 全幅 + price widget が hero 内右側 (即予約 UX)
 * - C の brand: Kinfolk hairline / serif heading / 余白 / italic / accent bronze
 * - 色合いは warm white / surface / bronze accent (本プロジェクト brand)
 *
 * 即予約志向の Booking.com 構造を Editorial Magazine ブランドで再解釈し、
 * CVR と brand integrity を両立させる試み。
 */
export function VariantEBookingEditorial(): ReactElement {
  const space = DEMO_SPACE;
  return (
    <div className="bg-background">
      {/* Breadcrumb 帯 (editorial style: 中央寄せ uppercase) */}
      <div className="border-b border-divider bg-surface py-3 text-center text-xs uppercase tracking-[0.18em] text-muted-foreground">
        ホーム / スペース一覧 /{" "}
        <span className="text-foreground">{space.name}</span>
      </div>

      {/* Hero header: eyebrow + h1 + hairline + meta (Kinfolk pattern) */}
      <header className="mx-auto max-w-[var(--container-max)] px-6 pt-12 text-center md:px-12 md:pt-16">
        <p className="text-[0.7rem] uppercase tracking-[0.24em] text-accent">
          — Space —
        </p>
        <h1 className="mt-5 font-heading text-4xl font-light leading-tight tracking-tight md:text-5xl">
          {space.name}
        </h1>
        <p className="mx-auto mt-5 max-w-[42ch] font-heading text-base italic text-muted-foreground md:text-lg">
          “{space.descriptionLead}”
        </p>
        <hr
          aria-hidden="true"
          className="mx-auto mt-6 w-12 border-0 border-t border-accent"
        />
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <IconStar
              className="h-3.5 w-3.5 fill-accent text-accent"
              aria-hidden="true"
            />
            <span className="text-foreground">
              {space.reviews.averageRating}
            </span>
            ({space.reviews.totalCount})
          </span>
          <span aria-hidden="true">·</span>
          <span>{space.location}</span>
          <span aria-hidden="true">·</span>
          <span>
            {space.capacity}名 / {space.area}㎡
          </span>
        </div>
      </header>

      {/* Hero: gallery 左 + price widget 右 (B 構造) — editorial 装飾で */}
      <div className="mx-auto mt-12 grid max-w-[var(--container-max)] gap-6 px-6 md:px-12 lg:grid-cols-[1fr_320px] lg:gap-10">
        {/* Gallery: editorial mosaic — gap 大、border-radius なし (sharp edge) */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:grid-rows-2">
          <div className="relative aspect-[4/3] overflow-hidden md:col-span-2 md:row-span-2 md:aspect-auto md:h-[440px]">
            <Image
              src={space.mainImage}
              alt={space.name}
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
          {space.subImages.slice(0, 2).map((img) => (
            <div
              key={img}
              className="relative hidden aspect-[4/3] overflow-hidden md:block md:h-[215px]"
            >
              <Image
                src={img}
                alt={`${space.name} の写真`}
                fill
                sizes="(min-width: 1024px) 17vw, 33vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>

        {/* Price widget — editorial 装飾 (border-y accent + serif typography + 中央寄せ) */}
        <aside className="border-y border-accent bg-background py-6 text-center">
          <p className="text-[0.65rem] uppercase tracking-[0.24em] text-muted-foreground">
            — Reservation —
          </p>
          <p className="mt-3 font-heading text-4xl font-light leading-none text-foreground">
            {formatPrice(space.hourlyPrice)}
            <span className="ml-1 font-sans text-xs text-muted-foreground">
              / h
            </span>
          </p>
          <p className="mt-1 font-heading text-sm font-light italic text-muted-foreground">
            / {formatPrice(space.dailyPrice)} per day
          </p>

          <hr
            aria-hidden="true"
            className="mx-auto my-5 w-8 border-0 border-t border-divider"
          />

          <ul className="space-y-1.5 px-6 text-xs">
            <li className="flex items-baseline justify-between">
              <span className="text-muted-foreground">1 時間</span>
              <span className="font-heading text-base text-foreground">
                {formatPrice(space.hourlyPrice)}
              </span>
            </li>
            <li className="flex items-baseline justify-between">
              <span className="text-muted-foreground">1 日</span>
              <span className="font-heading text-base text-foreground">
                {formatPrice(space.dailyPrice)}
              </span>
            </li>
          </ul>

          <div className="mt-6 space-y-1.5 text-[0.7rem] uppercase tracking-[0.15em] text-accent">
            <p>＋ 即時予約</p>
            <p>＋ 24h 前まで無料キャンセル</p>
            <p>＋ 事前決済不要</p>
          </div>

          <div className="mt-6 space-y-2 px-6">
            <button
              type="button"
              className="inline-flex min-h-12 w-full items-center justify-center border border-foreground bg-foreground px-7 py-3 text-xs uppercase tracking-[0.18em] text-background transition-opacity hover:opacity-90"
            >
              Reserve this space
            </button>
            <button
              type="button"
              className="inline-flex min-h-11 w-full items-center justify-center border border-foreground px-5 py-2.5 text-xs uppercase tracking-[0.18em] text-foreground transition-colors hover:bg-foreground hover:text-background"
            >
              Inquiry
            </button>
          </div>
        </aside>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-[var(--container-max)] px-6 py-16 md:px-12">
        {/* Quick stats — editorial divider style */}
        <section className="border-y border-divider py-6">
          <div className="mx-auto grid max-w-3xl grid-cols-2 gap-6 text-center md:grid-cols-4">
            <div>
              <IconUsers
                className="mx-auto mb-2 h-5 w-5 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="font-heading text-sm font-light text-foreground">
                最大 {space.capacity} 名
              </p>
            </div>
            <div>
              <IconRuler2
                className="mx-auto mb-2 h-5 w-5 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="font-heading text-sm font-light text-foreground">
                {space.area}㎡
              </p>
            </div>
            <div>
              <IconMapPin
                className="mx-auto mb-2 h-5 w-5 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="font-heading text-sm font-light text-foreground">
                {space.location}
              </p>
            </div>
            <div>
              <IconStar
                className="mx-auto mb-2 h-5 w-5 fill-accent text-accent"
                aria-hidden="true"
              />
              <p className="font-heading text-sm font-light text-foreground">
                {space.reviews.averageRating} ({space.reviews.totalCount})
              </p>
            </div>
          </div>
        </section>

        {/* Description with drop-cap */}
        <section className="mx-auto mt-16 max-w-3xl">
          <p className="text-[0.7rem] uppercase tracking-[0.24em] text-accent">
            — About this space —
          </p>
          <h2 className="mt-4 font-heading text-2xl font-light md:text-3xl">
            このスペースについて
          </h2>
          <p className="mt-8 text-base leading-[2] text-foreground first-letter:float-left first-letter:mr-2 first-letter:mt-1 first-letter:font-heading first-letter:text-6xl first-letter:font-light first-letter:leading-none first-letter:text-accent">
            {space.descriptionParagraphs[0]}
          </p>
          {space.descriptionParagraphs.slice(1).map((p) => (
            <p key={p} className="mt-6 text-base leading-[2] text-foreground">
              {p}
            </p>
          ))}
        </section>

        {/* Amenities — centered grid editorial */}
        <section className="mx-auto mt-16 max-w-3xl border-y border-divider py-12">
          <p className="text-center text-[0.7rem] uppercase tracking-[0.24em] text-accent">
            — Amenities —
          </p>
          <h2 className="mt-4 text-center font-heading text-2xl font-light md:text-3xl">
            設備
          </h2>
          <ul className="mt-8 grid grid-cols-2 gap-y-3 text-center font-heading text-base font-light md:grid-cols-4">
            {space.facilities.map((f) => (
              <li key={f.name}>{f.name}</li>
            ))}
          </ul>
        </section>

        {/* Access */}
        <section className="mx-auto mt-16 max-w-3xl">
          <p className="text-[0.7rem] uppercase tracking-[0.24em] text-accent">
            — Access —
          </p>
          <h2 className="mt-4 font-heading text-2xl font-light md:text-3xl">
            アクセス
          </h2>
          <p className="mt-6 text-base text-foreground">{space.addressLine}</p>
          <ol className="mt-4 space-y-2 font-heading text-base font-light leading-relaxed">
            {space.accessLines.map((line) => (
              <li key={line}>・{line}</li>
            ))}
          </ol>
          <p className="mt-6 text-sm italic text-muted-foreground">
            — {space.parkingInfo}
          </p>
        </section>

        {/* Pull-quote review — Kinfolk style */}
        <section className="mx-auto mt-16 max-w-3xl border-y border-divider py-12 text-center">
          <p className="text-[0.7rem] uppercase tracking-[0.24em] text-accent">
            — Voices —
          </p>
          <blockquote className="mt-6 font-heading text-2xl font-light italic leading-[1.6] text-foreground md:text-3xl">
            “{space.reviews.items[0]?.comment}”
          </blockquote>
          <cite className="mt-4 block text-xs uppercase tracking-[0.18em] not-italic text-muted-foreground">
            — {space.reviews.items[0]?.authorName}
          </cite>
        </section>

        {/* Other reviews — minimal list */}
        <section className="mx-auto mt-16 max-w-3xl">
          <p className="text-[0.7rem] uppercase tracking-[0.24em] text-accent">
            — More reviews —
          </p>
          <h2 className="mt-4 font-heading text-2xl font-light md:text-3xl">
            <IconStar
              className="mr-2 inline h-5 w-5 fill-accent text-accent"
              aria-hidden="true"
            />
            {space.reviews.averageRating}{" "}
            <span className="text-sm text-muted-foreground">
              ({space.reviews.totalCount} 件)
            </span>
          </h2>
          <div className="mt-8 space-y-8 divide-y divide-divider">
            {space.reviews.items.slice(1).map((r) => (
              <div key={r.id} className="pt-8 first:pt-0">
                <p className="text-sm font-medium">{r.authorName}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {new Date(r.createdAt).toLocaleDateString("ja-JP")}
                </p>
                <p className="mt-3 text-base leading-relaxed text-foreground">
                  {r.comment}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
