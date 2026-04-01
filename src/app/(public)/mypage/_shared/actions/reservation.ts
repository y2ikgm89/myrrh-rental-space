"use server";

import { getSession } from "@/shared/lib/auth";
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
import { updateTag } from "next/cache";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import {
  createMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import {
  createValidationMutationError,
  checkActionRateLimit,
} from "@/shared/lib/action-helpers";
import { formSubmitRateLimiter } from "@/shared/lib/rate-limit";
import { DomainError } from "@/shared/domain/domain-error";
import { z } from "zod";

const reservationIdSchema = z.string().uuid({ error: "予約IDが不正です" });

function invalidateReservationCache(
  reservationId: string,
  customerId: string,
): void {
  updateTag(CACHE_TAGS.RESERVATIONS);
  updateTag(getCacheTag.reservations.detail(reservationId));
  updateTag(getCacheTag.reservations.calendar());
  updateTag(CACHE_TAGS.CUSTOMERS);
  updateTag(getCacheTag.customers.detail(customerId));
}

export async function cancelReservationAction(
  reservationId: string,
  cancellationReason: string | null = null,
): Promise<MutationResult<null>> {
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError("リクエストが多すぎます");

  const parsedId = reservationIdSchema.safeParse(reservationId);
  if (!parsedId.success) return createMutationError("予約IDが不正です");

  const session = await getSession();
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

    invalidateReservationCache(parsedId.data, customer.id);
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

  const session = await getSession();
  if (!session) return createMutationError("認証が必要です");

  const customer = await getCustomerByUserId(session.user.id);
  if (!customer) return createMutationError("顧客情報が見つかりません");

  const parsed = customerReservationEditSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  try {
    const settings = await getReservationDeadlineSettings();
    const result = await updateCustomerReservation(
      parsed.data.reservationId,
      customer.id,
      parsed.data,
      settings.modificationDeadlineHours,
    );

    if (!result.success) return createMutationError(result.error);

    invalidateReservationCache(parsed.data.reservationId, customer.id);
    return null;
  } catch (error) {
    if (error instanceof DomainError) {
      return createMutationError(error.message);
    }
    throw error;
  }
}
