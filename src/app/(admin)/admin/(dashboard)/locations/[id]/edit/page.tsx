import { notFound } from "next/navigation";
import { connection } from "next/server";
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
  await connection();
  const { id } = await params;
  const result = await getLocationById(id);

  if (!result.success || !result.data) {
    return {
      title: "場所が見つかりません | Myrrh Rental Space",
    };
  }

  return {
    title: `${result.data.name} 編集 | Myrrh Rental Space`,
  };
}

export default async function EditLocationPage({ params }: PageProps) {
  await connection();
  const { id } = await params;
  const result = await getLocationById(id);

  if (!result.success || !result.data) {
    notFound();
  }

  const location = result.data;

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
