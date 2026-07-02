import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getLocationById } from "@/admin/queries/location";
import { getSettings } from "@/admin/queries/settings";
import { getBlockedDatesForLocation } from "@/shared/domain/blocked-dates/queries";
import {
  getOrganizationSettings,
  getSocialLinkUrls,
} from "@/shared/domain/settings/queries/organization";
import { LocationForm } from "../../_components/LocationForm";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import type { Metadata } from "next";

type Params = Promise<{ id: string }>;

type PageProps = {
  params: Params;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await connection();

  const { id } = await params;
  const location = await getLocationById(id);

  if (!location) {
    return {
      title: "場所が見つかりません | Myrrh Rental Space",
    };
  }

  return {
    title: `${location.name} 編集 | Myrrh Rental Space`,
  };
}

export default async function EditLocationPage({ params }: PageProps) {
  await connection();

  const { id } = await params;
  const [location, settings, socialLinks, fullSettings, initialBlockedDates] =
    await Promise.all([
      getLocationById(id),
      getOrganizationSettings(),
      getSocialLinkUrls(),
      getSettings(),
      getBlockedDatesForLocation(id),
    ]);

  if (!location) {
    notFound();
  }

  const globals = {
    businessName: !!settings?.businessName,
    establishedDate: !!settings?.establishedDate,
    socialLinks: socialLinks.length > 0,
  };

  return (
    <AdminDetailLayout
      backHref={`/admin/locations/${location.id}`}
      backLabel="詳細に戻る"
      title="拠点情報を編集"
      subtitle={location.name}
    >
      <LocationForm
        key={location.id}
        location={location}
        mode="edit"
        globals={globals}
        gbpEnabledGlobally={fullSettings?.googleBusinessProfileEnabled ?? false}
        initialBlockedDates={initialBlockedDates}
      />
    </AdminDetailLayout>
  );
}
