import "server-only";

import { z } from "zod";
import {
  createSuccess,
  type ActionResult,
} from "@/admin/types/server-actions";
import { createValidationError } from "@/shared/lib/action-helpers";
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

const idSchema = z.string().uuid({ error: "IDが不正です" });
const agreementsSchema = z.object({
  termsId: z.string().uuid({ error: "規約IDが不正です" }),
  page: z.number().int().positive({ error: "ページ番号が不正です" }),
});

export async function getTermsList(): Promise<ActionResult<TermsWithVersion[]>> {
  await requireAdminPermission("terms", "read");
  const result = await getAdminTermsListQuery();
  return createSuccess("規約一覧を取得しました", result);
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

export async function getTermsById(
  id: string,
): Promise<ActionResult<TermsDetail | null>> {
  await requireAdminPermission("terms", "read");

  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationError(validated.error);
  }

  const terms = await getAdminTermsByIdQuery(validated.data);
  if (!terms) {
    return createSuccess("規約が見つかりませんでした", null);
  }

  return createSuccess("規約詳細を取得しました", terms);
}

export async function getTermsVersionById(
  versionId: string,
): Promise<ActionResult<TermsVersionDetail | null>> {
  await requireAdminPermission("terms", "read");

  const validated = idSchema.safeParse(versionId);
  if (!validated.success) {
    return createValidationError(validated.error);
  }

  const version = await getAdminTermsVersionByIdQuery(validated.data);
  return createSuccess("バージョン詳細を取得しました", version);
}

export async function getTermsAgreements(
  termsId: string,
  page: number,
): Promise<ActionResult<{ agreements: TermsAgreementItem[]; total: number }>> {
  await requireAdminPermission("terms", "read");

  const validated = agreementsSchema.safeParse({ termsId, page });
  if (!validated.success) {
    return createValidationError(validated.error);
  }

  const data = await getAdminTermsAgreementsQuery(
    validated.data.termsId,
    validated.data.page,
  );

  return createSuccess("同意記録を取得しました", data);
}
