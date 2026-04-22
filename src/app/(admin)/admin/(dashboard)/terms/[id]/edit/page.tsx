import { notFound } from "next/navigation";
import {
  getTermsById,
  getTermsVersionById,
  getTermsAgreements,
} from "@/admin/queries/terms";
import { TermsInlineEditorEdit } from "../../_components/TermsInlineEditorEdit";
import { TermsStatus } from "@/shared/lib/validations/enums/prisma-types";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TermsEditPage({ params }: PageProps) {
  const { id } = await params;

  const terms = await getTermsById(id);
  if (!terms) {
    notFound();
  }

  // 初期バージョンを取得: 最新 DRAFT → 最新 PUBLISHED → 先頭
  const initialVersionId =
    terms.versions.find((v) => v.status === TermsStatus.DRAFT)?.id ??
    terms.versions.find((v) => v.status === TermsStatus.PUBLISHED)?.id ??
    terms.versions[0]?.id;

  let initialVersion = null;
  if (initialVersionId) {
    initialVersion = await getTermsVersionById(initialVersionId);
  }

  // 同意記録の初期データを取得
  const agreementsData = await getTermsAgreements(id, 1);

  return (
    <TermsInlineEditorEdit
      key={terms.id}
      terms={{
        id: terms.id,
        title: terms.title,
        slug: terms.slug,
        type: terms.type,
        isActive: terms.isActive,
        requiredAtReservation: terms.requiredAtReservation,
        showInFooter: terms.showInFooter,
        versions: terms.versions.map((v) => ({
          ...v,
          createdAt: v.createdAt,
          publishedAt: v.publishedAt ?? null,
        })),
      }}
      initialVersion={initialVersion}
      initialAgreements={agreementsData.agreements}
      initialTotal={agreementsData.total}
    />
  );
}
