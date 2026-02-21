import { connection } from "next/server";
import { notFound } from "next/navigation";
import {
  getTermsById,
  getTermsVersionById,
  getTermsAgreements,
} from "@/admin/actions/terms";
import { TermsInlineEditor } from "../../_components/TermsInlineEditor";
import { TermsAgreementsTab } from "./_components/TermsAgreementsTab";
import { TermsStatus } from "@/shared/generated/prisma/enums";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/admin/components/ui";

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

  // 同意記録の初期データを取得
  const agreementsResult = await getTermsAgreements(id, 1);
  const initialAgreements = agreementsResult.success
    ? agreementsResult.data.agreements
    : [];
  const initialTotal = agreementsResult.success
    ? agreementsResult.data.total
    : 0;

  return (
    <Tabs defaultValue="edit" className="h-full">
      <div className="border-b px-4 sm:px-6">
        <TabsList className="h-12 bg-transparent p-0 gap-0">
          <TabsTrigger
            value="edit"
            className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4"
          >
            編集
          </TabsTrigger>
          <TabsTrigger
            value="agreements"
            className="h-full rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4"
          >
            同意記録
            {initialTotal > 0 && (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums">
                {initialTotal}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent
        value="edit"
        forceMount
        className="mt-0 data-[state=inactive]:hidden"
      >
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
      </TabsContent>

      <TabsContent
        value="agreements"
        forceMount
        className="mt-0 p-4 sm:p-6 data-[state=inactive]:hidden"
      >
        <TermsAgreementsTab
          termsId={id}
          initialAgreements={initialAgreements}
          initialTotal={initialTotal}
        />
      </TabsContent>
    </Tabs>
  );
}
