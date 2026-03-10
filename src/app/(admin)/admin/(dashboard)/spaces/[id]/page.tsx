import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Pencil, ExternalLink } from "lucide-react";
import Link from "next/link";
import { deleteSpace } from "@/admin/actions/space";
import { getSpaceById } from "@/admin/queries/space";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { DangerZone } from "@/admin/components/DangerZone";
import { Button } from "@/admin/components/ui";
import { SpaceDetail } from "./_components/SpaceDetail";
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
  const space = await getSpaceById(id);

  if (!space) {
    return {
      title: "スペースが見つかりません | Myrrh Rental Space",
    };
  }

  return {
    title: `${space.name} | Myrrh Rental Space`,
  };
}

export default async function SpaceDetailPage({ params }: PageProps) {
  await connection();
  const { id } = await params;
  const space = await getSpaceById(id);

  if (!space) {
    notFound();
  }

  return (
    <AdminDetailLayout
      backHref="/admin/spaces"
      title={space.name}
      subtitle="スペース詳細"
      actions={
        <>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/spaces/${space.slug}`} target="_blank">
              <ExternalLink className="mr-2 h-4 w-4" />
              公開ページを見る
            </Link>
          </Button>
          <Button size="sm" asChild>
            <Link href={`/admin/spaces/${space.id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              編集
            </Link>
          </Button>
        </>
      }
    >
      <SpaceDetail space={space} />
      <DangerZone
        deleteLabel="スペースを削除"
        itemName={space.name}
        onDelete={deleteSpace.bind(null, space.id)}
        redirectTo="/admin/spaces"
      />
    </AdminDetailLayout>
  );
}
