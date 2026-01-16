'use client'

/**
 * 設定タブナビゲーション
 *
 * 9タブ構成のナビゲーションコンポーネント
 * URL状態管理はnuqsで親コンポーネントから制御
 *
 * Note: ホームページ設定は /admin/pages/homepage/edit に移動
 */

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/admin/ui'
import type { SettingsData } from '@/actions/admin/settings'
import {
  GeneralTab,
  BusinessTab,
  SeoTab,
  EmailTab,
  BookingTab,
  PaymentTab,
  ApiKeysTab,
  SystemTab,
  LayoutTab,
} from './tabs'

// =============================================================================
// Types
// =============================================================================

export type SettingsTabId =
  | 'general'
  | 'business'
  | 'layout'
  | 'seo'
  | 'email'
  | 'booking'
  | 'payment'
  | 'apikeys'
  | 'system'

export const SETTINGS_TABS: readonly SettingsTabId[] = [
  'general',
  'business',
  'layout',
  'seo',
  'email',
  'booking',
  'payment',
  'apikeys',
  'system',
]

export interface TabConfig {
  id: SettingsTabId
  label: string
  description: string
}

export const TAB_CONFIGS: TabConfig[] = [
  { id: 'general', label: '一般', description: '基本情報・連絡先' },
  { id: 'business', label: '事業者', description: '事業者情報・営業時間' },
  { id: 'layout', label: 'レイアウト', description: 'サイト幅・コンテンツ幅' },
  { id: 'seo', label: 'SEO', description: '検索エンジン最適化' },
  { id: 'email', label: 'メール', description: 'メール・通知設定' },
  { id: 'booking', label: '予約', description: '予約設定' },
  { id: 'payment', label: '決済', description: 'オンライン決済設定' },
  { id: 'apikeys', label: 'APIキー', description: '外部サービス連携' },
  { id: 'system', label: 'システム', description: 'メンテナンス' },
]

// =============================================================================
// Component
// =============================================================================

interface SettingsTabsProps {
  activeTab: SettingsTabId
  onTabChange: (tab: SettingsTabId) => void
  settings: SettingsData
}

export function SettingsTabs({
  activeTab,
  onTabChange,
  settings,
}: SettingsTabsProps) {
  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => onTabChange(value as SettingsTabId)}
      className="w-full"
    >
      <TabsList className="mb-6">
        {TAB_CONFIGS.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="general">
        <GeneralTab settings={settings} />
      </TabsContent>

      <TabsContent value="business">
        <BusinessTab settings={settings} />
      </TabsContent>

      <TabsContent value="layout">
        <LayoutTab settings={settings} />
      </TabsContent>

      <TabsContent value="seo">
        <SeoTab settings={settings} />
      </TabsContent>

      <TabsContent value="email">
        <EmailTab settings={settings} />
      </TabsContent>

      <TabsContent value="booking">
        <BookingTab settings={settings} />
      </TabsContent>

      <TabsContent value="payment">
        <PaymentTab settings={settings} />
      </TabsContent>

      <TabsContent value="apikeys">
        <ApiKeysTab />
      </TabsContent>

      <TabsContent value="system">
        <SystemTab settings={settings} />
      </TabsContent>
    </Tabs>
  )
}
