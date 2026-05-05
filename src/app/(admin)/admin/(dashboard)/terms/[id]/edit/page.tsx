import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { getAdminTermsById } from "@/shared/domain/terms/admin-queries";
import { TermsForm } from "../../_components/TermsForm";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const terms = await getAdminTermsById(id);
  if (!terms) {
    return { title: "規約が見つかりません | Myrrh Rental Space" };
  }
  return { title: `${terms.title} 編集 | Myrrh Rental Space` };
}

export default async function EditTermsPage({ params }: PageProps) {
  const { id } = await params;
  const terms = await getAdminTermsById(id);

  if (!terms) {
    notFound();
  }

  return (
    <AdminDetailLayout
      backHref="/admin/terms"
      backLabel="一覧に戻る"
      title="規約を編集"
      subtitle={terms.title}
    >
      <TermsForm
        key={terms.id}
        mode="edit"
        initial={{
          id: terms.id,
          type: terms.type,
          slug: terms.slug,
          title: terms.title,
          contentJson:
            typeof terms.contentJson === "string"
              ? terms.contentJson
              : JSON.stringify(terms.contentJson),
          isPublished: terms.isPublished,
          requiredAtReservation: terms.requiredAtReservation,
          requiredAtInquiry: terms.requiredAtInquiry,
          showInFooter: terms.showInFooter,
          footerOrder: terms.footerOrder,
        }}
      />
    </AdminDetailLayout>
  );
}
