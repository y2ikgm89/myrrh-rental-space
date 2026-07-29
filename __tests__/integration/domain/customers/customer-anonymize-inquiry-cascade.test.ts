/**
 * Customer anonymize 時の Inquiry 連鎖 anonymize 統合テスト。
 *
 * `anonymizeCustomerCommand` が customerId 紐づき未匿名化 Inquiry（soft-deleted 含む）を
 * `customer-cascade` 理由で placeholder 化し、添付 DB 行を削除、既匿名化 Inquiry は
 * 対象外、Inquiry なし customer でも成功することを実 DB で検証する。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { InquiryStatus } from "@generated/prisma/enums";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type CommandsModule =
  typeof import("@/shared/domain/customers/customer-lifecycle-commands");

let prisma: PrismaModule["prisma"];
let anonymizeCustomerCommand: CommandsModule["anonymizeCustomerCommand"];

function generateTestReceiptNumber(): string {
  const raw = crypto
    .randomUUID()
    .replaceAll("-", "")
    .substring(0, 8)
    .toUpperCase();
  return `INQ-${raw}`;
}

async function createCustomerWithInquiries(): Promise<{
  customerId: string;
  activeInquiryId: string;
  softDeletedInquiryId: string;
  preAnonymizedInquiryId: string;
  cleanup: () => Promise<void>;
}> {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const email = `cascade-inquiry-${suffix}@example.com`;

  const customer = await prisma.customer.create({
    data: {
      lastName: "連鎖",
      firstName: "太郎",
      email,
      emailCanonical: email,
    },
    select: { id: true },
  });

  const activeInquiry = await prisma.inquiry.create({
    data: {
      receiptNumber: generateTestReceiptNumber(),
      name: "連鎖太郎",
      email,
      subject: "active inquiry",
      message: "PII message active",
      status: InquiryStatus.NEW,
      customerId: customer.id,
      replies: {
        create: {
          body: "reply body active",
          authorType: "CUSTOMER",
          authorCustomerId: customer.id,
        },
      },
      attachments: {
        create: {
          r2Key: `test/inquiry-cascade/${suffix}/active.bin`,
          mimeType: "application/octet-stream",
          sizeBytes: 12,
          filename: "active.bin",
          uploadedByCustomerId: customer.id,
        },
      },
    },
    select: { id: true },
  });

  const softDeletedInquiry = await prisma.inquiry.create({
    data: {
      receiptNumber: generateTestReceiptNumber(),
      name: "連鎖次郎",
      email,
      subject: "soft deleted inquiry",
      message: "PII message deleted",
      status: InquiryStatus.NEW,
      customerId: customer.id,
      deletedAt: new Date(),
    },
    select: { id: true },
  });

  const preAnonymizedInquiry = await prisma.inquiry.create({
    data: {
      receiptNumber: generateTestReceiptNumber(),
      name: "既匿名",
      email: `deleted+pre-${suffix}@anonymized.local`,
      subject: "already anonymized",
      message: "この内容は匿名化されました",
      status: InquiryStatus.NEW,
      customerId: customer.id,
      anonymizedAt: new Date("2020-01-01T00:00:00.000Z"),
      anonymizedReason: "admin-purge",
    },
    select: { id: true },
  });

  return {
    customerId: customer.id,
    activeInquiryId: activeInquiry.id,
    softDeletedInquiryId: softDeletedInquiry.id,
    preAnonymizedInquiryId: preAnonymizedInquiry.id,
    cleanup: async () => {
      await prisma.inquiryAttachment.deleteMany({
        where: {
          inquiryId: {
            in: [
              activeInquiry.id,
              softDeletedInquiry.id,
              preAnonymizedInquiry.id,
            ],
          },
        },
      });
      await prisma.inquiryReply.deleteMany({
        where: {
          inquiryId: {
            in: [
              activeInquiry.id,
              softDeletedInquiry.id,
              preAnonymizedInquiry.id,
            ],
          },
        },
      });
      await prisma.inquiry.deleteMany({
        where: { customerId: customer.id },
      });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
    },
  };
}

describeMaybe("anonymizeCustomerCommand — Inquiry cascade", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ anonymizeCustomerCommand } =
      await import("@/shared/domain/customers/customer-lifecycle-commands"));
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("紐づく Inquiry を連鎖 anonymize し、既匿名化 Inquiry は対象外", async () => {
    const fixture = await createCustomerWithInquiries();
    try {
      const result = await anonymizeCustomerCommand({
        customerId: fixture.customerId,
        reason: "admin-purge",
      });

      expect(result.anonymizedInquiryIds.sort()).toEqual(
        [fixture.activeInquiryId, fixture.softDeletedInquiryId].sort(),
      );

      const activeAfter = await prisma.inquiry.findUnique({
        where: { id: fixture.activeInquiryId },
        select: {
          name: true,
          email: true,
          message: true,
          anonymizedAt: true,
          anonymizedReason: true,
          replies: { select: { body: true } },
          attachments: { select: { id: true } },
        },
      });
      expect(activeAfter?.name).toBe("削除済み");
      expect(activeAfter?.email).toBe(
        `deleted+${fixture.activeInquiryId}@anonymized.local`,
      );
      expect(activeAfter?.message).toBe("この内容は匿名化されました");
      expect(activeAfter?.anonymizedReason).toBe("customer-cascade");
      expect(activeAfter?.anonymizedAt).not.toBeNull();
      expect(activeAfter?.replies[0]?.body).toBe("この内容は匿名化されました");
      expect(activeAfter?.attachments).toHaveLength(0);

      const softDeletedAfter = await prisma.inquiry.findUnique({
        where: { id: fixture.softDeletedInquiryId },
        select: {
          anonymizedAt: true,
          anonymizedReason: true,
          message: true,
        },
      });
      expect(softDeletedAfter?.anonymizedReason).toBe("customer-cascade");
      expect(softDeletedAfter?.message).toBe("この内容は匿名化されました");

      const preAnonymizedAfter = await prisma.inquiry.findUnique({
        where: { id: fixture.preAnonymizedInquiryId },
        select: {
          anonymizedReason: true,
          anonymizedAt: true,
        },
      });
      expect(preAnonymizedAfter?.anonymizedReason).toBe("admin-purge");
      expect(preAnonymizedAfter?.anonymizedAt?.toISOString()).toBe(
        "2020-01-01T00:00:00.000Z",
      );
    } finally {
      await fixture.cleanup();
    }
  });

  test("Inquiry なし customer でも anonymize 成功し anonymizedInquiryIds は空", async () => {
    const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const email = `cascade-none-${suffix}@example.com`;
    const customer = await prisma.customer.create({
      data: {
        lastName: "問合",
        firstName: "なし",
        email,
        emailCanonical: email,
      },
      select: { id: true },
    });

    try {
      const result = await anonymizeCustomerCommand({
        customerId: customer.id,
        reason: "customer-requested",
      });

      expect(result.anonymizedInquiryIds).toEqual([]);
      expect(result.customerId).toBe(customer.id);
    } finally {
      await prisma.customer.deleteMany({ where: { id: customer.id } });
    }
  });
});
