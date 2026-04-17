"use server";

import { getCustomerSession } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import {
  cancelCustomerReservation,
  updateCustomerReservation,
} from "@/shared/domain/reservations/customer-commands";
import { getReservationDeadlineSettings } from "@/shared/domain/settings/public-queries";
import {
  customerReservationEditSchema,
  type CustomerReservationEditInput,
} from "@/shared/lib/validations/customer-reservation";
import { invalidateReservationCaches } from "@/shared/lib/cache/reservation-cache";
import {
  createMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import {
  createValidationMutationError,
  checkActionRateLimit,
  validateTurnstile,
} from "@/shared/lib/action-helpers";
import { formSubmitRateLimiter } from "@/shared/lib/rate-limit";
import { DomainError } from "@/shared/domain/domain-error";
import { fireAndForget } from "@/shared/lib/async-utils";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { ErrorCategory } from "@/shared/lib/errors/server";
import { z } from "zod";

const reservationIdSchema = z.string().uuid({ error: "予約IDが不正です" });

export async function cancelReservationAction(
  reservationId: string,
  cancellationReason: string | null = null,
  turnstileToken?: string,
): Promise<MutationResult<null>> {
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError("リクエストが多すぎます");

  const turnstile = await validateTurnstile(turnstileToken);
  if (!turnstile.success) return createMutationError(turnstile.error);

  const parsedId = reservationIdSchema.safeParse(reservationId);
  if (!parsedId.success) return createMutationError("予約IDが不正です");

  const session = await getCustomerSession();
  if (!session) return createMutationError("認証が必要です");

  const customer = await getCustomerByUserId(session.user.id);
  if (!customer) return createMutationError("顧客情報が見つかりません");

  try {
    const settings = await getReservationDeadlineSettings();
    const trimmedReason =
      cancellationReason && cancellationReason.trim().length > 0
        ? cancellationReason.trim()
        : null;
    const result = await cancelCustomerReservation(
      parsedId.data,
      customer.id,
      settings.cancellationDeadlineHours,
      trimmedReason,
    );

    if (!result.success) return createMutationError(result.error);

    invalidateReservationCaches(parsedId.data, customer.id, {
      coupons: true,
      notifications: true,
    });

    // Create admin notification (fire-and-forget)
    fireAndForget(
      createNotificationCommand({
        type: NOTIFICATION_TYPE.RESERVATION_CANCEL,
        title: "顧客による予約キャンセル",
        message: `${customer.lastName}${customer.firstName}様が予約をキャンセルしました`,
        resourceType: "reservation",
        resourceId: parsedId.data,
      }),
      {
        operation: "createCustomerCancelNotification",
        category: ErrorCategory.DATABASE,
      },
    );

    return null;
  } catch (error) {
    if (error instanceof DomainError) {
      return createMutationError(error.message);
    }
    throw error;
  }
}

export async function updateReservationAction(
  input: CustomerReservationEditInput,
): Promise<MutationResult<null>> {
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError("リクエストが多すぎます");

  const session = await getCustomerSession();
  if (!session) return createMutationError("認証が必要です");

  const customer = await getCustomerByUserId(session.user.id);
  if (!customer) return createMutationError("顧客情報が見つかりません");

  const parsed = customerReservationEditSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  const turnstile = await validateTurnstile(parsed.data.turnstileToken);
  if (!turnstile.success) return createMutationError(turnstile.error);

  try {
    const settings = await getReservationDeadlineSettings();
    const result = await updateCustomerReservation(
      parsed.data.reservationId,
      customer.id,
      parsed.data,
      settings.modificationDeadlineHours,
    );

    if (!result.success) return createMutationError(result.error);

    invalidateReservationCaches(parsed.data.reservationId, customer.id, {
      coupons: true,
      notifications: true,
    });

    // Create admin notification (fire-and-forget)
    fireAndForget(
      createNotificationCommand({
        type: NOTIFICATION_TYPE.RESERVATION_UPDATE,
        title: NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.RESERVATION_UPDATE],
        message: `${customer.lastName}${customer.firstName}様が予約を変更しました`,
        resourceType: "reservation",
        resourceId: parsed.data.reservationId,
      }),
      {
        operation: "createCustomerUpdateNotification",
        category: ErrorCategory.DATABASE,
      },
    );

    return null;
  } catch (error) {
    if (error instanceof DomainError) {
      return createMutationError(error.message);
    }
    throw error;
  }
}
