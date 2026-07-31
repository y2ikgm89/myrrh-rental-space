import { asPrismaInputJsonValue } from "@/shared/db/prisma-input-json";
import { createScriptPrismaClient } from "../_shared/script-prisma";
import { resolveTestDatabaseUrl } from "../test-db-url";

process.env["DATABASE_URL"] = resolveTestDatabaseUrl(
  process.env["TEST_DATABASE_URL"],
).url;

const DEV_CUSTOMER_EMAIL = "dev-customer@example.com";

function generateFixtureSerialNo(): string {
  const rand = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `2099-${rand}`;
}

async function main(): Promise<void> {
  const { prisma, disconnect } = createScriptPrismaClient();

  try {
    const customer = await prisma.customer.findFirstOrThrow({
      where: { email: DEV_CUSTOMER_EMAIL },
      select: { id: true, lastName: true, firstName: true },
    });

    const reservation = await prisma.reservation.findFirst({
      where: {
        customerId: customer.id,
        status: "COMPLETED",
        paymentStatus: "PAID",
        notes: { contains: "[E2E] 過去・決済済み" },
      },
      select: {
        id: true,
        totalPriceWithTax: true,
        taxAmount: true,
        taxRate: true,
      },
    });

    if (!reservation || reservation.totalPriceWithTax === null) {
      throw new Error(
        "dev customer の COMPLETED+PAID 予約が見つかりません。seed を実行してください。",
      );
    }

    const existingReceipt = await prisma.receipt.findFirst({
      where: { reservationId: reservation.id },
      select: { serialNo: true },
    });

    const serialNo = existingReceipt?.serialNo ?? generateFixtureSerialNo();

    if (!existingReceipt) {
      await prisma.receipt.create({
        data: {
          serialNo,
          reservationId: reservation.id,
          recipientName: `${customer.lastName} ${customer.firstName}`,
          subject: "スペース利用料として",
          amount: reservation.totalPriceWithTax,
          taxAmount: reservation.taxAmount ?? 0,
          taxRate: reservation.taxRate ?? 10,
          issuerSnapshot: asPrismaInputJsonValue(
            {
              businessName: "株式会社サンプル",
              representativeName: "山田 太郎",
              registrationNumber: "1234567890123",
              invoiceNumber: "T1234567890123",
              email: "info@example.com",
              phoneNumber: "03-1234-5678",
              address: {
                postalCode: "150-0001",
                prefecture: "東京都",
                city: "渋谷区",
                streetAddress: "神宮前1-1-1",
              },
              snapshotAt: new Date().toISOString(),
            },
            "fixture issuerSnapshot が不正です",
          ),
        },
      });
    }

    console.log(
      JSON.stringify({
        reservationId: reservation.id,
        serialNo,
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
    "❌ create-mypage-receipt-fixture failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}
