import { getActiveTermsForSelect } from "@/admin/queries/terms";
import { getActiveLocationsForSelect } from "@/admin/queries/location";
import { getActiveSpaceCategories } from "@/admin/queries/space-category";
import { getTaxSettings } from "@/admin/queries/settings";
import { getReviewsEnabledGlobal } from "@/shared/domain/settings/public-queries";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { SpaceEditForm } from "../_components/SpaceEditForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "スペース新規作成 | Myrrh Rental Space",
};

export default async function NewSpacePage() {
  const [
    availableTerms,
    availableLocations,
    availableCategories,
    taxSettings,
    reviewsEnabledGlobal,
  ] = await Promise.all([
    getActiveTermsForSelect(),
    getActiveLocationsForSelect(),
    getActiveSpaceCategories(),
    getTaxSettings(),
    getReviewsEnabledGlobal(),
  ]);

  return (
    <AdminDetailLayout
      backHref="/admin/spaces"
      title="スペースを新規作成"
      subtitle="新しいスペースを登録します"
    >
      <SpaceEditForm
        mode="create"
        availableTerms={availableTerms}
        availableLocations={availableLocations}
        availableCategories={availableCategories}
        taxSettings={taxSettings}
        reviewsEnabledGlobal={reviewsEnabledGlobal}
      />
    </AdminDetailLayout>
  );
}
