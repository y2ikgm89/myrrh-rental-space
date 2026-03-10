import { notFound } from "next/navigation";
import { getLocationById } from "@/admin/queries/location";
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
  const { id } = await params;
  const location = await getLocationById(id);

  if (!location) {
    notFound();
  }

  return (
    <AdminDetailLayout
      backHref={`/admin/locations/${location.id}`}
      backLabel="詳細に戻る"
      title="拠点情報を編集"
      subtitle={location.name}
    >
      <LocationForm location={location} mode="edit" />
    </AdminDetailLayout>
  );
}
