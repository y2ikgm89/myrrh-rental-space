import {
  EventScheduleMode,
  EventStatus,
  RegistrationStatus,
} from "@generated/prisma/enums";
import {
  buildParagraphEditorStateJson,
  buildParagraphHtml,
} from "@/shared/lib/lexical/description-defaults";
import { stripHtmlToText } from "@/shared/lib/lexical/html-to-plain-text";
import { parsePrismaInputJson } from "@/shared/db/prisma-input-json";
import { createScriptPrismaClient } from "../_shared/script-prisma";
import { resolveTestDatabaseUrl } from "../test-db-url";

process.env["DATABASE_URL"] = resolveTestDatabaseUrl(
  process.env["TEST_DATABASE_URL"],
).url;

process.env["BETTER_AUTH_SECRET"] =
  process.env["BETTER_AUTH_SECRET"] &&
  process.env["BETTER_AUTH_SECRET"].length >= 32
    ? process.env["BETTER_AUTH_SECRET"]
    : "local-e2e-better-auth-secret-000000";

process.env["ENCRYPTION_KEY"] = process.env["ENCRYPTION_KEY"] || "0".repeat(64);

Bun.plugin({
  name: "stub-server-only",
  setup(build) {
    build.module("server-only", () => ({ exports: {}, loader: "object" }));
  },
});

const { createWaitlistOfferToken } =
  await import("@/shared/lib/tokens/waitlist-offer-token");

const DEV_CUSTOMER_EMAIL = "dev-customer@example.com";
const confirmRegistrationId = process.argv
  .find((arg) => arg.startsWith("--confirm="))
  ?.split("=", 2)[1];

async function main(): Promise<void> {
  const { prisma, disconnect } = createScriptPrismaClient();

  try {
    if (confirmRegistrationId) {
      const { confirmWaitlistOfferCommand } =
        await import("@/shared/domain/events/waitlist-register-commands");
      await confirmWaitlistOfferCommand({
        registrationId: confirmRegistrationId,
        now: new Date(),
      });
      console.log(
        JSON.stringify({
          registrationId: confirmRegistrationId,
          confirmed: true,
        }),
      );
      return;
    }

    const devCustomer = await prisma.customer.findFirstOrThrow({
      where: { email: DEV_CUSTOMER_EMAIL },
      select: { id: true },
    });

    const unique = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const eventTitle = `E2E繰り上げ確定 ${unique}`;
    const eventSlug = `e2e-waitlist-offer-${unique}`;
    const descriptionText = "E2E waitlist offer confirm 用 fixture。";
    const descriptionJsonString =
      buildParagraphEditorStateJson(descriptionText);
    const descriptionHtml = buildParagraphHtml(descriptionText);

    const startAt = new Date("2027-05-15T01:00:00.000Z");
    const endAt = new Date("2027-05-15T03:00:00.000Z");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const category = await prisma.eventCategory.findFirstOrThrow({
      where: { name: "未分類" },
      select: { id: true },
    });

    const { event, registration } = await prisma.$transaction(async (tx) => {
      const createdEvent = await tx.event.create({
        data: {
          title: eventTitle,
          slug: eventSlug,
          descriptionJson: parsePrismaInputJson(
            descriptionJsonString,
            "e2e waitlist offer fixture description JSON が不正です",
          ),
          descriptionHtml,
          descriptionPlainText: stripHtmlToText(descriptionHtml, 200),
          status: EventStatus.PUBLISHED,
          scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
          registrationOpen: true,
          publishedAt: new Date(),
          firstSlotStartAt: startAt,
          lastSlotEndAt: endAt,
          categoryId: category.id,
        },
        select: { id: true },
      });

      const createdSlot = await tx.eventTimeSlot.create({
        data: {
          eventId: createdEvent.id,
          startAt,
          endAt,
          capacity: 10,
        },
        select: { id: true },
      });

      const createdTicket = await tx.eventTicket.create({
        data: {
          eventId: createdEvent.id,
          name: "無料参加",
          price: 0,
        },
        select: { id: true },
      });

      const createdRegistration = await tx.eventRegistration.create({
        data: {
          eventId: createdEvent.id,
          slotId: createdSlot.id,
          ticketId: createdTicket.id,
          customerId: devCustomer.id,
          name: "開発テスト",
          email: DEV_CUSTOMER_EMAIL,
          quantity: 1,
          status: RegistrationStatus.WAITLISTED_OFFERED,
          offeredAt: new Date(),
          expiresAt,
          waitlistedAt: new Date(Date.now() - 60 * 60 * 1000),
        },
        select: { id: true },
      });

      return {
        event: createdEvent,
        registration: createdRegistration,
      };
    });

    const token = createWaitlistOfferToken({
      registrationId: registration.id,
      expiresAt,
    });

    console.log(
      JSON.stringify({
        eventSlug,
        eventTitle,
        eventId: event.id,
        registrationId: registration.id,
        token,
        confirmed: false,
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
    "❌ create-waitlist-offer-confirm-fixture failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}
