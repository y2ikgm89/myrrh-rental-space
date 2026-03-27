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
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { DomainError } from "@/shared/domain/domain-error";

function invalidateReservationCache(): void {
  updateTag(CACHE_TAGS.RESERVATIONS);
  updateTag(getCacheTag.reservations.list());
  updateTag(getCacheTag.reservations.calendar());
}

export async function cancelReservationAction(
  reservationId: string,
): Promise<MutationResult<null>> {
  const session = await getSession();
  if (!session) return createMutationError("認証が必要です");

  const customer = await getCustomerByUserId(session.user.id);
  if (!customer) return createMutationError("顧客情報が見つかりません");

  try {
    const settings = await getReservationDeadlineSettings();
    const result = await cancelCustomerReservation(
      reservationId,
      customer.id,
      settings.cancellationDeadlineHours,
    );

    if (!result.success) return createMutationError(result.error);

    invalidateReservationCache();
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

    invalidateReservationCache();
    return null;
  } catch (error) {
    if (error instanceof DomainError) {
      return createMutationError(error.message);
    }
    throw error;
  }
}
