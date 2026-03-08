"use server";

import { z } from "zod";
import { createSuccess, type ActionResult } from "@/admin/types/server-actions";
import { createValidationError } from "@/shared/lib/action-helpers";
import { checkReadPermissionFor } from "@/admin/lib/permissions";
import { withPermission } from "@/admin/lib/server-action-helpers";
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

const checkReadPermission = checkReadPermissionFor("terms");
const idSchema = z.string().uuid({ error: "IDが不正です" });
const agreementsSchema = z.object({
  termsId: z.string().uuid({ error: "規約IDが不正です" }),
  page: z.number().int().positive({ error: "ページ番号が不正です" }),
});

export const getTermsList = withPermission<[], TermsWithVersion[]>(
  "terms",
  "read",
)(async (): Promise<ActionResult<TermsWithVersion[]>> => {
  const result = await getAdminTermsListQuery();
  return createSuccess("規約一覧を取得しました", result);
});

export async function getActiveTermsForSelect(): Promise<
  { id: string; title: string; type: string }[]
> {
  if (!(await checkReadPermission())) {
    return [];
  }

  return getActiveTermsForSelectOptionsQuery();
}

export async function getDefaultsForTermsType(
  type: string,
): Promise<{ title: string; slug: string } | null> {
  if (!(await checkReadPermission())) {
    return null;
  }

  return getTermsDefaultsForTypeQuery(type);
}

export const getTermsById = withPermission<[string], TermsDetail | null>(
  "terms",
  "read",
)(async (_user, id): Promise<ActionResult<TermsDetail | null>> => {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationError(validated.error);
  }

  const terms = await getAdminTermsByIdQuery(validated.data);
  if (!terms) {
    return createSuccess("規約が見つかりませんでした", null);
  }

  return createSuccess("規約詳細を取得しました", terms);
});

export const getTermsVersionById = withPermission<
  [string],
  TermsVersionDetail | null
>(
  "terms",
  "read",
)(async (_user, versionId): Promise<ActionResult<TermsVersionDetail | null>> => {
  const validated = idSchema.safeParse(versionId);
  if (!validated.success) {
    return createValidationError(validated.error);
  }

  const version = await getAdminTermsVersionByIdQuery(validated.data);
  return createSuccess("バージョン詳細を取得しました", version);
});

export const getTermsAgreements = withPermission<
  [string, number],
  { agreements: TermsAgreementItem[]; total: number }
>(
  "terms",
  "read",
)(async (
  _user,
  termsId,
  page,
): Promise<ActionResult<{ agreements: TermsAgreementItem[]; total: number }>> => {
  const validated = agreementsSchema.safeParse({ termsId, page });
  if (!validated.success) {
    return createValidationError(validated.error);
  }

  const data = await getAdminTermsAgreementsQuery(
    validated.data.termsId,
    validated.data.page,
  );

  return createSuccess("同意記録を取得しました", data);
});
