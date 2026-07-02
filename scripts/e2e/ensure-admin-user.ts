import { Role } from "../../generated/prisma/enums";
import { testUsers } from "../../e2e/fixtures";
import { withScript } from "../_shared/script-prisma";

await withScript("ensure-admin-user", async (prisma) => {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email: testUsers.admin.email },
      update: {
        name: testUsers.admin.name,
        role: Role.SUPER_ADMIN,
        emailVerified: true,
      },
      create: {
        email: testUsers.admin.email,
        name: testUsers.admin.name,
        role: Role.SUPER_ADMIN,
        emailVerified: true,
      },
      select: { id: true },
    });

    await tx.account.deleteMany({
      where: {
        userId: user.id,
        providerId: "credential",
      },
    });

    await tx.loginAttempt.deleteMany({
      where: {
        email: testUsers.admin.email,
      },
    });
  });
});
