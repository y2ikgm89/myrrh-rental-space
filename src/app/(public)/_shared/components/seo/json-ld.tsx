/**
 * JSON-LD構造化データコンポーネント
 *
 * JSON.stringifyでシリアライズされたデータのみを使用するため、
 * XSSのリスクはありません（HTMLではなくJSONデータ）。
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/metadata#json-ld
 * @see https://developers.google.com/search/docs/appearance/structured-data
 */

/* eslint-disable @eslint-react/dom-no-dangerously-set-innerhtml -- JSON-LD: JSON.stringify-encoded, no raw HTML */
import type { ReactElement } from "react";
import { getBaseUrl, SITE_DEFAULTS } from "@/shared/lib/constants";
import type { OrganizationJsonLdData } from "@/public/lib/seo/json-ld-config";
import type { LocationLocalBusinessJsonLdData } from "@/public/lib/seo/location-json-ld";

const BASE_URL = getBaseUrl();

// =============================================================================
// Types
// =============================================================================

interface ProductData {
  name: string;
  description: string;
  image: string;
  url: string;
  offers: {
    price: number;
    priceCurrency?: string;
    availability?: string;
  };
  aggregateRating?: {
    ratingValue: number;
    reviewCount: number;
    bestRating?: number;
    worstRating?: number;
  };
}

interface ArticleData {
  headline: string;
  description: string;
  image?: string;
  url: string;
  datePublished: string;
  dateModified?: string;
  author?: {
    name: string;
    url?: string;
  };
}

type EventStatusType =
  | "EventScheduled"
  | "EventCancelled"
  | "EventPostponed"
  | "EventRescheduled";

type EventAttendanceModeType =
  | "OfflineEventAttendanceMode"
  | "OnlineEventAttendanceMode"
  | "MixedEventAttendanceMode";

type OfferAvailability =
  | "InStock"
  | "SoldOut"
  | "LimitedAvailability"
  | "PreOrder";

interface EventData {
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
  url: string;
  image?: string;
  eventStatus?: EventStatusType;
  eventAttendanceMode?: EventAttendanceModeType;
  location?: {
    name: string;
    address?: string;
    url?: string;
  };
  offers?: {
    price: number;
    priceCurrency?: string;
    availability?: OfferAvailability;
    url?: string;
  };
  maximumAttendeeCapacity?: number;
  /** 関連エンティティ（関連記事 / 言及される CreativeWork 等）。 */
  mentions?: ReadonlyArray<{
    type: "Article" | "Thing" | "CreativeWork";
    name: string;
    url: string;
  }>;
}

interface BreadcrumbItem {
  name: string;
  url: string;
}

interface FAQItem {
  question: string;
  answer: string;
}

// =============================================================================
// Components
// =============================================================================

interface JsonLdProps {
  data: Record<string, unknown>;
}

/**
 * JSON-LDスクリプトタグを生成
 *
 * セキュリティ: JSON-LDはJSONデータのみを含むため、適切なエスケープにより安全。
 * - JSON.stringifyでシリアライズ
 * - 追加のUnicodeエスケープで < > & をエンコード
 * - U+2028/U+2029 をエスケープしてJavaScript改行問題を回避
 *
 * @see https://redux.js.org/usage/server-rendering#security-considerations
 */
function JsonLd({ data }: JsonLdProps): ReactElement {
  // セキュリティ: HTML/Script特殊文字とJavaScript改行文字をUnicodeエスケープ
  // これによりscriptタグ内でのXSS攻撃を防止
  const safeJsonString = JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonString }}
    />
  );
}

// =============================================================================
// Schema Generators
// =============================================================================

/**
 * Organization 構造化データオブジェクトを構築（@graph 内で使用）
 */
function buildOrganizationData(
  org: OrganizationJsonLdData & { id?: string },
): Record<string, unknown> {
  return {
    "@type": "Organization",
    "@id": org.id ?? org["@id"] ?? `${org.url}/#organization`,
    name: org.name,
    ...(org.description && { description: org.description }),
    url: org.url,
    ...(org.logo && { logo: org.logo }),
    ...(org.telephone && { telephone: org.telephone }),
    ...(org.email && { email: org.email }),
    ...(org.address && {
      address: {
        "@type": "PostalAddress",
        ...org.address,
        addressCountry: org.address.addressCountry ?? "JP",
      },
    }),
    ...(org.sameAs && org.sameAs.length > 0 && { sameAs: org.sameAs }),
    ...(org.foundingDate && { foundingDate: org.foundingDate }),
    ...(org.additionalType && { additionalType: org.additionalType }),
  };
}

/**
 * Organization構造化データ
 */
export function OrganizationJsonLd(org: OrganizationJsonLdData): ReactElement {
  const data = {
    "@context": "https://schema.org",
    ...buildOrganizationData(org),
  };

  return <JsonLd data={data} />;
}

/**
 * @graph パターン: Organization + WebSite を1つの JSON-LD で出力
 * エンティティ間の @id 相互参照でナレッジグラフ理解を向上
 */
export function GraphJsonLd({
  organization,
  webSite,
}: {
  organization: OrganizationJsonLdData;
  webSite: { name: string; description?: string; url?: string };
}): ReactElement {
  const orgId = `${organization.url}/#organization`;
  const websiteId = `${webSite.url || BASE_URL}/#website`;

  const data = {
    "@context": "https://schema.org",
    "@graph": [
      buildOrganizationData({ ...organization, id: orgId }),
      {
        "@type": "WebSite",
        "@id": websiteId,
        name: webSite.name,
        ...(webSite.description && { description: webSite.description }),
        url: webSite.url || BASE_URL,
        publisher: { "@id": orgId },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${webSite.url || BASE_URL}/search?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };

  return <JsonLd data={data} />;
}

/**
 * /access 一覧ページ用 LocalBusiness JSON-LD（複数拠点を 1 script にまとめる）
 */
export function LocationsLocalBusinessJsonLd({
  locations,
}: {
  locations: LocationLocalBusinessJsonLdData[];
}): ReactElement | null {
  if (locations.length === 0) return null;
  const data = {
    "@context": "https://schema.org",
    "@graph": locations.map((loc) => {
      const item: Record<string, unknown> = {
        "@type": "LocalBusiness",
        ...loc,
      };
      if (loc.geo) {
        item["geo"] = {
          "@type": "GeoCoordinates",
          latitude: loc.geo.latitude,
          longitude: loc.geo.longitude,
        };
      }
      return item;
    }),
  };
  return <JsonLd data={data} />;
}

/**
 * Product構造化データ（スペース詳細ページ向け）
 *
 * Google リッチリザルト対応:
 * - offers: 必須（price + priceCurrency）
 * - aggregateRating: レビュー1件以上で出力（星評価リッチリザルト）
 *
 * @see https://developers.google.com/search/docs/appearance/structured-data/product
 */
export function ProductJsonLd({
  name,
  description,
  image,
  url,
  offers,
  aggregateRating,
}: ProductData): ReactElement {
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description,
    image,
    url,
    offers: {
      "@type": "Offer",
      price: offers.price,
      priceCurrency: offers.priceCurrency || "JPY",
      availability: offers.availability || "https://schema.org/InStock",
    },
    ...(aggregateRating &&
      aggregateRating.reviewCount > 0 && {
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: aggregateRating.ratingValue,
          reviewCount: aggregateRating.reviewCount,
          bestRating: aggregateRating.bestRating ?? 5,
          worstRating: aggregateRating.worstRating ?? 1,
        },
      }),
  };

  return <JsonLd data={data} />;
}

/**
 * Article構造化データ（ブログ記事向け）
 */
export function ArticleJsonLd({
  headline,
  description,
  image,
  url,
  datePublished,
  dateModified,
  author,
}: ArticleData): ReactElement {
  const data = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline,
    description,
    ...(image && { image }),
    url,
    datePublished,
    dateModified: dateModified || datePublished,
    ...(author && {
      author: {
        "@type": "Person",
        name: author.name,
        ...(author.url && { url: author.url }),
      },
    }),
    publisher: {
      "@type": "Organization",
      name: SITE_DEFAULTS.name,
      url: BASE_URL,
    },
  };

  return <JsonLd data={data} />;
}

/**
 * Event構造化データ（イベント詳細ページ向け）
 *
 * Google リッチリザルト対応:
 * - name / startDate / location: 必須
 * - eventStatus / eventAttendanceMode: 推奨（ハイブリッド/中止表示対応）
 * - offers: price + priceCurrency で参加費リッチリザルト
 *
 * @see https://schema.org/Event
 * @see https://developers.google.com/search/docs/appearance/structured-data/event
 */
export function EventJsonLd({
  name,
  description,
  startDate,
  endDate,
  url,
  image,
  eventStatus = "EventScheduled",
  eventAttendanceMode = "OfflineEventAttendanceMode",
  location,
  offers,
  maximumAttendeeCapacity,
  mentions,
}: EventData): ReactElement {
  const data = {
    "@context": "https://schema.org",
    "@type": "Event",
    name,
    ...(description && { description }),
    startDate,
    endDate,
    url,
    ...(image && { image }),
    eventStatus: `https://schema.org/${eventStatus}`,
    eventAttendanceMode: `https://schema.org/${eventAttendanceMode}`,
    ...(location && {
      location: {
        "@type": "Place",
        name: location.name,
        ...(location.address && {
          address: {
            "@type": "PostalAddress",
            streetAddress: location.address,
            addressCountry: "JP",
          },
        }),
        ...(location.url && { url: location.url }),
      },
    }),
    ...(offers && {
      offers: {
        "@type": "Offer",
        price: offers.price,
        priceCurrency: offers.priceCurrency || "JPY",
        availability: `https://schema.org/${offers.availability || "InStock"}`,
        ...(offers.url && { url: offers.url }),
        validFrom: startDate,
      },
    }),
    ...(maximumAttendeeCapacity !== undefined && { maximumAttendeeCapacity }),
    ...(mentions &&
      mentions.length > 0 && {
        mentions: mentions.map((m) => ({
          "@type": m.type,
          name: m.name,
          url: m.url,
        })),
      }),
    organizer: {
      "@type": "Organization",
      name: SITE_DEFAULTS.name,
      url: BASE_URL,
    },
  };

  return <JsonLd data={data} />;
}

/**
 * NewsArticle構造化データ（ニュース記事向け）
 */
export function NewsArticleJsonLd({
  headline,
  description,
  image,
  url,
  datePublished,
  dateModified,
}: Omit<ArticleData, "author">): ReactElement {
  const data = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline,
    description,
    ...(image && { image }),
    url,
    datePublished,
    dateModified: dateModified || datePublished,
    publisher: {
      "@type": "Organization",
      name: SITE_DEFAULTS.name,
      url: BASE_URL,
    },
  };

  return <JsonLd data={data} />;
}

/**
 * BreadcrumbList構造化データ
 */
export function BreadcrumbJsonLd({
  items,
}: {
  items: BreadcrumbItem[];
}): ReactElement {
  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url.startsWith("http") ? item.url : `${BASE_URL}${item.url}`,
    })),
  };

  return <JsonLd data={data} />;
}

/**
 * FAQPage構造化データ
 */
export function FAQPageJsonLd({ items }: { items: FAQItem[] }): ReactElement {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  return <JsonLd data={data} />;
}

/**
 * WebSite構造化データ（サイト全体）
 */
export function WebSiteJsonLd({
  name,
  description,
  url = BASE_URL,
}: {
  name: string;
  description?: string;
  url?: string;
}): ReactElement {
  const data = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name,
    ...(description && { description }),
    url,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${url}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return <JsonLd data={data} />;
}
