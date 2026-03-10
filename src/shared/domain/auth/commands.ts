import "server-only";

import { prisma } from "@/shared/db/prisma";
import { omitUndefined } from "@/shared/lib/serialize";

export async function updateGoogleOAuthAccountTokens(input: {
  accountId: string;
  accessToken: string;
  refreshToken?: string | null;
  expiryDate?: number;
}): Promise<void> {
  await prisma.account.update({
    where: { id: input.accountId },
    data: omitUndefined({
      accessToken: input.accessToken,
      refreshToken: input.refreshToken ?? undefined,
      accessTokenExpiresAt: input.expiryDate
        ? new Date(input.expiryDate)
        : undefined,
    }),
  });
}
