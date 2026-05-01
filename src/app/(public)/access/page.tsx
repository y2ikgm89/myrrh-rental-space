/**
 * /access — アクセスページ（多拠点対応 Editorial layout）
 *
 * 設計方針: Hoshinoya / Aman / Cotton Club Tokyo の調査結果に基づく Vertical Chapter pattern。
 * - 拠点 1+ 件: 各拠点を「章」として縦に展開、上部に anchor index ナビ
 * - 拠点 0 件:  Settings から合成した単一 chapter にフォールバック
 *
 * 参照: docs/research/access-page-patterns.md（NN/g + Baymard + 業界実装調査）
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { Suspense } from "react";
import { connection } from "next/server";
import { Container } from "@/public/components/design-system/container";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { SectionRenderer } from "@/public/components/sections/section-renderer";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import {
  getPublishedLocationsForAccess,
  type LocationForAccess,
} from "@/shared/domain/locations/public-queries";
import { getBusinessInfo } from "@/public/data/business";
import { getAllPublishedLocationsJsonLdData } from "@/public/lib/seo";
import { LocationsLocalBusinessJsonLd } from "@/public/components/seo/json-ld";
import { LocationChapter } from "./_components/location-chapter";
import { LocationsOverview } from "./_components/locations-overview";
import { AccessGlobalInfo } from "./_components/access-global-info";

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  return generatePageMetadata("access");
}

/**
 * Settings からフォールバック用の合成 Location を生成
 * 拠点が DB に登録されていない場合の単一拠点モードで使用。
 */
async function buildFallbackLocation(): Promise<LocationForAccess | null> {
  const info = await getBusinessInfo();
  if (!info.address) return null;

  return {
    id: "fallback",
    slug: "fallback",
    name: info.name || "本拠点",
    description: null,
    address: info.address,
    postalCode: info.postalCode ?? null,
    prefecture: info.prefecture ?? null,
    city: info.city ?? null,
    streetAddress: info.streetAddress ?? null,
    buildingName: info.buildingName ?? null,
    accessLines: [],
    parkingInfo: null,
    amenities: {},
    imageUrl: "", // フォールバック時は画像なし（LocationChapter で条件レンダリング）
    businessHours: info.businessHours,
    specialHolidays: null,
    phoneNumber: info.phone ?? null,
    email: info.email ?? null,
    latitude: null,
    longitude: null,
    googleReviewUrl: null,
    googleBusinessPlaceId: null,
    priceRange: null,
    paymentAccepted: null,
  };
}

/**
 * 拠点リストとアンカー情報を解決（公開拠点 → なければ Settings フォールバック合成）
 * `'use cache'` のおかげで Overview / Chapters の 2 箇所から呼んでも DB アクセスは 1 回。
 */
async function resolveLocations(): Promise<
  ReadonlyArray<{
    anchorId: string;
    index: number;
    location: LocationForAccess;
  }>
> {
  const locations = await getPublishedLocationsForAccess();

  if (locations.length === 0) {
    const fallback = await buildFallbackLocation();
    return fallback
      ? [{ anchorId: "main-location", index: 1, location: fallback }]
      : [];
  }

  return locations.map((loc, i) => ({
    anchorId: loc.slug,
    index: i + 1,
    location: loc,
  }));
}

async function AccessOverview(): Promise<ReactElement> {
  const enriched = await resolveLocations();
  if (enriched.length === 0) return <></>;

  const navItems = enriched.map(({ anchorId, index, location }) => ({
    anchorId,
    index,
    name: location.name,
  }));

  return (
    <ScrollReveal>
      <LocationsOverview
        locations={navItems}
        headline={
          navItems.length > 1
            ? "全拠点のご案内"
            : (navItems[0]?.name ?? "拠点のご案内")
        }
      />
    </ScrollReveal>
  );
}

interface AccessChaptersProps {
  readonly googleMapsUrl: string | null;
}

async function AccessChapters({
  googleMapsUrl,
}: AccessChaptersProps): Promise<ReactElement> {
  const enriched = await resolveLocations();
  if (enriched.length === 0) return <></>;

  return (
    <div className="space-y-20 md:space-y-28">
      {enriched.map(({ anchorId, index, location }, i) => (
        <ScrollReveal key={anchorId} delay={Math.min(0.1 * i, 0.3)}>
          <LocationChapter
            anchorId={anchorId}
            index={index}
            location={location}
            googleMapsUrl={googleMapsUrl}
            showSectionDivider={i > 0}
          />
        </ScrollReveal>
      ))}
    </div>
  );
}

async function AccessChaptersJsonLd(): Promise<ReactElement | null> {
  const locations = await getAllPublishedLocationsJsonLdData();
  return <LocationsLocalBusinessJsonLd locations={locations} />;
}

export default async function AccessPage(): Promise<ReactElement> {
  await connection();

  const sections = await getPageSectionsWithFallback("access");

  const heroSection = sections.find(
    (s) => s.type === "hero" || s.type === "hero-parallax",
  );
  const trailingSections = sections.filter(
    (s) =>
      s !== heroSection &&
      s.type !== "hero" &&
      s.type !== "hero-parallax" &&
      s.type !== "cta",
  );

  return (
    <PageLayout
      variant="content"
      hero={heroSection ? <SectionRenderer section={heroSection} /> : undefined}
      cta={
        <SiteCTA
          label="Contact"
          title="ご不明な点はお気軽にどうぞ"
          buttonText="お問い合わせ"
          buttonHref="/contact"
        />
      }
    >
      {/* Section 1: Overview（拠点ヘッダー + アンカーナビ） */}
      <section className="pt-12 md:pt-20">
        <Container>
          <Suspense fallback={null}>
            <AccessOverview />
          </Suspense>
        </Container>
      </section>

      {/* Section 2: 全社共通 General Info — 高頻度の Contact 等を上層に配置
          chapter divider と同じスタイル（border + pb）で次セクションと視覚的に分離 */}
      <section className="pt-16 md:pt-20">
        <Container>
          <div className="border-b border-border pb-16 md:pb-20">
            <Suspense fallback={null}>
              <AccessGlobalInfo />
            </Suspense>
          </div>
        </Container>
      </section>

      {/* Section 3: 拠点ごとの詳細 chapters
          pb-[var(--space-lg)] で SiteCTA の border-t と視覚的に分離 */}
      <section className="pt-20 pb-[var(--space-lg)] md:pt-28">
        <Container>
          <Suspense fallback={null}>
            <AccessChapters googleMapsUrl={null} />
          </Suspense>
        </Container>
      </section>

      {trailingSections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}

      {/* per-location LocalBusiness JSON-LD（Google 公式 "repeated markup per location" パターン） */}
      <Suspense fallback={null}>
        <AccessChaptersJsonLd />
      </Suspense>
    </PageLayout>
  );
}
