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
import { connection } from "next/server";
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
import { requireAdminPermission } from "@/admin/queries/_helpers";
import { hasPermission } from "@/shared/lib/admin-permissions";
import type { Action, Resource } from "@/shared/lib/admin-resources";

type SettingsCategory = SettingsCardProps & {
  requiredPermission?: {
    resource: Resource;
    action: Action;
  };
};

const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    title: "機能モジュール",
    description: "スペース・予約・イベント・ブログ等の機能 ON/OFF を切り替え",
    href: "/admin/settings/features",
    icon: IconToggleLeft,
    requiredPermission: { resource: "settings", action: "manage" },
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
    description: "事業者情報・営業時間・予約・休業日",
    href: "/admin/settings/business",
    icon: IconBuilding,
    items: ["事業者情報", "営業時間", "予約", "休業日"],
  },
  {
    title: "課金・決済",
    description: "Stripe オンライン決済・割引・消費税・返金ポリシー",
    href: "/admin/settings/billing",
    icon: IconCreditCard,
    requiredPermission: { resource: "settings", action: "manage" },
    items: ["決済", "割引", "消費税", "返金ポリシー"],
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
    requiredPermission: { resource: "settings", action: "manage" },
    items: [
      "Resend",
      "Turnstile",
      "Google Maps",
      "Google カレンダー",
      "Instagram",
      "カスタム",
    ],
  },
  {
    title: "システム管理",
    description: "メンテナンス・Cookie・IAP前提の管理ロール",
    href: "/admin/settings/system",
    icon: IconSettings,
    requiredPermission: { resource: "settings", action: "manage" },
    items: ["メンテナンス", "Cookie", "管理ロール"],
  },
];

function toSettingsCardProps(category: SettingsCategory): SettingsCardProps {
  const props = {
    title: category.title,
    description: category.description,
    href: category.href,
    icon: category.icon,
  };

  if (!category.items) {
    return props;
  }

  return {
    ...props,
    items: category.items,
  };
}

export default async function SettingsPage() {
  await connection();

  const currentUser = await requireAdminPermission("settings", "read");
  const canManageSettings = hasPermission(
    currentUser.role,
    "settings",
    "manage",
  );
  const visibleCategories = SETTINGS_CATEGORIES.filter((category) => {
    if (!category.requiredPermission) return true;
    return hasPermission(
      currentUser.role,
      category.requiredPermission.resource,
      category.requiredPermission.action,
    );
  });

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
      {canManageSettings ? (
        <Suspense fallback={null}>
          <IntegrationHealthAlert />
        </Suspense>
      ) : null}

      {/* カテゴリカード一覧 */}
      <div className="grid gap-4 @md/main:grid-cols-2 @3xl/main:grid-cols-3">
        {visibleCategories.map((category) => {
          const cardProps = toSettingsCardProps(category);
          return <SettingsCard key={category.href} {...cardProps} />;
        })}
      </div>
    </div>
  );
}
