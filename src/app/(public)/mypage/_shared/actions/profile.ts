"use server";

import { getSession } from "@/shared/lib/auth";
import { updateCustomerProfileByUserId } from "@/shared/domain/customers/commands";
import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";
import {
  createMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import {
  customerProfileSchema,
  type CustomerProfileInput,
} from "@/shared/lib/validations/customer-profile";

export async function updateProfileAction(
  input: CustomerProfileInput,
): Promise<MutationResult<null>> {
  const session = await getSession();
  if (!session) return createMutationError("認証が必要です");

  const parsed = customerProfileSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  await updateCustomerProfileByUserId(session.user.id, {
    lastName: parsed.data.lastName,
    firstName: parsed.data.firstName,
    phoneNumber: parsed.data.phoneNumber || null,
  });

  updateTag(CACHE_TAGS.CUSTOMERS);

  return null;
}
