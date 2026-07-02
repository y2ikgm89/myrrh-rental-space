import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { connection } from "next/server";
import { getPostTagById } from "@/admin/queries/post";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { TagEditor } from "../_components/TagEditor";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  await connection();

  const { id } = await params;
  const tag = await getPostTagById(id);
  return {
    title: tag ? `${tag.name} | タグ編集` : "タグが見つかりません",
  };
}

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditTagPage({ params }: PageProps) {
  await connection();

  const { id } = await params;
  const tag = await getPostTagById(id);

  if (!tag) {
    notFound();
  }

  return (
    <AdminDetailLayout backHref="/admin/posts?tab=tags" title={tag.name}>
      <TagEditor key={tag.id} tag={tag} />
    </AdminDetailLayout>
  );
}
