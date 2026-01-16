/**
 * ホームページ
 *
 * レンタルスペースサービスのトップページ
 * SEO最適化: 動的メタデータ + WebSite構造化データ
 *
 * HomepageSectionモデルベースの動的セクションレンダリング
 */

import type { Metadata } from 'next'
import { connection } from 'next/server'
import { HomepageSections } from '@/components/site/sections'
import { WebSiteJsonLd } from '@/components/seo/JsonLd'
import { generateHomeMetadata, getWebSiteJsonLdData } from '@/lib/seo'
import { getPublicHomepageSections } from '@/actions/admin/homepage-settings'
import type { ReactElement } from 'react'

/**
 * ホームページメタデータ生成
 * Settings DBから取得した設定を使用
 */
export async function generateMetadata(): Promise<Metadata> {
  return generateHomeMetadata()
}

export default async function HomePage(): Promise<ReactElement> {
  // Dynamic rendering - データベースから動的にコンテンツを取得
  await connection()

  const [webSiteData, sections] = await Promise.all([
    getWebSiteJsonLdData(),
    getPublicHomepageSections(),
  ])

  return (
    <>
      <WebSiteJsonLd
        name={webSiteData.name}
        description={webSiteData.description}
        url={webSiteData.url}
      />
      <HomepageSections sections={sections} />
    </>
  )
}
