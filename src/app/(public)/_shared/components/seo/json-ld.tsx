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
import { getBaseUrl } from "@/shared/lib/constants";
import { escapeJsonForScriptTag } from "@/shared/lib/json-ld-escape";
import type { OrganizationJsonLdData } from "@/public/lib/seo/json-ld-config";
import type { LocationLocalBusinessJsonLdData } from "@/public/lib/seo/location-json-ld";

// =============================================================================
// Types
// =============================================================================

/** UN/CEFACT common code for hour — hourly rental rate. */
const UNIT_CODE_HOUR = "HUR";

interface ProductData {
  name: string;
  description: string;
  image: string;
  url: string;
  /** Hourly rate; emitted as UnitPriceSpecification (unitCode HUR), not a one-shot Offer.price. */
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

interface ArticlePublisher {
  name: string;
  url?: string;
}

interface ArticleData {
  headline: string;
  description: string;
  image?: string;
  url: string;
  datePublished: string;
  dateModified?: string;
  /** Required — Settings businessName/siteName (not SITE_DEFAULTS). */
  publisherName: string;
  publisherUrl?: string;
  author?: {
    name: string;
    url?: string;
  };
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
  const safeJsonString = escapeJsonForScriptTag(JSON.stringify(data));

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
    ...(org.alternateName && { alternateName: org.alternateName }),
    ...(org.description && { description: org.description }),
    url: org.url,
    ...(org.logo && { logo: org.logo }),
    ...(org.telephone && { telephone: org.telephone }),
    ...(org.faxNumber && { faxNumber: org.faxNumber }),
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
  const baseUrl = getBaseUrl();
  const orgId = `${organization.url}/#organization`;
  const websiteId = `${webSite.url || baseUrl}/#website`;

  const data = {
    "@context": "https://schema.org",
    "@graph": [
      buildOrganizationData({ ...organization, id: orgId }),
      {
        "@type": "WebSite",
        "@id": websiteId,
        name: webSite.name,
        ...(webSite.description && { description: webSite.description }),
        url: webSite.url || baseUrl,
        publisher: { "@id": orgId },
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
 * - offers.priceSpecification: 時間単価（UnitPriceSpecification + unitCode HUR）
 * - aggregateRating: レビュー1件以上で出力（星評価リッチリザルト）
 *
 * 時間貸しのため bare Offer.price（一括購入価格）は使わない。
 *
 * @see https://developers.google.com/search/docs/appearance/structured-data/product
 * @see https://schema.org/UnitPriceSpecification
 */
export function ProductJsonLd({
  name,
  description,
  image,
  url,
  offers,
  aggregateRating,
}: ProductData): ReactElement {
  const priceCurrency = offers.priceCurrency || "JPY";
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description,
    image,
    url,
    offers: {
      "@type": "Offer",
      priceCurrency,
      availability: offers.availability || "https://schema.org/InStock",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: offers.price,
        priceCurrency,
        unitCode: UNIT_CODE_HOUR,
      },
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

function buildPublisher(publisher: ArticlePublisher): Record<string, unknown> {
  return {
    "@type": "Organization",
    name: publisher.name,
    ...(publisher.url && { url: publisher.url }),
  };
}

/**
 * Article構造化データ（ブログ記事向け）
 *
 * publisher は Settings（businessName / siteName）由来を必須 props で受け取る。
 * SITE_DEFAULTS への暗黙フォールバックはしない（call site 側で解決）。
 */
export function ArticleJsonLd({
  headline,
  description,
  image,
  url,
  datePublished,
  dateModified,
  publisherName,
  publisherUrl,
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
    publisher: buildPublisher({
      name: publisherName,
      ...(publisherUrl !== undefined && { url: publisherUrl }),
    }),
  };

  return <JsonLd data={data} />;
}

/**
 * NewsArticle構造化データ（ニュース記事向け）
 *
 * publisher は Settings（businessName / siteName）由来を必須 props で受け取る。
 */
export function NewsArticleJsonLd({
  headline,
  description,
  image,
  url,
  datePublished,
  dateModified,
  publisherName,
  publisherUrl,
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
    publisher: buildPublisher({
      name: publisherName,
      ...(publisherUrl !== undefined && { url: publisherUrl }),
    }),
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
  const baseUrl = getBaseUrl();
  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url.startsWith("http") ? item.url : `${baseUrl}${item.url}`,
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
 *
 * 通常は root layout の GraphJsonLd が Organization + WebSite を発行する。
 * 単独 WebSite が必要な場合のみ利用する（home では重複させない）。
 */
export function WebSiteJsonLd({
  name,
  description,
  url,
}: {
  name: string;
  description?: string;
  url?: string;
}): ReactElement {
  const resolvedUrl = url ?? getBaseUrl();
  const data = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name,
    ...(description && { description }),
    url: resolvedUrl,
  };

  return <JsonLd data={data} />;
}
