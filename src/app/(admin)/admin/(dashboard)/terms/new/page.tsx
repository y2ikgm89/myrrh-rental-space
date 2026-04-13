import { redirect } from "next/navigation";
import { getSettings } from "@/admin/queries/settings";
import { TermsInlineEditor } from "../_components/TermsInlineEditor";
import { isValidTermsType } from "@/shared/lib/validations/enums/guards";
import { getTermsTypeDefaults } from "@/shared/lib/validations/terms";
import {
  getTemplatesForType,
  applyBusinessInfo,
  type BusinessInfo,
} from "@/shared/lib/terms-templates";
import type { TermsType } from "@generated/prisma/enums";
import type { Metadata } from "next";
import type { SearchParams } from "nuqs/server";

export const metadata: Metadata = {
  title: "規約作成 | Myrrh Rental Space",
};

function extractBusinessInfo(
  settings: Awaited<ReturnType<typeof getSettings>>,
): BusinessInfo {
  if (!settings) {
    return {
      businessName: null,
      email: null,
      phoneNumber: null,
      postalCode: null,
      prefecture: null,
      city: null,
      streetAddress: null,
      buildingName: null,
    };
  }
  return {
    businessName: settings.businessName,
    email: settings.email,
    phoneNumber: settings.phoneNumber,
    postalCode: settings.postalCode,
    prefecture: settings.prefecture,
    city: settings.city,
    streetAddress: settings.streetAddress,
    buildingName: settings.buildingName,
  };
}

/**
 * テンプレートがある場合、事業者情報適用済み HTML を返す
 * HTML → Lexical JSON 変換はクライアント側で行う（DOM が必要なため）
 */
function resolveTemplateHtml(
  type: TermsType,
  businessInfo: BusinessInfo,
): string | null {
  const templates = getTemplatesForType(type);
  const template = templates[0];
  if (!template) return null;

  return applyBusinessInfo(template.content, businessInfo);
}

interface PageProps {
  searchParams: Promise<SearchParams>;
}

export default async function NewTermsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const typeParam = typeof params["type"] === "string" ? params["type"] : null;

  // タイプ未指定またはバリデーション失敗→一覧にリダイレクト
  if (!typeParam || !isValidTermsType(typeParam)) {
    redirect("/admin/terms");
  }

  const settings = await getSettings();
  const businessInfo = extractBusinessInfo(settings);

  const defaults = getTermsTypeDefaults(typeParam);
  const templateHtml = resolveTemplateHtml(typeParam, businessInfo);

  return (
    <TermsInlineEditor
      mode="create"
      initialType={typeParam}
      initialTitle={defaults?.title ?? ""}
      initialSlug={defaults?.slug ?? ""}
      initialTemplateHtml={templateHtml}
    />
  );
}
