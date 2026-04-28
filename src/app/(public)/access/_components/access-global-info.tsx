/**
 * AccessGlobalInfo — /access ページの全社共通情報セクション
 *
 * **per-location 属性は LocationChapter 側に移譲済み**:
 *   - Parking → Location.parkingInfo
 *   - Amenities → Location.amenities
 *
 * このセクションには「全拠点を貫いて共通な情報」のみ:
 *   - Contact: 電話・メール（代表窓口）
 *   - Google Review: 全社共通レビュー URL
 *
 * schema.org Organization microdata で全社レベル NAP を補完。
 */

import type { ReactElement } from "react";

import { getBusinessInfo } from "@/public/data/business";

export async function AccessGlobalInfo(): Promise<ReactElement> {
  const info = await getBusinessInfo();

  const hasContact = Boolean(info.phone || info.email);

  if (!hasContact) return <></>;

  return (
    <div
      className="space-y-12"
      itemScope
      itemType="https://schema.org/Organization"
    >
      <meta itemProp="name" content={info.name} />

      {/* Section header */}
      <div className="text-center">
        <p className="text-eyebrow uppercase text-muted-foreground">
          Get in Touch
        </p>
        <h2 className="mt-3 font-heading text-[clamp(1.75rem,3.5vw,2.25rem)] font-light italic leading-tight text-foreground">
          代表お問い合わせ
        </h2>
      </div>

      {/* Contact — 電話 + メール 横並び */}
      {hasContact && (
        <dl className="mx-auto grid max-w-3xl gap-8 sm:grid-cols-2 sm:gap-12">
          {info.phone && (
            <div className="text-center">
              <dt className="text-eyebrow uppercase text-muted-foreground">
                電話
              </dt>
              <dd className="mt-3">
                <a
                  itemProp="telephone"
                  href={`tel:${info.phone}`}
                  className="font-heading text-2xl font-light italic text-foreground transition-opacity hover:opacity-60 md:text-3xl"
                >
                  {info.phone}
                </a>
              </dd>
            </div>
          )}

          {info.email && (
            <div className="text-center">
              <dt className="text-eyebrow uppercase text-muted-foreground">
                メール
              </dt>
              <dd className="mt-3 text-sm">
                <a
                  itemProp="email"
                  href={`mailto:${info.email}`}
                  className="break-all border-b border-foreground pb-0.5 text-foreground transition-opacity hover:opacity-60"
                >
                  {info.email}
                </a>
              </dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
