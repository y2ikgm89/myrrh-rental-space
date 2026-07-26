/**
 * /admin/settings/features — Feature Module ON/OFF 管理
 *
 * Sanity / Stripe Capabilities 流の declarative composition pattern。
 * 11 module の ON/OFF を切り替えると公開ページ 404 / 公開ナビ prune /
 * sitemap prune / SectionRenderer skip / 機能紐づき cron の早期 return に伝播する。
 * 決済・予約まわりの一部 cron（pending-reservation-expire、receipt-backfill 等）は
 * 引き続き実行される場合がある。管理画面サイドバー・コマンドパレットは prune
 * せず、OFF 時は「非公開」badge + tooltip で公開 404 であることを示す。
 * 既存データの一覧・編集は可、新規作成はページとアクションでブロック。
 */

import type { Metadata } from "next";
import { connection } from "next/server";
import {
  getSettings,
  getDataRetentionSettings,
} from "@/admin/queries/settings";
import { requireAdminPermission } from "@/admin/queries/_helpers";
import { SettingsLayout } from "../_components/SettingsLayout";
import { parseFeatureModules } from "@/shared/lib/json-validators";
import {
  FEATURE_MODULES,
  FEATURE_MODULES_LIST,
  type FeatureModule,
} from "@/shared/lib/features/registry";
import { FeatureModulesForm } from "./_components/FeatureModulesForm";
import { DataRetentionSettingsForm } from "./_components/DataRetentionSettingsForm";

export const metadata: Metadata = {
  title: "機能モジュール — 設定",
  robots: { index: false, follow: false },
};

export default async function FeaturesSettingsPage() {
  await requireAdminPermission("settings", "manage");
  await connection();

  const settings = await getSettings();
  const dataRetention = await getDataRetentionSettings();
  const currentModules = parseFeatureModules(settings.featureModules);

  // registry の全 module を network しつつ、未保存の key は false で初期化（fail-closed）
  const initialValues: Record<FeatureModule, boolean> = {
    spaces: false,
    reservation: false,
    events: false,
    posts: false,
    news: false,
    faq: false,
    access: false,
    contact: false,
    reviews: false,
    payment: false,
    "data-retention": false,
  };
  for (const id of FEATURE_MODULES_LIST) {
    initialValues[id] = currentModules[id] === true;
  }

  // metadata for the form: id / label / description / requires
  const moduleDefs = FEATURE_MODULES_LIST.map((id) => ({
    id,
    label: FEATURE_MODULES[id].label,
    description: FEATURE_MODULES[id].description,
    requires: FEATURE_MODULES[id].requires ?? [],
    publicRoutes: FEATURE_MODULES[id].publicRoutes,
  }));

  return (
    <SettingsLayout
      title="機能モジュール"
      description="サイトで使用する機能の ON/OFF を管理します"
    >
      <FeatureModulesForm
        initialValues={initialValues}
        moduleDefs={moduleDefs}
        featuresUpdatedAt={settings.featuresUpdatedAt}
      />
      <DataRetentionSettingsForm
        initialValues={dataRetention.config}
        dataRetentionUpdatedAt={dataRetention.dataRetentionUpdatedAt}
      />
    </SettingsLayout>
  );
}
