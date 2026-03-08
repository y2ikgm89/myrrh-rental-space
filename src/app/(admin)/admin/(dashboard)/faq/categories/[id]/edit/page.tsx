import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { getFaqCategoryById } from "@/admin/queries/faq";
import { FaqCategoryForm } from "../../../_components/FaqCategoryForm";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await headers();
  const { id } = await params;
  const category = await getFaqCategoryById(id);
  if (!category) {
    return { title: "カテゴリ編集 | FAQ管理 | Myrrh Rental Space" };
  }
  return {
    title: `${category.name} 編集 | FAQ管理 | Myrrh Rental Space`,
  };
}

export default async function EditFaqCategoryPage({ params }: PageProps) {
  const { id } = await params;
  const category = await getFaqCategoryById(id);

  if (!category) {
    notFound();
  }

  return (
    <AdminDetailLayout
      backHref="/admin/faq"
      title="カテゴリ編集"
      subtitle={`「${category.name}」を編集します`}
    >
      <FaqCategoryForm category={category} mode="edit" />
    </AdminDetailLayout>
  );
}

