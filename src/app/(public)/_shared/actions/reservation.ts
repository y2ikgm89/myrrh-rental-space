"use server";

import { z } from "zod";
import { updateTag } from "next/cache";
import {
  publicReservationSchema,
  type PublicReservationInput,
} from "@/shared/lib/validations/public-reservation";
import { headers } from "next/headers";
import {
  checkActionRateLimit,
  createValidationMutationError,
  validateTurnstile,
} from "@/shared/lib/action-helpers";
import {
  formSubmitRateLimiter,
  getClientIpFromHeaders,
  publicQueryRateLimiter,
} from "@/shared/lib/rate-limit";
import {
  createMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import { createPublicReservationCommand } from "@/shared/domain/reservations/commands";
import { sendReservationAdminNotification } from "@/shared/lib/email/reservation-emails";
import { fireAndForget } from "@/shared/lib/async-utils";
import { omitUndefined } from "@/shared/lib/serialize";
import { ErrorCategory } from "@/shared/lib/errors/server";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import { NOTIFICATION_TYPE } from "@/shared/lib/validations/enums/helpers";
import { DomainError } from "@/shared/domain/domain-error";
import { verifySpaceBelongsToLocation } from "@/shared/domain/spaces/public-queries";
import { getCurrentCustomerUser } from "@/shared/lib/customer-auth";
import {
  getReservationRequiredTerms,
  type ReservationTermsSummary,
} from "@/shared/domain/terms/public-queries";
import type { Serialized } from "@/shared/lib/serialize";

export async function fetchRequiredTerms(
  spaceId: string,
): Promise<Serialized<ReservationTermsSummary[]>> {
  const rateLimit = await checkActionRateLimit(publicQueryRateLimiter);
  if (!rateLimit.success) return [];

  const parsed = z.string().uuid().safeParse(spaceId);
  if (!parsed.success) return [];

  return getReservationRequiredTerms(parsed.data);
}

export async function submitReservation(
  input: PublicReservationInput,
): Promise<MutationResult<{ id: string }>> {
  // 1. Rate limit check
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError(rateLimit.error);

  // 2. Validate input
  const parsed = publicReservationSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  // 3. Turnstile verification
  const turnstile = await validateTurnstile(parsed.data.turnstileToken);
  if (!turnstile.success) {
    return createMutationError(turnstile.error);
  }

  // 3.5. Verify space belongs to location
  const belongsToLocation = await verifySpaceBelongsToLocation(
    parsed.data.spaceId,
    parsed.data.locationId,
  );
  if (!belongsToLocation) {
    return createMutationError(
      "選択されたスペースは指定された場所に属していません",
    );
  }

  // 4. Get current user (non-blocking — undefined if not logged in)
  const user = await getCurrentCustomerUser();

  // 4.5. Extract client IP and user agent for terms audit trail
  const clientIp = await getClientIpFromHeaders();
  const headersList = await headers();
  const userAgent = headersList.get("user-agent");

  // 5. Create reservation
  try {
    const result = await createPublicReservationCommand({
      ...parsed.data,
      userId: user?.id,
      clientIp,
      userAgent,
    });

    // 6. Invalidate cache: reservations (detail + calendar) + customers
    updateTag(CACHE_TAGS.RESERVATIONS);
    updateTag(getCacheTag.reservations.detail(result.id));
    updateTag(getCacheTag.reservations.calendar());
    updateTag(CACHE_TAGS.CUSTOMERS);
    if (result.customerId) {
      updateTag(getCacheTag.customers.detail(result.customerId));
    }

    // 7. Send admin notification email (fire-and-forget)
    fireAndForget(
      sendReservationAdminNotification(omitUndefined(result.payload), "new"),
      {
        operation: "sendReservationAdminNotification",
        category: ErrorCategory.EXTERNAL_API,
      },
    );

    // 8. Create admin notification (fire-and-forget)
    fireAndForget(
      createNotificationCommand({
        type: NOTIFICATION_TYPE.RESERVATION_NEW,
        title: "新規予約",
        message: `${result.payload.customerName}様が${result.payload.spaceName}を予約しました`,
        resourceType: "reservation",
        resourceId: result.id,
      }),
      {
        operation: "createReservationNotification",
        category: ErrorCategory.DATABASE,
      },
    );
    updateTag(CACHE_TAGS.NOTIFICATIONS);

    return { id: result.id };
  } catch (error) {
    if (error instanceof DomainError) {
      return createMutationError(error.message);
    }
    throw error;
  }
}
