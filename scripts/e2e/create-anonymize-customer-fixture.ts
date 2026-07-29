import { createScriptPrismaClient } from "../_shared/script-prisma";
import { resolveTestDatabaseUrl } from "../test-db-url";

process.env["DATABASE_URL"] = resolveTestDatabaseUrl(
  process.env["TEST_DATABASE_URL"],
).url;

async function main(): Promise<void> {
  const { prisma, disconnect } = createScriptPrismaClient();

  try {
    const unique = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const email = `e2e-anonymize-${unique}@example.com`;

    const customer = await prisma.customer.create({
      data: {
        email,
        emailCanonical: email,
        lastName: "匿名化E2E",
        firstName: "対象",
        userId: null,
      },
      select: { id: true, lastName: true, firstName: true, email: true },
    });

    console.log(
      JSON.stringify({
        customerId: customer.id,
        displayName: `${customer.lastName} ${customer.firstName}`,
        email: customer.email,
      }),
    );
  } finally {
    await disconnect();
  }
}

try {
  await main();
} catch (error) {
  console.error(
    "❌ create-anonymize-customer-fixture failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}
