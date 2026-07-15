/**
 * /admin/settings/features — Feature Module ON/OFF 管理
 *
 * Sanity / Stripe Capabilities 流の declarative composition pattern。
 * 11 module の ON/OFF を切り替えると公開ページ 404 / nav prune /
 * sitemap prune / SectionRenderer skip / cron 早期 return に伝播する。
 */

import type { Metadata } from "next";
import { connection } from "next/server";
import { getSettings } from "@/admin/queries/settings";
import { requireAdminPermission } from "@/admin/queries/_helpers";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { parseFeatureModules } from "@/shared/lib/json-validators";
import {
  FEATURE_MODULES,
  FEATURE_MODULES_LIST,
  type FeatureModule,
} from "@/shared/lib/features/registry";
import { FeatureModulesForm } from "./_components/FeatureModulesForm";

export const metadata: Metadata = {
  title: "機能モジュール — 設定",
  robots: { index: false, follow: false },
};

export default async function FeaturesSettingsPage() {
  await requireAdminPermission("settings", "manage");
  await connection();

  const settings = await getSettings();
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
    <AdminDetailLayout
      backHref="/admin/settings"
      title="機能モジュール"
      subtitle="サイトで使用する機能の ON/OFF を管理します"
    >
      <FeatureModulesForm
        initialValues={initialValues}
        moduleDefs={moduleDefs}
      />
    </AdminDetailLayout>
  );
}
