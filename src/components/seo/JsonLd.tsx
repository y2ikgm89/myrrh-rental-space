/**
 * JSON-LD構造化データコンポーネント
 *
 * JSON.stringifyでシリアライズされたデータのみを使用するため、
 * XSSのリスクはありません（HTMLではなくJSONデータ）。
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/metadata#json-ld
 * @see https://developers.google.com/search/docs/appearance/structured-data
 */

import type { ReactElement } from 'react'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://example.com'

// =============================================================================
// Types
// =============================================================================

interface OrganizationData {
  name: string
  description?: string
  url?: string
  logo?: string
  telephone?: string
  email?: string
  address?: {
    streetAddress?: string
    addressLocality?: string
    addressRegion?: string
    postalCode?: string
    addressCountry?: string
  }
  sameAs?: string[]
}

interface LocalBusinessData extends OrganizationData {
  openingHours?: string[]
  priceRange?: string
  geo?: {
    latitude: number
    longitude: number
  }
}

interface ProductData {
  name: string
  description: string
  image: string
  url: string
  offers?: {
    price: number
    priceCurrency?: string
    availability?: string
  }
}

interface ArticleData {
  headline: string
  description: string
  image?: string
  url: string
  datePublished: string
  dateModified?: string
  author?: {
    name: string
    url?: string
  }
}

interface BreadcrumbItem {
  name: string
  url: string
}

interface FAQItem {
  question: string
  answer: string
}

// =============================================================================
// Components
// =============================================================================

interface JsonLdProps {
  data: Record<string, unknown>
}

/**
 * JSON-LDスクリプトタグを生成
 *
 * Note: JSON.stringifyは適切にエスケープされたJSON文字列を生成するため、
 * dangerouslySetInnerHTMLを使用しても安全です（HTMLではなくJSONデータ）。
 */
function JsonLd({ data }: JsonLdProps): ReactElement {
  // JSON.stringifyは<script>などをエスケープしないため、
  // 追加のサニタイズを行う
  const safeJsonString = JSON.stringify(data).replace(/</g, '\\u003c')

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonString }}
    />
  )
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
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name,
    ...(description && { description }),
    url,
    ...(logo && { logo }),
    ...(telephone && { telephone }),
    ...(email && { email }),
    ...(address && {
      address: {
        '@type': 'PostalAddress',
        ...address,
        addressCountry: address.addressCountry || 'JP',
      },
    }),
    ...(sameAs && sameAs.length > 0 && { sameAs }),
  }

  return <JsonLd data={data} />
}

/**
 * LocalBusiness構造化データ（レンタルスペース事業者向け）
 */
export function LocalBusinessJsonLd({
  name,
  description,
  url = BASE_URL,
  logo,
  telephone,
  email,
  address,
  openingHours,
  priceRange,
  geo,
  sameAs,
}: LocalBusinessData): ReactElement {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${url}#localbusiness`,
    name,
    ...(description && { description }),
    url,
    ...(logo && { logo, image: logo }),
    ...(telephone && { telephone }),
    ...(email && { email }),
    ...(address && {
      address: {
        '@type': 'PostalAddress',
        ...address,
        addressCountry: address.addressCountry || 'JP',
      },
    }),
    ...(openingHours && { openingHoursSpecification: openingHours }),
    ...(priceRange && { priceRange }),
    ...(geo && {
      geo: {
        '@type': 'GeoCoordinates',
        latitude: geo.latitude,
        longitude: geo.longitude,
      },
    }),
    ...(sameAs && sameAs.length > 0 && { sameAs }),
  }

  return <JsonLd data={data} />
}

/**
 * Product構造化データ（スペース詳細ページ向け）
 */
export function ProductJsonLd({
  name,
  description,
  image,
  url,
  offers,
}: ProductData): ReactElement {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    description,
    image,
    url,
    ...(offers && {
      offers: {
        '@type': 'Offer',
        price: offers.price,
        priceCurrency: offers.priceCurrency || 'JPY',
        availability: offers.availability || 'https://schema.org/InStock',
      },
    }),
  }

  return <JsonLd data={data} />
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
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline,
    description,
    ...(image && { image }),
    url,
    datePublished,
    dateModified: dateModified || datePublished,
    ...(author && {
      author: {
        '@type': 'Person',
        name: author.name,
        ...(author.url && { url: author.url }),
      },
    }),
    publisher: {
      '@type': 'Organization',
      name: 'Myrrh Rental Space',
      url: BASE_URL,
    },
  }

  return <JsonLd data={data} />
}

/**
 * BreadcrumbList構造化データ
 */
export function BreadcrumbJsonLd({
  items,
}: {
  items: BreadcrumbItem[]
}): ReactElement {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url.startsWith('http') ? item.url : `${BASE_URL}${item.url}`,
    })),
  }

  return <JsonLd data={data} />
}

/**
 * FAQPage構造化データ
 */
export function FAQPageJsonLd({ items }: { items: FAQItem[] }): ReactElement {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  }

  return <JsonLd data={data} />
}

/**
 * WebSite構造化データ（サイト全体）
 */
export function WebSiteJsonLd({
  name,
  description,
  url = BASE_URL,
}: {
  name: string
  description?: string
  url?: string
}): ReactElement {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name,
    ...(description && { description }),
    url,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${url}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }

  return <JsonLd data={data} />
}
