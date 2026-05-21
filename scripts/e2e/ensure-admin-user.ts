import { hashPassword } from "better-auth/crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { Role } from "../../generated/prisma/enums";
import { adminCredentials, testUsers } from "../../e2e/fixtures";

const databaseUrl = process.env["DATABASE_URL"];

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 300_000,
    max: 2,
  }),
});

async function ensureAdminUser(): Promise<void> {
  const passwordHash = await hashPassword(adminCredentials.password);

  await prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({
      where: { email: adminCredentials.email },
      select: { id: true },
    });

    const userId = existingUser
      ? (
          await tx.user.update({
            where: { id: existingUser.id },
            data: {
              email: adminCredentials.email,
              name: testUsers.admin.name,
              role: Role.ADMIN,
              emailVerified: true,
            },
            select: { id: true },
          })
        ).id
      : (
          await tx.user.create({
            data: {
              email: adminCredentials.email,
              name: testUsers.admin.name,
              role: Role.ADMIN,
              emailVerified: true,
            },
            select: { id: true },
          })
        ).id;

    const credentialAccounts = await tx.account.findMany({
      where: {
        userId,
        providerId: "credential",
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });

    const primaryAccount = credentialAccounts[0];
    const duplicateAccountIds = credentialAccounts
      .slice(1)
      .map((account) => account.id);

    if (primaryAccount) {
      await tx.account.update({
        where: { id: primaryAccount.id },
        data: {
          accountId: adminCredentials.email,
          password: passwordHash,
        },
      });
    } else {
      await tx.account.create({
        data: {
          userId,
          accountId: adminCredentials.email,
          providerId: "credential",
          password: passwordHash,
        },
      });
    }

    if (duplicateAccountIds.length > 0) {
      await tx.account.deleteMany({
        where: {
          id: {
            in: duplicateAccountIds,
          },
        },
      });
    }

    await tx.loginAttempt.deleteMany({
      where: {
        email: adminCredentials.email,
      },
    });
  });
}

try {
  await ensureAdminUser();
} finally {
  await prisma.$disconnect();
}
