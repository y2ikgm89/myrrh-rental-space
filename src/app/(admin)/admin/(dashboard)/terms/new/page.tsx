import type { Metadata } from "next";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import {
  TERMS_TYPE_VALUES,
  type TermsTypeValue,
} from "@/shared/lib/validations/terms";
import {
  applyBusinessInfo,
  getTemplatesForType,
  type BusinessInfo,
} from "@/shared/lib/terms-templates";
import { getPublicBusinessSettings } from "@/shared/domain/settings/queries/organization";
import { TermsForm } from "../_components/TermsForm";

export const metadata: Metadata = {
  title: "規約を新規作成 | Myrrh Rental Space",
};

const TERMS_TYPE_SET = new Set<string>(TERMS_TYPE_VALUES);

function isTermsTypeValue(value: string): value is TermsTypeValue {
  return TERMS_TYPE_SET.has(value);
}

interface NewTermsPageProps {
  readonly searchParams: Promise<{ type?: string }>;
}

export default async function NewTermsPage({
  searchParams,
}: NewTermsPageProps) {
  const { type: typeParam } = await searchParams;
  const typeValue: TermsTypeValue =
    typeParam && isTermsTypeValue(typeParam) ? typeParam : "custom";

  const templates = getTemplatesForType(typeValue);
  const template = templates[0];

  let initialTemplateHtml: string | undefined;
  let initialTitle: string | undefined;

  if (template) {
    const settings = await getPublicBusinessSettings();
    const businessInfo: BusinessInfo = {
      businessName: settings?.businessName ?? null,
      representativeName: settings?.representativeName ?? null,
      invoiceNumber: settings?.invoiceNumber ?? null,
      email: settings?.email ?? null,
      phoneNumber: settings?.phoneNumber ?? null,
      postalCode: settings?.postalCode ?? null,
      prefecture: settings?.prefecture ?? null,
      city: settings?.city ?? null,
      streetAddress: settings?.streetAddress ?? null,
      buildingName: settings?.buildingName ?? null,
    };
    initialTemplateHtml = applyBusinessInfo(template.content, businessInfo);
    initialTitle = template.label;
  }

  return (
    <AdminDetailLayout
      backHref="/admin/terms"
      title="規約を新規作成"
      subtitle={
        template
          ? `${template.label} のテンプレートから作成（事業者情報は Settings 値で自動置換済み）`
          : "新しい規約を白紙から登録します"
      }
    >
      <TermsForm
        key={typeValue}
        mode="create"
        initial={{
          type: typeValue,
          ...(initialTitle !== undefined && { title: initialTitle }),
        }}
        {...(initialTemplateHtml !== undefined && { initialTemplateHtml })}
      />
    </AdminDetailLayout>
  );
}
