import { notFound } from "next/navigation";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { deleteSpace } from "@/admin/actions/space";
import { getSpaceById } from "@/admin/queries/space";
import { getActiveTermsForSelect } from "@/admin/queries/terms";
import { getActiveLocationsForSelect } from "@/admin/queries/location";
import { getActiveSpaceCategories } from "@/admin/queries/space-category";
import { getTaxSettings } from "@/admin/queries/settings";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { DetailDeleteButton } from "@/admin/components/DetailDeleteButton";
import { Button } from "@/admin/components/ui";
import { SpaceEditForm } from "../../_components/SpaceEditForm";
import type { Metadata } from "next";

type Params = Promise<{ id: string }>;
type PageProps = { params: Params };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const space = await getSpaceById(id);
  if (!space) return { title: "スペースが見つかりません | Myrrh Rental Space" };
  return { title: `${space.name} 編集 | Myrrh Rental Space` };
}

export default async function EditSpacePage({ params }: PageProps) {
  const { id } = await params;

  const [
    space,
    availableTerms,
    availableLocations,
    availableCategories,
    taxSettings,
  ] = await Promise.all([
    getSpaceById(id),
    getActiveTermsForSelect(),
    getActiveLocationsForSelect(),
    getActiveSpaceCategories(),
    getTaxSettings(),
  ]);

  if (!space) notFound();

  return (
    <AdminDetailLayout
      backHref={`/admin/spaces/${space.id}`}
      backLabel="詳細に戻る"
      title="スペースを編集"
      subtitle={space.name}
      actions={
        <>
          <DetailDeleteButton
            itemName={space.name}
            onDelete={deleteSpace.bind(null, space.id)}
            redirectTo="/admin/spaces"
          />
          <Button variant="outline" size="sm" asChild>
            <Link
              href={`/spaces/${space.slug}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              公開ページを見る
            </Link>
          </Button>
        </>
      }
    >
      <SpaceEditForm
        space={space}
        mode="edit"
        availableTerms={availableTerms}
        availableLocations={availableLocations}
        availableCategories={availableCategories}
        taxSettings={taxSettings}
      />
    </AdminDetailLayout>
  );
}
