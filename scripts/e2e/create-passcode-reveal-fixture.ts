import { asPrismaInputJsonValue } from "@/shared/db/prisma-input-json";
import { encrypt } from "@/shared/lib/crypto";
import { PASSCODE_CRYPTO_PURPOSE } from "@/shared/domain/smart-lock/issue-passcode";
import { SmartLockDeviceType } from "@generated/prisma/enums";
import { createScriptPrismaClient } from "../_shared/script-prisma";
import { resolveTestDatabaseUrl } from "../test-db-url";

process.env["DATABASE_URL"] = resolveTestDatabaseUrl(
  process.env["TEST_DATABASE_URL"],
).url;

process.env["ENCRYPTION_KEY"] = process.env["ENCRYPTION_KEY"] || "0".repeat(64);

const DEV_CUSTOMER_EMAIL = "dev-customer@example.com";
const E2E_PASSCODE = "654321";
const E2E_NOW = new Date("2026-08-01T02:00:00.000Z");
const PASSCODE_START = new Date("2026-08-01T00:45:00.000Z");
const PASSCODE_END = new Date("2026-08-01T03:15:00.000Z");
const RESERVATION_START = new Date("2026-08-01T01:00:00.000Z");
const RESERVATION_END = new Date("2026-08-01T03:00:00.000Z");

async function main(): Promise<void> {
  const { prisma, disconnect } = createScriptPrismaClient();

  try {
    const customer = await prisma.customer.findFirstOrThrow({
      where: { email: DEV_CUSTOMER_EMAIL },
      select: { id: true },
    });

    await prisma.settingsSwitchbot.upsert({
      where: { id: "singleton" },
      create: { switchbotEnabled: true },
      update: { switchbotEnabled: true },
    });

    const space = await prisma.space.findFirstOrThrow({
      where: { isActive: true, isPublished: true },
      select: {
        id: true,
        name: true,
        locationId: true,
        smartLockDeviceId: true,
      },
    });

    const unique = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    let deviceId = space.smartLockDeviceId;

    if (!deviceId) {
      const device = await prisma.smartLockDevice.create({
        data: {
          locationId: space.locationId,
          deviceId: `e2e-pad-${unique}`,
          deviceName: "E2Eテストキーパッド",
          deviceType: SmartLockDeviceType.KEYPAD_TOUCH,
          isActive: true,
        },
        select: { id: true },
      });
      deviceId = device.id;
      await prisma.space.update({
        where: { id: space.id },
        data: { smartLockDeviceId: deviceId },
      });
    }

    const totalPrice = 6000;
    const taxRate = 10;
    const taxAmount = Math.round((totalPrice * taxRate) / 100);

    const reservation = await prisma.reservation.create({
      data: {
        spaceId: space.id,
        customerId: customer.id,
        startTime: RESERVATION_START,
        endTime: RESERVATION_END,
        basePrice: totalPrice,
        totalPrice,
        taxRateType: "standard",
        taxRate,
        taxAmount,
        totalPriceWithTax: totalPrice + taxAmount,
        rateBreakdownJson: asPrismaInputJsonValue(
          {
            schemaVersion: 1,
            segments: [],
            totalHours: 0,
            totalBasePrice: 0,
            holidayFlags: {},
          },
          "fixture rateBreakdownJson が不正です",
        ),
        status: "CONFIRMED",
        paymentStatus: "PAID",
        notes: `[E2E] passcode reveal fixture ${unique}`,
      },
      select: { id: true },
    });

    const passcodeCiphertext = encrypt(E2E_PASSCODE, {
      purpose: PASSCODE_CRYPTO_PURPOSE,
    });

    await prisma.smartLockPasscode.create({
      data: {
        reservationId: reservation.id,
        deviceId,
        status: "CONFIRMED",
        passcodeCiphertext,
        switchbotKeyId: `e2e-key-${unique}`,
        startTime: PASSCODE_START,
        endTime: PASSCODE_END,
        confirmedAt: E2E_NOW,
      },
    });

    console.log(
      JSON.stringify({
        reservationId: reservation.id,
        spaceName: space.name,
        passcode: E2E_PASSCODE,
        fixedNowIso: E2E_NOW.toISOString(),
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
    "❌ create-passcode-reveal-fixture failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}
