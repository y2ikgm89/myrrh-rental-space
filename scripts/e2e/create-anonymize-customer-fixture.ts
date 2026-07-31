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
  // Playwright 側は `execFile` の解決を待つ。メール送信の detached promise や
  // pg pool のハンドルが残るとイベントループが空にならず、プロセスが終了せず
  // spec が丸ごとタイムアウトする（run 30595374008 の waitlist-offer-confirm は
  // 90 s 上限でもこれ）。stdout は書き終わっているので明示的に終了する。
  process.exit(0);
} catch (error) {
  console.error(
    "❌ create-anonymize-customer-fixture failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}
