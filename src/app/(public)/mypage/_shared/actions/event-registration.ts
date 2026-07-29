"use server";

import type { SubmissionResult } from "@conform-to/react";
import { getCustomerSession } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { assertCustomerActive } from "@/shared/domain/customers/guard";
import { assertLoginSignupReagreed } from "@/shared/domain/terms/consent-gate";
import { isFeatureEnabled } from "@/shared/domain/features/check";
import { createEventCheckoutSessionCommand } from "@/shared/domain/events/payment-commands";
import { updateCustomerEventRegistration } from "@/shared/domain/events/registration-commands";
import { applyEventRegistrationSelfServeUpdateSideEffects } from "@/shared/domain/events/registration-update-side-effects";
import { getEventRegistrationForCustomerEdit } from "@/shared/domain/events/registration-queries";
import { invalidateEventCaches } from "@/shared/lib/cache/event-cache";
import { checkActionRateLimit } from "@/shared/lib/action-helpers";
import {
  createMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import {
  editByEventRegistrationRateLimiter,
  formSubmitRateLimiter,
} from "@/shared/lib/rate-limit";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import { validateTurnstile } from "@/shared/domain/settings/turnstile";
import { eventRegistrationEditSchema } from "@/shared/lib/validations/event-registration";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { DomainError } from "@/shared/domain/domain-error";
import { getPublicMaintenanceBlockMutation } from "@/shared/domain/settings/maintenance-guard";
import { prismaCuidIdSchema } from "@/shared/lib/validations/params";

const registrationIdSchema = prismaCuidIdSchema("イベント参加申込");

export async function updateCustomerEventRegistrationAction(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    eventRegistrationEditSchema,
    async (data) => {
      const maintenanceBlock = await getPublicMaintenanceBlockMutation();
      if (maintenanceBlock) {
        return { ok: false, error: maintenanceBlock.error };
      }

      const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
      if (!rateLimit.success) {
        return { ok: false, error: "リクエストが多すぎます" };
      }

      const turnstile = await validateTurnstile({
        token: data.turnstileToken,
        expectedAction: TURNSTILE_ACTIONS.mypage_event_registration_edit,
      });
      if (!turnstile.success) {
        return { ok: false, error: turnstile.error };
      }

      const session = await getCustomerSession();
      if (!session) {
        return { ok: false, error: "認証が必要です" };
      }

      const customer = await getCustomerByUserId(session.user.id);
      if (!customer) {
        return { ok: false, error: "顧客情報が見つかりません" };
      }

      if (!(await isFeatureEnabled("events"))) {
        return {
          ok: false,
          error: "この機能は現在利用できません。管理者にお問い合わせください。",
        };
      }

      const perRegistration = await editByEventRegistrationRateLimiter.check(
        data.registrationId,
      );
      if (!perRegistration.success) {
        return {
          ok: false,
          error:
            "この申込に対する変更試行が多すぎます。しばらく時間をおいてからお試しください",
        };
      }

      try {
        await assertCustomerActive(customer.id);
        await assertLoginSignupReagreed(customer.id);

        const registration = await getEventRegistrationForCustomerEdit(
          data.registrationId,
          customer.id,
        );
        if (!registration) {
          return { ok: false, error: "申込が見つかりません" };
        }

        const result = await updateCustomerEventRegistration(
          data.registrationId,
          customer.id,
          {
            name: data.name,
            email: data.email,
            phone: data.phone ?? null,
            note: data.note ?? null,
            quantity: data.quantity,
          },
        );

        if (!result.success) {
          return { ok: false, error: result.error };
        }

        invalidateEventCaches();

        await applyEventRegistrationSelfServeUpdateSideEffects({
          registrationId: data.registrationId,
          eventId: registration.eventId,
          customerId: registration.customerId,
          channel: "customer-mypage",
          actorUserId: session.user.id,
          payload: result.payload,
          emailContext: {
            eventTitle: registration.event.title,
            eventStartTime: registration.slot.startAt,
            eventEndTime: registration.slot.endAt,
            ticketName: registration.ticket.name,
            ticketUnitPrice: registration.ticket.price,
          },
          newValues: {
            name: data.name,
            email: data.email,
            phone: data.phone ?? null,
            note: data.note ?? null,
            quantity: data.quantity,
          },
        });

        return { ok: true };
      } catch (error) {
        if (error instanceof DomainError) {
          return { ok: false, error: error.message };
        }
        throw error;
      }
    },
  );
}

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
