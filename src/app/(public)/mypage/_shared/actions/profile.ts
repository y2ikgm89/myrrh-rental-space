"use server";

import { z } from "zod";
import { getSession } from "@/shared/lib/auth";
import { updateCustomerProfileByUserId } from "@/shared/domain/customers/commands";
import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";

const profileSchema = z.object({
  lastName: z.string().min(1, { error: "姓を入力してください" }),
  firstName: z.string().min(1, { error: "名を入力してください" }),
  phoneNumber: z.string().nullable(),
});

export async function updateProfileAction(
  formData: FormData,
): Promise<{ success: true } | { error: string }> {
  const session = await getSession();
  if (!session) return { error: "認証が必要です" };

  const raw = {
    lastName: formData.get("lastName"),
    firstName: formData.get("firstName"),
    phoneNumber: formData.get("phoneNumber") || null,
  };

  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) return { error: "入力内容を確認してください" };

  await updateCustomerProfileByUserId(session.user.id, parsed.data);

  updateTag(CACHE_TAGS.CUSTOMERS);

  return { success: true };
}
