/**
 * 設定トップページ
 *
 * カテゴリカード一覧を表示
 * 各カテゴリをクリックすると詳細ページへ遷移
 *
 * 並びは「セットアップ順」に従う:
 *   機能モジュール → サイト基本 → 見た目 → ビジネス → 課金・決済 →
 *   メール・通知 → 外部連携 → システム
 */

import { Suspense } from "react";
import {
  IconWorld,
  IconBuilding,
  IconBell,
  IconKey,
  IconSettings,
  IconPalette,
  IconCreditCard,
  IconToggleLeft,
} from "@tabler/icons-react";
import { SettingsCard } from "./_components/SettingsCard";
import type { SettingsCardProps } from "./_components/SettingsCard";
import { IntegrationHealthAlert } from "../_components/IntegrationHealthAlert";

const SETTINGS_CATEGORIES: SettingsCardProps[] = [
  {
    title: "機能モジュール",
    description: "スペース・予約・イベント・ブログ等の機能 ON/OFF を切り替え",
    href: "/admin/settings/features",
    icon: IconToggleLeft,
    items: [
      "スペース",
      "予約",
      "イベント",
      "ブログ",
      "お知らせ",
      "FAQ",
      "アクセス",
      "お問い合わせ",
      "レビュー",
    ],
  },
  {
    title: "サイト基本",
    description: "一般設定・連絡先・SEO・投稿のパーマリンク",
    href: "/admin/settings/site",
    icon: IconWorld,
    items: ["一般", "SEO", "投稿"],
  },
  {
    title: "サイトの見た目",
    description:
      "ヘッダー・フッター・サイドバー・レイアウト・ナビゲーション・お知らせバー",
    href: "/admin/settings/appearance",
    icon: IconPalette,
    items: [
      "ヘッダー",
      "フッター",
      "サイドバー",
      "レイアウト",
      "ナビゲーション",
      "お知らせバー",
    ],
  },
  {
    title: "ビジネス設定",
    description: "事業者情報・営業時間・予約",
    href: "/admin/settings/business",
    icon: IconBuilding,
    items: ["事業者情報", "営業時間", "予約"],
  },
  {
    title: "課金・決済",
    description: "Stripe オンライン決済・割引・消費税",
    href: "/admin/settings/billing",
    icon: IconCreditCard,
    items: ["決済", "割引", "消費税"],
  },
  {
    title: "メール・通知",
    description: "メール送信元と管理者通知チャネル",
    href: "/admin/settings/notifications",
    icon: IconBell,
    items: ["メール", "通知"],
  },
  {
    title: "外部連携",
    description: "外部サービスの API キーと OAuth 連携",
    href: "/admin/settings/integrations",
    icon: IconKey,
    items: [
      "Resend",
      "Turnstile",
      "Cloudflare",
      "Google Maps",
      "Google カレンダー",
      "Instagram",
      "カスタム",
    ],
  },
  {
    title: "システム管理",
    description: "メンテナンス・Cookie・権限",
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

      {/* 外部連携ヘルスチェック: 未設定があれば alert 表示（dismiss 可能） */}
      <Suspense fallback={null}>
        <IntegrationHealthAlert />
      </Suspense>

      {/* カテゴリカード一覧 */}
      <div className="grid gap-4 @md/main:grid-cols-2 @3xl/main:grid-cols-3">
        {SETTINGS_CATEGORIES.map((category) => (
          <SettingsCard key={category.href} {...category} />
        ))}
      </div>
    </div>
  );
}
