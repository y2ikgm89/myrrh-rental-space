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

const BASE_URL = getBaseUrl();

// =============================================================================
// Types
// =============================================================================

interface OrganizationData {
  name: string;
  description?: string;
  url?: string;
  logo?: string;
  telephone?: string;
  email?: string;
  address?: {
    streetAddress?: string;
    addressLocality?: string;
    addressRegion?: string;
    postalCode?: string;
    addressCountry?: string;
  };
  sameAs?: string[];
}

interface OpeningHoursSpecification {
  "@type": "OpeningHoursSpecification";
  dayOfWeek: string | string[];
  opens: string;
  closes: string;
}

interface AmenityFeature {
  "@type": "LocationFeatureSpecification";
  name: string;
  value: boolean;
}

interface SpecialOpeningHoursSpecification {
  "@type": "OpeningHoursSpecification";
  validFrom: string;
  validThrough: string;
  opens: string;
  closes: string;
}

interface LocalBusinessData extends OrganizationData {
  openingHoursSpecification?: OpeningHoursSpecification[];
  specialOpeningHoursSpecification?: SpecialOpeningHoursSpecification[];
  priceRange?: string;
  geo?: {
    latitude: number;
    longitude: number;
  };
  hasMap?: string;
  currenciesAccepted?: string;
  paymentAccepted?: string;
  foundingDate?: string;
  additionalType?: string;
  image?: string | string[];
  amenityFeature?: AmenityFeature[];
}

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
 * Organization構造化データ
 */
export function OrganizationJsonLd({
  name,
  description,
  url = BASE_URL,
  logo,
  telephone,
  email,
  address,
  sameAs,
}: OrganizationData): ReactElement {
  const data = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name,
    ...(description && { description }),
    url,
    ...(logo && { logo }),
    ...(telephone && { telephone }),
    ...(email && { email }),
    ...(address && {
      address: {
        "@type": "PostalAddress",
        ...address,
        addressCountry: address.addressCountry || "JP",
      },
    }),
    ...(sameAs && sameAs.length > 0 && { sameAs }),
  };

  return <JsonLd data={data} />;
}

/**
 * LocalBusiness構造化データ（レンタルスペース事業者向け）
 */
/**
 * LocalBusiness JSON-LD オブジェクトを構築（コンポーネント版と @graph 版で共有）
 */
function buildLocalBusinessData(
  props: LocalBusinessData & { id?: string },
): Record<string, unknown> {
  const {
    name,
    description,
    url = BASE_URL,
    logo,
    telephone,
    email,
    address,
    openingHoursSpecification,
    specialOpeningHoursSpecification,
    priceRange,
    geo,
    hasMap,
    currenciesAccepted,
    paymentAccepted,
    foundingDate,
    additionalType,
    image,
    amenityFeature,
    sameAs,
    id,
  } = props;

  return {
    "@type": "LocalBusiness",
    "@id": id || `${url}/#organization`,
    name,
    ...(description && { description }),
    url,
    ...(logo && { logo }),
    ...(image ? { image } : logo ? { image: logo } : {}),
    ...(telephone && { telephone }),
    ...(email && { email }),
    ...(address && {
      address: {
        "@type": "PostalAddress",
        ...address,
        addressCountry: address.addressCountry || "JP",
      },
    }),
    ...(openingHoursSpecification &&
      openingHoursSpecification.length > 0 && {
        openingHoursSpecification,
      }),
    ...(specialOpeningHoursSpecification &&
      specialOpeningHoursSpecification.length > 0 && {
        specialOpeningHoursSpecification,
      }),
    ...(priceRange && { priceRange }),
    ...(geo && {
      geo: {
        "@type": "GeoCoordinates",
        latitude: geo.latitude,
        longitude: geo.longitude,
      },
    }),
    ...(hasMap && { hasMap }),
    ...(currenciesAccepted && { currenciesAccepted }),
    ...(paymentAccepted && { paymentAccepted }),
    ...(foundingDate && { foundingDate }),
    ...(additionalType && { additionalType }),
    ...(amenityFeature && amenityFeature.length > 0 && { amenityFeature }),
    ...(sameAs && sameAs.length > 0 && { sameAs }),
  };
}

/**
 * LocalBusiness構造化データ（レンタルスペース事業者向け）
 */
export function LocalBusinessJsonLd(props: LocalBusinessData): ReactElement {
  const data = {
    "@context": "https://schema.org",
    ...buildLocalBusinessData(props),
  };

  return <JsonLd data={data} />;
}

/**
 * @graph パターン: LocalBusiness + WebSite を1つの JSON-LD で出力
 * エンティティ間の @id 相互参照でナレッジグラフ理解を向上
 */
export function GraphJsonLd({
  localBusiness,
  webSite,
}: {
  localBusiness: LocalBusinessData;
  webSite: { name: string; description?: string; url?: string };
}): ReactElement {
  const orgId = `${localBusiness.url || BASE_URL}/#organization`;
  const websiteId = `${webSite.url || BASE_URL}/#website`;

  const data = {
    "@context": "https://schema.org",
    "@graph": [
      buildLocalBusinessData({ ...localBusiness, id: orgId }),
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
