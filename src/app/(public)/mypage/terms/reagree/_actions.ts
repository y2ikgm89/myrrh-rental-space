"use server";

import type { SubmissionResult } from "@conform-to/react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { verifyCustomerSession } from "@/shared/lib/customer-auth";
import { ensureCustomerLinked } from "@/shared/domain/customers/link";
import { assertCustomerActive } from "@/shared/domain/customers/guard";
import { DomainError } from "@/shared/domain/domain-error";
import { getReagreeRequiredTermsForCustomer } from "@/shared/domain/terms/queries";
import { recordTermsAgreementsCommand } from "@/shared/domain/terms/commands";
import { TermsScope } from "@/shared/lib/validations/enums/prisma-types";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { getClientIpFromHeaders } from "@/shared/lib/rate-limit";
import { toAppRoute } from "@/shared/lib/routes/to-app-route";
import { reagreeFormSchema } from "./_lib/reagree-schema";
import { sanitizeReturnTo } from "./_lib/sanitize-return-to";

/**
 * LOGIN_SIGNUP scope の再同意 Server Action。
 *
 * client 入力は信用せず、handler 内で:
 *   1. session を再検証 (`verifyCustomerSession` + `ensureCustomerLinked`)
 *   2. `getReagreeRequiredTermsForCustomer` で pending を再導出
 *   3. client の agreedTermsIds ⊇ pending termsIds を強制 (curl bypass 防止)
 *   4. `recordTermsAgreementsCommand(scope: LOGIN_SIGNUP)` で append-only insert
 *   5. 成功後 `sanitizeReturnTo` を経由して returnTo へ redirect
 *
 * 失敗時 (DomainError / VALIDATION) は `submission.reply({ formErrors })` で
 * client に返却し、form は入力を保持する。
 */
export async function reagreeAction(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, reagreeFormSchema, async (input) => {
    const { user } = await verifyCustomerSession();
    const { customer } = await ensureCustomerLinked(user);

    try {
      await assertCustomerActive(customer.id);
    } catch (error) {
      if (error instanceof DomainError) {
        return { ok: false, error: error.message };
      }
      throw error;
    }

    const pending = await getReagreeRequiredTermsForCustomer(customer.id);
    if (pending.length === 0) {
      // すでに同意済み (別タブで同意完了・DB 直修正等) — 差分ゼロ化しているだけなので
      // form エラーにはせず即 redirect する。
      revalidatePath("/mypage");
      redirect(toAppRoute(sanitizeReturnTo(input.returnTo)));
    }

    const pendingIds = new Set(pending.map((p) => p.id));
    const agreedIds = new Set(input.agreedTermsIds);
    const missing = [...pendingIds].filter((id) => !agreedIds.has(id));
    if (missing.length > 0) {
      return {
        ok: false,
        error: "すべての規約に同意する必要があります",
      };
    }

    const acceptedIds = [...pendingIds];
    const clientIp = await getClientIpFromHeaders();
    const headersList = await headers();
    const userAgent = headersList.get("user-agent");

    await recordTermsAgreementsCommand({
      termsIds: acceptedIds,
      scope: TermsScope.LOGIN_SIGNUP,
      customerId: customer.id,
      ipAddress: clientIp,
      userAgent: userAgent ?? null,
    });

    revalidatePath("/mypage");
    redirect(toAppRoute(sanitizeReturnTo(input.returnTo)));
  });
}
