import "server-only";

import { prisma } from "@/shared/db/prisma";

export type GoogleOAuthAccountRecord = {
  id: string;
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: Date | null;
};

export async function getGoogleOAuthAccount(
  userId: string,
): Promise<GoogleOAuthAccountRecord | null> {
  return prisma.account.findFirst({
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
}
