import type { Metadata } from "next";
import { FaqCategoryForm } from "../../_components/FaqCategoryForm";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { connection } from "next/server";

export const metadata: Metadata = {
  title: "カテゴリ作成 | FAQ管理 | Myrrh Rental Space",
};

export default async function NewFaqCategoryPage() {
  await connection();
  return (
    <AdminDetailLayout
      backHref="/admin/faq"
      title="カテゴリ作成"
      subtitle="新しいFAQカテゴリを作成します"
    >
      <FaqCategoryForm mode="create" />
    </AdminDetailLayout>
  );
}
