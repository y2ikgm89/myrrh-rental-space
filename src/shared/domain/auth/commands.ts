import "server-only";

import { prisma } from "@/shared/db/prisma";

export async function updateGoogleOAuthAccountTokens(input: {
  accountId: string;
  accessToken: string;
  refreshToken?: string | null;
  expiryDate?: number;
}): Promise<void> {
  await prisma.account.update({
    where: { id: input.accountId },
    data: {
      accessToken: input.accessToken,
      refreshToken: input.refreshToken ?? undefined,
      accessTokenExpiresAt: input.expiryDate
        ? new Date(input.expiryDate)
        : undefined,
    },
  });
}
