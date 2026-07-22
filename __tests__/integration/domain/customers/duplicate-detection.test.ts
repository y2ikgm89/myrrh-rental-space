import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

process.env["DATABASE_URL"] =
  process.env["TEST_DATABASE_URL"] ?? process.env["DATABASE_URL"];

const { prisma: basePrisma } = await import("@/shared/db/prisma");
const { detectDuplicateCandidates, findDuplicateCandidateFor } =
  await import("@/shared/domain/customers/duplicate-detection");

describe("detectDuplicateCandidates / findDuplicateCandidateFor", () => {
  afterAll(async () => {
    await basePrisma.$disconnect();
  });

  test("emailCanonical が一致する2顧客をペアとして検出する", async () => {
    const sharedEmail = `dup-email-${randomUUID()}@example.com`;
    const a = await basePrisma.customer.create({
      data: {
        lastName: "山田",
        firstName: "太郎",
        email: sharedEmail,
        emailCanonical: sharedEmail,
      },
    });
    const b = await basePrisma.customer.create({
      data: {
        lastName: "山田",
        firstName: "次郎",
        email: sharedEmail,
        emailCanonical: sharedEmail,
      },
    });

    const detected = await detectDuplicateCandidates();
    const detectedIds = detected.map((d) => d.customerId);
    expect(detectedIds).toContain(a.id);
    expect(detectedIds).toContain(b.id);

    const candidate = await findDuplicateCandidateFor(a.id);
    expect(candidate?.id).toBe(b.id);

    await basePrisma.customer.delete({ where: { id: a.id } });
    await basePrisma.customer.delete({ where: { id: b.id } });
  });

  test("phoneNumber が完全一致する2顧客をペアとして検出する(email は別)", async () => {
    const sharedPhone = "090-1234-5678";
    const a = await basePrisma.customer.create({
      data: {
        lastName: "佐藤",
        firstName: "花子",
        email: `phone-dup-a-${randomUUID()}@example.com`,
        emailCanonical: `phone-dup-a-${randomUUID()}@example.com`,
        phoneNumber: sharedPhone,
      },
    });
    const b = await basePrisma.customer.create({
      data: {
        lastName: "佐藤",
        firstName: "次子",
        email: `phone-dup-b-${randomUUID()}@example.com`,
        emailCanonical: `phone-dup-b-${randomUUID()}@example.com`,
        phoneNumber: sharedPhone,
      },
    });

    const detected = await detectDuplicateCandidates();
    const detectedIds = detected.map((d) => d.customerId);
    expect(detectedIds).toContain(a.id);
    expect(detectedIds).toContain(b.id);

    await basePrisma.customer.delete({ where: { id: a.id } });
    await basePrisma.customer.delete({ where: { id: b.id } });
  });

  test("一致する相手がいない顧客は検出されない", async () => {
    const solo = await basePrisma.customer.create({
      data: {
        lastName: "鈴木",
        firstName: "一郎",
        email: `solo-${randomUUID()}@example.com`,
        emailCanonical: `solo-${randomUUID()}@example.com`,
      },
    });

    const candidate = await findDuplicateCandidateFor(solo.id);
    expect(candidate).toBeNull();

    await basePrisma.customer.delete({ where: { id: solo.id } });
  });
});
