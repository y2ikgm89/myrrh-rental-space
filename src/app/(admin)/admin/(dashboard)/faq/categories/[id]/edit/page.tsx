import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getFaqCategoryById } from "@/admin/actions/faq";
import { FaqCategoryForm } from "../../../_components/FaqCategoryForm";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { connection } from "next/server";

export const metadata: Metadata = {
  title: "カテゴリ編集 | FAQ管理 | Myrrh Rental Space",
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditFaqCategoryPage({ params }: PageProps) {
  await connection();
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
