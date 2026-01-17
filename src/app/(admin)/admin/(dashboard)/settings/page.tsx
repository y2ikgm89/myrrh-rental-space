/**
 * 設定トップページ
 *
 * カテゴリカード一覧を表示
 * 各カテゴリをクリックすると詳細ページへ遷移
 */

import {
  Globe,
  Building2,
  Bell,
  Key,
  Settings,
} from 'lucide-react'
import { SettingsCard } from './_components/SettingsCard'
import type { SettingsCardProps } from './_components/SettingsCard'

const SETTINGS_CATEGORIES: SettingsCardProps[] = [
  {
    title: 'サイト設定',
    description: 'サイトの基本情報、SEO、レイアウト、ナビゲーションを設定',
    href: '/admin/settings/site',
    icon: Globe,
    items: ['一般', 'SEO', 'レイアウト', 'ナビゲーション', 'お知らせバー'],
  },
  {
    title: 'ビジネス設定',
    description: '事業者情報、営業時間、予約設定を管理',
    href: '/admin/settings/business',
    icon: Building2,
    items: ['事業者情報', '営業時間', '予約'],
  },
  {
    title: '通知・決済',
    description: 'メール通知、オンライン決済を設定',
    href: '/admin/settings/notify',
    icon: Bell,
    items: ['メール', '決済 (Stripe)'],
  },
  {
    title: '外部連携',
    description: '外部サービスのAPIキーを管理',
    href: '/admin/settings/api',
    icon: Key,
    items: ['Resend', 'Turnstile', 'Google'],
  },
  {
    title: 'システム管理',
    description: 'メンテナンス、Cookie同意、権限を管理',
    href: '/admin/settings/system',
    icon: Settings,
    items: ['メンテナンス', 'Cookie', '権限'],
  },
]

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-bold">サイト設定</h1>
        <p className="text-muted-foreground">サイト全体の設定を管理します</p>
      </div>

      {/* カテゴリカード一覧 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {SETTINGS_CATEGORIES.map((category) => (
          <SettingsCard key={category.href} {...category} />
        ))}
      </div>
    </div>
  )
}
