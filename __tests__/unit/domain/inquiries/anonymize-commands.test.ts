import { describe, test, expect, mock, beforeEach } from "bun:test";

// -----------------------------------------------------------------------------
// Prisma モック関数（import より前に定義 — TDZ 回避）
// -----------------------------------------------------------------------------

const mockInquiryFindUnique = mock<
  () => Promise<{ id: string; anonymizedAt: Date | null } | null>
>(() => Promise.resolve(null));

const mockInquiryUpdate = mock<
  (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<{
    id: string;
  }>
>(() => Promise.resolve({ id: "inquiry-1" }));

const mockInquiryReplyUpdateMany = mock<
  (args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 0 }));

const mockAttachmentFindMany = mock<() => Promise<{ r2Key: string }[]>>(() =>
  Promise.resolve([]),
);

const mockAttachmentDeleteMany = mock<() => Promise<{ count: number }>>(() =>
  Promise.resolve({ count: 0 }),
);

const prismaInquiry = {
  findUnique: mockInquiryFindUnique,
  update: mockInquiryUpdate,
};
const prismaInquiryReply = { updateMany: mockInquiryReplyUpdateMany };
const prismaInquiryAttachment = {
  findMany: mockAttachmentFindMany,
  deleteMany: mockAttachmentDeleteMany,
};

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    inquiry: prismaInquiry,
    inquiryReply: prismaInquiryReply,
    inquiryAttachment: prismaInquiryAttachment,
    $transaction: <T>(
      fn: (tx: {
        inquiry: typeof prismaInquiry;
        inquiryReply: typeof prismaInquiryReply;
        inquiryAttachment: typeof prismaInquiryAttachment;
      }) => Promise<T>,
    ) =>
      fn({
        inquiry: prismaInquiry,
        inquiryReply: prismaInquiryReply,
        inquiryAttachment: prismaInquiryAttachment,
      }),
  },
}));

const mockGetR2InquiriesBucketName = mock<() => string>(
  () => "test-inquiries-bucket",
);
mock.module("@/shared/lib/r2/client", () => ({
  getR2InquiriesBucketName: () => mockGetR2InquiriesBucketName(),
}));

type MockDeleteResult = { success: true } | { success: false; error: string };
const mockDeleteObjectsFromBucket = mock<
  (...args: unknown[]) => Promise<MockDeleteResult>
>(() => Promise.resolve({ success: true }));
mock.module("@/shared/lib/r2/delete", () => ({
  deleteObjectsFromBucket: (...args: unknown[]) =>
    mockDeleteObjectsFromBucket(...args),
}));

const mockLogError = mock(() => {});
mock.module("@/shared/lib/errors/server", () => ({
  logError: mockLogError,
  ErrorCategory: { EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { MEDIUM: "MEDIUM", HIGH: "HIGH" },
  normalizeError: (e: unknown) =>
    e instanceof Error ? e : new Error(String(e)),
}));

import { anonymizeInquiryCommand } from "@/shared/domain/inquiries/anonymize-commands";
import { DomainError } from "@/shared/domain/domain-error";

const INQUIRY_ID = "770e8400-e29b-41d4-a716-446655440000";

describe("inquiries/anonymize-commands", () => {
  beforeEach(() => {
    mockInquiryFindUnique.mockReset();
    mockInquiryUpdate.mockReset();
    mockInquiryReplyUpdateMany.mockReset();
    mockAttachmentFindMany.mockReset();
    mockAttachmentDeleteMany.mockReset();
    mockGetR2InquiriesBucketName.mockClear();
    mockDeleteObjectsFromBucket.mockReset();
    mockLogError.mockClear();

    mockInquiryFindUnique.mockResolvedValue(null);
    mockInquiryUpdate.mockResolvedValue({ id: INQUIRY_ID });
    mockInquiryReplyUpdateMany.mockResolvedValue({ count: 0 });
    mockAttachmentFindMany.mockResolvedValue([]);
    mockAttachmentDeleteMany.mockResolvedValue({ count: 0 });
    mockDeleteObjectsFromBucket.mockResolvedValue({ success: true });
  });

  describe("正常系", () => {
    test("存在するお問い合わせを匿名化できる (PII placeholder + anonymizedAt 刻印)", async () => {
      mockInquiryFindUnique.mockResolvedValueOnce({
        id: INQUIRY_ID,
        anonymizedAt: null,
      });
      mockInquiryReplyUpdateMany.mockResolvedValueOnce({ count: 3 });

      const result = await anonymizeInquiryCommand({
        inquiryId: INQUIRY_ID,
        reason: "customer-requested",
      });

      expect(result.inquiryId).toBe(INQUIRY_ID);
      expect(result.reason).toBe("customer-requested");
      expect(result.anonymizedAt).toBeInstanceOf(Date);
      expect(result.deletedAttachmentCount).toBe(0);

      expect(mockInquiryUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: INQUIRY_ID },
          data: expect.objectContaining({
            name: "削除済み",
            email: `deleted+${INQUIRY_ID}@anonymized.local`,
            phoneNumber: null,
            companyName: null,
            message: "この内容は匿名化されました",
            anonymizedReason: "customer-requested",
          }),
        }),
      );

      expect(mockInquiryReplyUpdateMany).toHaveBeenCalledWith({
        where: { inquiryId: INQUIRY_ID },
        data: { body: "この内容は匿名化されました" },
      });

      // 添付が無ければ R2 / DB 削除は呼ばれない
      expect(mockAttachmentDeleteMany).not.toHaveBeenCalled();
      expect(mockDeleteObjectsFromBucket).not.toHaveBeenCalled();
      expect(mockGetR2InquiriesBucketName).not.toHaveBeenCalled();
    });

    test("添付がある場合は DB 行削除 + R2 object 削除 (バッチ) が実行される", async () => {
      mockInquiryFindUnique.mockResolvedValueOnce({
        id: INQUIRY_ID,
        anonymizedAt: null,
      });
      mockAttachmentFindMany.mockResolvedValueOnce([
        { r2Key: "inquiries/a/1.jpg" },
        { r2Key: "inquiries/a/2.pdf" },
      ]);

      const result = await anonymizeInquiryCommand({
        inquiryId: INQUIRY_ID,
        reason: "admin-purge",
      });

      expect(result.deletedAttachmentCount).toBe(2);
      expect(mockAttachmentDeleteMany).toHaveBeenCalledWith({
        where: { inquiryId: INQUIRY_ID },
      });
      expect(mockGetR2InquiriesBucketName).toHaveBeenCalled();
      expect(mockDeleteObjectsFromBucket).toHaveBeenCalledWith(
        "test-inquiries-bucket",
        ["inquiries/a/1.jpg", "inquiries/a/2.pdf"],
      );
    });

    test("R2 削除が失敗しても anonymize 自体は成功として返す (log のみ、re-throw しない)", async () => {
      mockInquiryFindUnique.mockResolvedValueOnce({
        id: INQUIRY_ID,
        anonymizedAt: null,
      });
      mockAttachmentFindMany.mockResolvedValueOnce([
        { r2Key: "inquiries/a/1.jpg" },
      ]);
      mockDeleteObjectsFromBucket.mockResolvedValueOnce({
        success: false,
        error: "network error",
      });

      const result = await anonymizeInquiryCommand({
        inquiryId: INQUIRY_ID,
        reason: "data-retention",
      });

      expect(result.deletedAttachmentCount).toBe(1);
      expect(mockLogError).toHaveBeenCalled();
    });

    test("data-retention 理由も受け付ける", async () => {
      mockInquiryFindUnique.mockResolvedValueOnce({
        id: INQUIRY_ID,
        anonymizedAt: null,
      });

      const result = await anonymizeInquiryCommand({
        inquiryId: INQUIRY_ID,
        reason: "data-retention",
      });

      expect(result.reason).toBe("data-retention");
      expect(mockInquiryUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            anonymizedReason: "data-retention",
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("存在しないお問い合わせ ID は NOT_FOUND エラー", async () => {
      mockInquiryFindUnique.mockResolvedValueOnce(null);

      await expect(
        anonymizeInquiryCommand({
          inquiryId: INQUIRY_ID,
          reason: "customer-requested",
        }),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "お問い合わせが見つかりません",
      });

      expect(mockInquiryUpdate).not.toHaveBeenCalled();
    });

    test("既に匿名化済みのお問い合わせは CONFLICT エラー (冪等性チェック)", async () => {
      mockInquiryFindUnique.mockResolvedValueOnce({
        id: INQUIRY_ID,
        anonymizedAt: new Date("2026-01-01T00:00:00Z"),
      });

      await expect(
        anonymizeInquiryCommand({
          inquiryId: INQUIRY_ID,
          reason: "customer-requested",
        }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        message: "このお問い合わせは既に匿名化済みです",
      });

      expect(mockInquiryUpdate).not.toHaveBeenCalled();
      expect(mockInquiryReplyUpdateMany).not.toHaveBeenCalled();
      expect(mockAttachmentDeleteMany).not.toHaveBeenCalled();
    });

    test("throw の場合 DomainError インスタンスであること", async () => {
      mockInquiryFindUnique.mockResolvedValueOnce(null);

      await expect(
        anonymizeInquiryCommand({
          inquiryId: INQUIRY_ID,
          reason: "customer-requested",
        }),
      ).rejects.toBeInstanceOf(DomainError);
    });
  });
});
