import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getTermsById, getTermsVersionById } from "@/admin/actions/terms";
import { TermsInlineEditor } from "../../_components/TermsInlineEditor";
import { TermsStatus } from "@/shared/generated/prisma/enums";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TermsEditPage({ params }: PageProps) {
  await connection();
  const { id } = await params;

  const termsResult = await getTermsById(id);

  if (!termsResult.success || !termsResult.data) {
    notFound();
  }

  const terms = termsResult.data;

  // 初期バージョンを取得: 最新 DRAFT → 最新 PUBLISHED → 先頭
  const initialVersionId =
    terms.versions.find((v) => v.status === TermsStatus.DRAFT)?.id ??
    terms.versions.find((v) => v.status === TermsStatus.PUBLISHED)?.id ??
    terms.versions[0]?.id;

  let initialVersion = null;
  if (initialVersionId) {
    const versionResult = await getTermsVersionById(initialVersionId);
    if (versionResult.success && versionResult.data) {
      initialVersion = versionResult.data;
    }
  }

  return (
    <TermsInlineEditor
      terms={{
        id: terms.id,
        title: terms.title,
        slug: terms.slug,
        type: terms.type,
        isActive: terms.isActive,
        versions: terms.versions,
      }}
      initialVersion={initialVersion}
      mode="edit"
    />
  );
}
