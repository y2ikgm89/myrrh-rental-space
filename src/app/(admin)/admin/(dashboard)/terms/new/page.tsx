import type { Metadata } from "next";
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
import { TermsInlineEditor } from "../_components/TermsInlineEditor";

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
    <TermsInlineEditor
      key={typeValue}
      mode="create"
      {...(initialTemplateHtml !== undefined && { initialTemplateHtml })}
      {...(initialTitle !== undefined && { initialTitle })}
    />
  );
}
