import "server-only";

import { z } from "zod";
import {
  getActiveTermsForSelectOptions as getActiveTermsForSelectOptionsQuery,
  getAdminTermsAgreements as getAdminTermsAgreementsQuery,
  getAdminTermsById as getAdminTermsByIdQuery,
  getAdminTermsList as getAdminTermsListQuery,
  getAdminTermsVersionById as getAdminTermsVersionByIdQuery,
  getTermsDefaultsForType as getTermsDefaultsForTypeQuery,
} from "@/shared/domain/terms/admin-queries";
import type {
  TermsAgreementItem,
  TermsDetail,
  TermsVersionDetail,
  TermsWithVersion,
} from "@/shared/lib/validations/terms";
import { requireAdminPermission } from "./_helpers";

const agreementsSchema = z.object({
  termsId: z.string().uuid({ error: "規約IDが不正です" }),
  page: z.number().int().positive({ error: "ページ番号が不正です" }),
});

export async function getTermsList(): Promise<TermsWithVersion[]> {
  await requireAdminPermission("terms", "read");
  return getAdminTermsListQuery();
}

export async function getActiveTermsForSelect(): Promise<
  { id: string; title: string; type: string }[]
> {
  await requireAdminPermission("terms", "read");
  return getActiveTermsForSelectOptionsQuery();
}

export async function getDefaultsForTermsType(
  type: string,
): Promise<{ title: string; slug: string } | null> {
  await requireAdminPermission("terms", "read");
  return getTermsDefaultsForTypeQuery(type);
}

export async function getTermsById(id: string): Promise<TermsDetail | null> {
  await requireAdminPermission("terms", "read");
  return getAdminTermsByIdQuery(id);
}

export async function getTermsVersionById(
  versionId: string,
): Promise<TermsVersionDetail | null> {
  await requireAdminPermission("terms", "read");
  return getAdminTermsVersionByIdQuery(versionId);
}

export async function getTermsAgreements(
  termsId: string,
  page: number,
): Promise<{ agreements: TermsAgreementItem[]; total: number }> {
  await requireAdminPermission("terms", "read");

  const validated = agreementsSchema.safeParse({ termsId, page });
  if (!validated.success) {
    return { agreements: [], total: 0 };
  }

  return getAdminTermsAgreementsQuery(
    validated.data.termsId,
    validated.data.page,
  );
}
