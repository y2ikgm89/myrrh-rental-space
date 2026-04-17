/**
 * 設定トップページ
 *
 * カテゴリカード一覧を表示
 * 各カテゴリをクリックすると詳細ページへ遷移
 */

import {
  IconWorld,
  IconBuilding,
  IconBell,
  IconKey,
  IconSettings,
  IconNavigation,
  IconSpeakerphone,
  IconMail,
} from "@tabler/icons-react";
import { SettingsCard } from "./_components/SettingsCard";
import type { SettingsCardProps } from "./_components/SettingsCard";
const SETTINGS_CATEGORIES: SettingsCardProps[] = [
  {
    title: "サイト設定",
    description: "サイトの基本情報、SEO、レイアウトを設定",
    href: "/admin/settings/site",
    icon: IconWorld,
    items: ["一般", "SEO", "レイアウト"],
  },
  {
    title: "ナビゲーション",
    description: "ヘッダー・フッターのメニューとSNSリンクを管理",
    href: "/admin/settings/navigation",
    icon: IconNavigation,
    items: ["デスクトップ", "モバイル", "フッター", "SNS"],
  },
  {
    title: "お知らせバー",
    description: "サイト上部のお知らせバーを管理",
    href: "/admin/settings/announcement-bar",
    icon: IconSpeakerphone,
    items: ["お知らせ一覧", "カルーセル設定"],
  },
  {
    title: "ビジネス設定",
    description: "事業者情報、営業時間、予約設定を管理",
    href: "/admin/settings/business",
    icon: IconBuilding,
    items: ["事業者情報", "営業時間", "予約"],
  },
  {
    title: "通知・決済",
    description: "メール通知、オンライン決済を設定",
    href: "/admin/settings/notify",
    icon: IconBell,
    items: ["メール", "決済 (Stripe)"],
  },
  {
    title: "メールテンプレート",
    description: "送信メールの件名・挨拶文・導入文・締め文を編集",
    href: "/admin/settings/email-templates",
    icon: IconMail,
    items: ["予約", "イベント", "お問い合わせ", "認証"],
  },
  {
    title: "外部連携",
    description: "外部サービスのAPIキーを管理",
    href: "/admin/settings/api",
    icon: IconKey,
    items: ["Resend", "Cloudflare", "Google", "Instagram"],
  },
  {
    title: "システム管理",
    description: "メンテナンス、Cookie同意、権限を管理",
    href: "/admin/settings/system",
    icon: IconSettings,
    items: ["メンテナンス", "Cookie", "権限"],
  },
];

export default async function SettingsPage() {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          設定
        </h1>
        <p className="text-muted-foreground">サイト全体の設定を管理します</p>
      </div>

      {/* カテゴリカード一覧 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {SETTINGS_CATEGORIES.map((category) => (
          <SettingsCard key={category.href} {...category} />
        ))}
      </div>
    </div>
  );
}
