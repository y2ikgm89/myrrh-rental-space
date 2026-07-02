import { connection } from "next/server";
import { getActiveLocationsForSelect } from "@/admin/queries/location";
import { getActiveSpaceCategories } from "@/admin/queries/space-category";
import { getTaxSettings } from "@/admin/queries/settings";
import { isFeatureEnabled } from "@/shared/lib/features/check";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { SpaceEditForm } from "../_components/SpaceEditForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "スペース新規作成 | Myrrh Rental Space",
};

export default async function NewSpacePage() {
  await connection();

  const [
    availableLocations,
    availableCategories,
    taxSettings,
    reviewsFeatureEnabled,
  ] = await Promise.all([
    getActiveLocationsForSelect(),
    getActiveSpaceCategories(),
    getTaxSettings(),
    isFeatureEnabled("reviews"),
  ]);

  return (
    <AdminDetailLayout
      backHref="/admin/spaces"
      title="スペースを新規作成"
      subtitle="新しいスペースを登録します"
    >
      <SpaceEditForm
        mode="create"
        availableLocations={availableLocations}
        availableCategories={availableCategories}
        taxSettings={taxSettings}
        reviewsFeatureEnabled={reviewsFeatureEnabled}
      />
    </AdminDetailLayout>
  );
}
