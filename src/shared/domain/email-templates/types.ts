import type { EmailTemplateType } from "@/shared/lib/validations/enums/helpers";

export type EmailTemplate = {
  id: string;
  type: EmailTemplateType;
  subject: string;
  greeting: string;
  intro: string;
  outro: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EmailTemplateUpdate = {
  subject: string;
  greeting: string;
  intro: string;
  outro: string;
  enabled: boolean;
};
