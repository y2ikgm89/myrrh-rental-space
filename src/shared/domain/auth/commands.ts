import "server-only";

import { prisma } from "@/shared/db/prisma";
import { encryptOAuthToken, isEncrypted } from "@/shared/lib/crypto";
import { omitUndefined } from "@/shared/lib/serialize";

/**
 * application 層から書き込む全 OAuth token は AES-256-GCM + HKDF (purpose="oauth-google") で
 * 暗号化して保存する（at-rest encryption）。読み出しは `getGoogleOAuthAccount` が透過的に復号する。
 */
export async function updateGoogleOAuthAccountTokens(input: {
  accountId: string;
  accessToken: string;
  refreshToken?: string | null;
  expiryDate?: number;
}): Promise<void> {
  await prisma.account.update({
    where: { id: input.accountId },
    data: omitUndefined({
      accessToken: encryptOAuthToken(input.accessToken),
      refreshToken:
        input.refreshToken === undefined
          ? undefined
          : input.refreshToken === null
            ? null
            : encryptOAuthToken(input.refreshToken),
      accessTokenExpiresAt: input.expiryDate
        ? new Date(input.expiryDate)
        : undefined,
    }),
  });
}

/**
 * Better Auth が直書きした legacy plaintext token を背後で再暗号化する
 * （`getGoogleOAuthAccount` の transparent migration から fireAndForget 呼び出し）。
 *
 * 競合条件で別書き込みが先行した場合（既に encrypted state、値が変わっている）は no-op。
 */
export async function reEncryptLegacyOAuthToken(
  accountId: string,
  field: "accessToken" | "refreshToken",
  plaintext: string,
): Promise<void> {
  const current = await prisma.account.findUnique({
    where: { id: accountId },
    select: { accessToken: true, refreshToken: true },
  });
  if (!current) return;
  const value =
    field === "accessToken" ? current.accessToken : current.refreshToken;
  if (typeof value !== "string" || isEncrypted(value)) {
    return;
  }
  if (value !== plaintext) {
    return;
  }
  const encrypted = encryptOAuthToken(plaintext);
  await prisma.account.update({
    where: { id: accountId },
    data:
      field === "accessToken"
        ? { accessToken: encrypted }
        : { refreshToken: encrypted },
  });
}
