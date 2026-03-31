import { notFound } from "next/navigation";
import { IconPencil } from "@tabler/icons-react";
import Link from "next/link";
import { deleteLocation } from "@/admin/actions/location";
import { getLocationById } from "@/admin/queries/location";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { DetailDeleteButton } from "@/admin/components/DetailDeleteButton";
import { Button } from "@/admin/components/ui";
import { LocationDetail } from "./_components/LocationDetail";
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
    title: `${location.name} | Myrrh Rental Space`,
  };
}

export default async function LocationDetailPage({ params }: PageProps) {
  const { id } = await params;
  const location = await getLocationById(id);

  if (!location) {
    notFound();
  }

  return (
    <AdminDetailLayout
      backHref="/admin/spaces?tab=locations"
      title={location.name}
      subtitle="拠点詳細"
      actions={
        <>
          <DetailDeleteButton
            itemName={location.name}
            onDelete={deleteLocation.bind(null, location.id)}
            redirectTo="/admin/spaces?tab=locations"
          />
          <Button asChild size="sm">
            <Link href={`/admin/locations/${location.id}/edit`}>
              <IconPencil className="mr-2 h-4 w-4" />
              編集
            </Link>
          </Button>
        </>
      }
    >
      <LocationDetail location={location} />
    </AdminDetailLayout>
  );
}
