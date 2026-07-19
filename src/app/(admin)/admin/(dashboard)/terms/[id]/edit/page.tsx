import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { connection } from "next/server";
import {
  getAdminTermsById,
  getReagreeAffectedCustomerCount,
} from "@/shared/domain/terms/admin-queries";
import { TermsInlineEditor } from "../../_components/TermsInlineEditor";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await connection();

  const { id } = await params;
  const terms = await getAdminTermsById(id);
  if (!terms) {
    return { title: "規約が見つかりません | Myrrh Rental Space" };
  }
  return { title: `${terms.title} 編集 | Myrrh Rental Space` };
}

export default async function EditTermsPage({ params }: PageProps) {
  await connection();

  const { id } = await params;
  const terms = await getAdminTermsById(id);

  if (!terms) {
    notFound();
  }

  // TERMS-REAGREE-P3B: LOGIN_SIGNUP scope 顧客への影響件数を先読みして
  // TermsInlineEditor 上部の inline warning に渡す。
  const reagreeAffected = await getReagreeAffectedCustomerCount(terms.id);

  return (
    <TermsInlineEditor
      key={terms.id}
      mode="edit"
      terms={terms}
      reagreeAffected={reagreeAffected}
    />
  );
}
