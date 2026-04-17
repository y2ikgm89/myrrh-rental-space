import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { getEmailTemplate } from "@/shared/domain/email-templates/queries";
import { getTemplateVariables } from "@/shared/lib/email/template-registry";
import {
  EMAIL_TEMPLATE_TYPE_LABELS,
  isValidEmailTemplateType,
} from "@/shared/lib/validations/enums/helpers";
import { EmailTemplateForm } from "./_components/EmailTemplateForm";

export const metadata: Metadata = {
  title: "メールテンプレート編集",
};

type PageProps = {
  params: Promise<{ type: string }>;
};

export default async function EmailTemplateEditPage({ params }: PageProps) {
  const { type } = await params;

  if (!isValidEmailTemplateType(type)) {
    notFound();
  }

  const typedType = type;
  const template = await getEmailTemplate(typedType);
  if (!template) {
    notFound();
  }

  const variables = getTemplateVariables(typedType);
  const label = EMAIL_TEMPLATE_TYPE_LABELS[typedType];

  return (
    <AdminDetailLayout
      backHref="/admin/settings/email-templates"
      title={label}
      subtitle="件名・挨拶文・導入文・締め文を編集できます"
    >
      <EmailTemplateForm
        type={typedType}
        template={template}
        variables={variables}
      />
    </AdminDetailLayout>
  );
}
