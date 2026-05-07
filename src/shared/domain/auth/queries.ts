import "server-only";

import { prisma } from "@/shared/db/prisma";
import { isEncrypted, safeDecrypt } from "@/shared/lib/crypto";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory } from "@/shared/lib/errors/server";
import { reEncryptLegacyOAuthToken } from "./commands";

export type GoogleOAuthAccountRecord = {
  id: string;
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: Date | null;
};

/**
 * 暗号化済みなら復号、平文（Better Auth が直書きした legacy 値）ならそのまま返す。
 *
 * legacy 値を読み出した場合は背後で再暗号化を予約し、漸進的に at-rest 暗号化へ収束させる
 * （migration スクリプト不要、OAuth refresh / token rotate のたびに自動的に encrypt 化）。
 */
function readOAuthToken(
  accountId: string,
  field: "accessToken" | "refreshToken",
  raw: string | null,
): string | null {
  if (!raw) return null;
  if (!isEncrypted(raw)) {
    fireAndForget(reEncryptLegacyOAuthToken(accountId, field, raw), {
      operation: "reEncryptLegacyOAuthToken",
      category: ErrorCategory.UNKNOWN,
    });
    return raw;
  }
  return safeDecrypt(raw);
}

export async function getGoogleOAuthAccount(
  userId: string,
): Promise<GoogleOAuthAccountRecord | null> {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      providerId: "google",
    },
    select: {
      id: true,
      accessToken: true,
      refreshToken: true,
      accessTokenExpiresAt: true,
    },
  });
  if (!account) return null;
  return {
    id: account.id,
    accessToken: readOAuthToken(account.id, "accessToken", account.accessToken),
    refreshToken: readOAuthToken(
      account.id,
      "refreshToken",
      account.refreshToken,
    ),
    accessTokenExpiresAt: account.accessTokenExpiresAt,
  };
}
