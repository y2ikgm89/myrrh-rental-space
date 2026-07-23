"use server";

import { getCustomerSession } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { assertCustomerActive } from "@/shared/domain/customers/guard";
import { assertLoginSignupReagreed } from "@/shared/lib/terms-consent-gate";
import { isFeatureEnabled } from "@/shared/lib/features/check";
import { createEventCheckoutSessionCommand } from "@/shared/domain/events/payment-commands";
import { invalidateEventCaches } from "@/shared/lib/cache/event-cache";
import { checkActionRateLimit } from "@/shared/lib/action-helpers";
import {
  createMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import { formSubmitRateLimiter } from "@/shared/lib/rate-limit";
import { DomainError } from "@/shared/domain/domain-error";
import { prismaCuidIdSchema } from "@/shared/lib/validations/params";

const registrationIdSchema = prismaCuidIdSchema("イベント参加申込");

/**
 * 公開マイページからイベント申込の Stripe Checkout Session を開始する。
 *
 * `createEventCheckoutSessionCommand` に Better Auth 認証済み Customer.id を渡し、
 * 他人の registrationId で checkout 作成する IDOR を封鎖する。
 */
export async function startEventCheckoutSessionAction(
  registrationId: string,
): Promise<MutationResult<{ sessionUrl: string | null }>> {
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError("リクエストが多すぎます");

  const parsedId = registrationIdSchema.safeParse(registrationId);
  if (!parsedId.success) return createMutationError("申込IDが不正です");

  const session = await getCustomerSession();
  if (!session) return createMutationError("認証が必要です");

  const customer = await getCustomerByUserId(session.user.id);
  if (!customer) return createMutationError("顧客情報が見つかりません");

  if (!(await isFeatureEnabled("events"))) {
    return createMutationError(
      "この機能は現在利用できません。管理者にお問い合わせください。",
    );
  }
  if (!(await isFeatureEnabled("payment"))) {
    return createMutationError(
      "オンライン決済は現在利用できません。管理者にお問い合わせください。",
    );
  }

  try {
    await assertCustomerActive(customer.id);
    await assertLoginSignupReagreed(customer.id);
    const result = await createEventCheckoutSessionCommand({
      registrationId: parsedId.data,
      actorCustomerId: customer.id,
    });
    invalidateEventCaches();
    return { sessionUrl: result.sessionUrl };
  } catch (error) {
    if (error instanceof DomainError) {
      return createMutationError(error.message);
    }
    throw error;
  }
}
