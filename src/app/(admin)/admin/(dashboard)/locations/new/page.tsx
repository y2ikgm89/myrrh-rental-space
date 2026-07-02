import { connection } from "next/server";
import {
  getOrganizationSettings,
  getSocialLinkUrls,
} from "@/shared/domain/settings/queries/organization";
import { LocationForm } from "../_components/LocationForm";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "場所新規作成 | Myrrh Rental Space",
};

export default async function NewLocationPage() {
  await connection();

  const [settings, socialLinks] = await Promise.all([
    getOrganizationSettings(),
    getSocialLinkUrls(),
  ]);

  const globals = {
    businessName: !!settings?.businessName,
    establishedDate: !!settings?.establishedDate,
    socialLinks: socialLinks.length > 0,
  };

  return (
    <AdminDetailLayout
      backHref="/admin/spaces?tab=locations"
      title="場所新規作成"
      subtitle="新しい場所（建物・施設）を作成します"
    >
      <LocationForm mode="create" globals={globals} />
    </AdminDetailLayout>
  );
}
