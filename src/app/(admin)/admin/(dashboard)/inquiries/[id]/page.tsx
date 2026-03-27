import { notFound } from "next/navigation";
import { deleteInquiry } from "@/admin/actions/inquiry";
import { getInquiryById } from "@/admin/queries/inquiry";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { DetailDeleteButton } from "@/admin/components/DetailDeleteButton";
import { InquiryDetail } from "./_components/InquiryDetail";
import type { Metadata } from "next";

type Params = Promise<{ id: string }>;

type PageProps = {
  params: Params;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const inquiry = await getInquiryById(id);

  if (!inquiry) {
    return {
      title: "お問い合わせが見つかりません | Myrrh Rental Space",
    };
  }

  return {
    title: `${inquiry.subject} | お問い合わせ管理 | Myrrh Rental Space`,
  };
}

export default async function InquiryDetailPage({ params }: PageProps) {
  const { id } = await params;
  const inquiry = await getInquiryById(id);

  if (!inquiry) {
    notFound();
  }

  return (
    <AdminDetailLayout
      backHref="/admin/inquiries"
      title="お問い合わせ詳細"
      subtitle={`${inquiry.name}（${inquiry.email}）`}
      actions={
        <DetailDeleteButton
          itemName={inquiry.subject}
          onDelete={deleteInquiry.bind(null, inquiry.id)}
          redirectTo="/admin/inquiries"
        />
      }
    >
      <InquiryDetail inquiry={inquiry} />
    </AdminDetailLayout>
  );
}
