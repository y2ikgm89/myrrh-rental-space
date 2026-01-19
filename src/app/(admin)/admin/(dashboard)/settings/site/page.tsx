/**
 * サイト設定ページ
 *
 * 一般設定・SEO設定・レイアウトをタブで切り替え
 * ナビゲーションとお知らせバーは独立ページに分離
 *
 * Next.js 16 PPR対応:
 * - 静的シェル: ローディングUI
 * - 動的コンテンツ: 設定データ（Suspenseでラップ）
 */

import { Suspense } from 'react'
import { connection } from 'next/server'
import Link from 'next/link'
import { ChevronRight, FileText, Navigation, Megaphone } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription } from '@/admin/components/ui/card'
import { getSettings } from '@/admin/actions/settings'
import { SettingsLayout } from '../_components/SettingsLayout'
import { SettingsTabs } from '../_components/SettingsTabs'
import {
  BasicInfoSection,
  ContactInfoSection,
  SeoSection,
  SidebarSection,
  LayoutSection,
} from '../_components/sections'
import type { ReactElement } from 'react'

/**
 * 動的コンテンツ: サイト設定
 */
async function SiteSettingsContent(): Promise<ReactElement> {
  await connection()

  const settings = await getSettings()

  if (!settings) {
    return (
      <SettingsLayout
        title="サイト設定"
        description="一般設定・SEO設定・レイアウト"
      >
        <div className="text-center py-8 text-muted-foreground">
          設定を読み込めませんでした
        </div>
      </SettingsLayout>
    )
  }

  const tabs = [
    {
      value: 'general',
      label: '一般',
      content: (
        <div className="space-y-6">
          <BasicInfoSection settings={settings} />
          <ContactInfoSection settings={settings} />
        </div>
      ),
    },
    {
      value: 'seo',
      label: 'SEO',
      content: <SeoSection settings={settings} />,
    },
    {
      value: 'layout',
      label: 'レイアウト',
      content: (
        <div className="space-y-6">
          <SidebarSection settings={settings} />
          <LayoutSection settings={settings} />
        </div>
      ),
    },
  ]

  return (
    <SettingsLayout
      title="サイト設定"
      description="一般設定・SEO設定・レイアウト"
    >
      <SettingsTabs tabs={tabs} defaultTab="general" />

      {/* 関連ページへのリンク */}
      <div className="mt-8 pt-4 border-t">
        <h2 className="text-sm font-medium text-muted-foreground mb-4">関連設定</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/admin/settings/navigation" className="block group">
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Navigation className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base">ナビゲーション</CardTitle>
                      <CardDescription>メニュー・SNSリンク管理</CardDescription>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </div>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/admin/settings/announcement-bar" className="block group">
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Megaphone className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base">お知らせバー</CardTitle>
                      <CardDescription>サイト上部のお知らせ</CardDescription>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </div>
              </CardHeader>
            </Card>
          </Link>

          <Link href="/admin/audit-logs" className="block group">
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base">監査ログ</CardTitle>
                      <CardDescription>システム操作の履歴確認</CardDescription>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </div>
              </CardHeader>
            </Card>
          </Link>
        </div>
      </div>
    </SettingsLayout>
  )
}

/**
 * ローディングUI
 */
function SiteSettingsLoading(): ReactElement {
  return (
    <SettingsLayout
      title="サイト設定"
      description="一般設定・SEO設定・レイアウト"
    >
      <div className="animate-pulse space-y-6">
        <div className="flex gap-1 h-10 bg-muted rounded-lg p-1">
          <div className="h-8 w-16 bg-gray-300 rounded-md" />
          <div className="h-8 w-12 bg-gray-200 rounded-md" />
          <div className="h-8 w-20 bg-gray-200 rounded-md" />
        </div>
        <div className="h-48 bg-gray-200 rounded" />
        <div className="h-48 bg-gray-200 rounded" />
      </div>
    </SettingsLayout>
  )
}

export default function SiteSettingsPage(): ReactElement {
  return (
    <Suspense fallback={<SiteSettingsLoading />}>
      <SiteSettingsContent />
    </Suspense>
  )
}
