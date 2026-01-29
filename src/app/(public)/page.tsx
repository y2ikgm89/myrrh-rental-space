/**
 * ホームページ
 *
 * レンタルスペースサービスのトップページ
 * SEO最適化: 動的メタデータ + WebSite構造化データ
 *
 * HomepageSectionモデルベースの動的セクションレンダリング
 */

import type { Metadata } from 'next'
import { Suspense, type ReactElement } from 'react'
import { connection } from 'next/server'
import { HomepageSections } from '@/public/components/sections'
import { SectionInspectorSidebar } from '@/public/components/section-inspector'
import { WebSiteJsonLd } from '@/public/components/seo/JsonLd'
import { generateHomeMetadata, getWebSiteJsonLdData } from '@/public/lib/seo'
import { getPublicHomepageSections } from '@/public/actions/homepage'
import { getPostUrlPrefix } from '@/shared/lib/settings/public'
import { isAdmin } from '@/shared/lib/auth'

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

  const [webSiteData, sections, postPrefix, userIsAdmin] = await Promise.all([
    getWebSiteJsonLdData(),
    getPublicHomepageSections(),
    getPostUrlPrefix(),
    isAdmin(),
  ])

  return (
    <>
      <WebSiteJsonLd
        name={webSiteData.name}
        description={webSiteData.description}
        url={webSiteData.url}
      />
      <HomepageSections sections={sections} postPrefix={postPrefix} isAdmin={userIsAdmin} />
      {userIsAdmin && (
        <Suspense fallback={null}>
          <SectionInspectorSidebar sections={sections} />
        </Suspense>
      )}
    </>
  )
}
