"use server";

import { headers } from "next/headers";
import { getSession, auth } from "@/shared/lib/auth";
import { getAccountProviders } from "@/shared/domain/users/queries";

export async function getAccountLinksAction(): Promise<
  { accounts: string[] } | { error: string }
> {
  const session = await getSession();
  if (!session) return { error: "認証が必要です" };

  const providers = await getAccountProviders(session.user.id);
  return { accounts: providers };
}

export async function deleteAccountAction(): Promise<
  { success: true } | { error: string }
> {
  const session = await getSession();
  if (!session) return { error: "認証が必要です" };

  try {
    await auth.api.deleteUser({
      headers: await headers(),
      body: {},
    });
    return { success: true };
  } catch {
    return { error: "アカウントの削除に失敗しました" };
  }
}
