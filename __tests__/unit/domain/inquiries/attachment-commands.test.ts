import { describe, test, expect, mock, beforeEach } from "bun:test";

// Prisma モック関数（import より前に定義 — TDZ 回避）
const mockInquiryFindUnique = mock<
  () => Promise<Record<string, unknown> | null>
>(() =>
  Promise.resolve({
    id: "inquiry-1",
    deletedAt: null,
    anonymizedAt: null,
  }),
);
const mockInquiryReplyFindUnique = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));
const mockAttachmentCreate = mock<
  (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>
>(() =>
  Promise.resolve({
    id: "attachment-1",
    filename: "photo.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 1024,
    replyId: null,
    createdAt: new Date("2027-01-01T00:00:00Z"),
  }),
);
const mockAttachmentFindUnique = mock<
  () => Promise<Record<string, unknown> | null>
>(() =>
  Promise.resolve({
    id: "attachment-1",
    r2Key: "inquiries/inquiry-1/1-a.jpg",
    uploadedByCustomerId: null,
  }),
);
const mockAttachmentDelete = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "attachment-1" }),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    inquiry: { findUnique: mockInquiryFindUnique },
    inquiryReply: { findUnique: mockInquiryReplyFindUnique },
    inquiryAttachment: {
      create: mockAttachmentCreate,
      findUnique: mockAttachmentFindUnique,
      delete: mockAttachmentDelete,
    },
  },
}));

const mockGetR2InquiriesBucketName = mock<() => string>(
  () => "test-inquiries-bucket",
);
mock.module("@/shared/lib/r2/client", () => ({
  getR2InquiriesBucketName: () => mockGetR2InquiriesBucketName(),
}));

type MockPutResult = { success: true } | { success: false; error: string };
const mockPutPrivateObject = mock<
  (...args: unknown[]) => Promise<MockPutResult>
>(() => Promise.resolve({ success: true }));
mock.module("@/shared/lib/r2/upload", () => ({
  putPrivateObject: (...args: unknown[]) => mockPutPrivateObject(...args),
}));

type MockDeleteResult = { success: true } | { success: false; error: string };
const mockDeleteObjectFromBucket = mock<
  (...args: unknown[]) => Promise<MockDeleteResult>
>(() => Promise.resolve({ success: true }));
mock.module("@/shared/lib/r2/delete", () => ({
  deleteObjectFromBucket: (...args: unknown[]) =>
    mockDeleteObjectFromBucket(...args),
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: mock(() => {}),
  ErrorCategory: { EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { MEDIUM: "MEDIUM", HIGH: "HIGH" },
  normalizeError: (e: unknown) =>
    e instanceof Error ? e : new Error(String(e)),
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
import {
  uploadInquiryAttachmentCommand,
  deleteInquiryAttachmentCommand,
} from "@/shared/domain/inquiries/attachment-commands";
import { DomainError } from "@/shared/domain/domain-error";

const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0];
const GIF_HEADER = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0];
const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d, 0, 0, 0, 0, 0, 0, 0];

function makeFile(
  name: string,
  declaredType: string,
  signature: number[],
  size = 1024,
): File {
  const buf = new Uint8Array(size);
  signature.forEach((b, i) => {
    buf[i] = b;
  });
  return new File([buf], name, { type: declaredType });
}

beforeEach(() => {
  mockInquiryFindUnique.mockClear();
  mockInquiryFindUnique.mockImplementation(() =>
    Promise.resolve({ id: "inquiry-1", deletedAt: null, anonymizedAt: null }),
  );
  mockInquiryReplyFindUnique.mockClear();
  mockInquiryReplyFindUnique.mockImplementation(() => Promise.resolve(null));
  mockAttachmentCreate.mockClear();
  mockAttachmentCreate.mockImplementation(() =>
    Promise.resolve({
      id: "attachment-1",
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1024,
      replyId: null,
      createdAt: new Date("2027-01-01T00:00:00Z"),
    }),
  );
  mockAttachmentFindUnique.mockClear();
  mockAttachmentFindUnique.mockImplementation(() =>
    Promise.resolve({
      id: "attachment-1",
      r2Key: "inquiries/inquiry-1/1-a.jpg",
      uploadedByCustomerId: null,
    }),
  );
  mockAttachmentDelete.mockClear();
  mockAttachmentDelete.mockImplementation(() =>
    Promise.resolve({ id: "attachment-1" }),
  );
  mockGetR2InquiriesBucketName.mockClear();
  mockGetR2InquiriesBucketName.mockImplementation(
    () => "test-inquiries-bucket",
  );
  mockPutPrivateObject.mockClear();
  mockPutPrivateObject.mockImplementation(() =>
    Promise.resolve({ success: true }),
  );
  mockDeleteObjectFromBucket.mockClear();
  mockDeleteObjectFromBucket.mockImplementation(() =>
    Promise.resolve({ success: true }),
  );
});

describe("uploadInquiryAttachmentCommand", () => {
  test("JPEG（STAFF アップロード）は成功し putPrivateObject + DB create が呼ばれる", async () => {
    const file = makeFile("photo.jpg", "image/jpeg", JPEG_HEADER, 1024);
    const result = await uploadInquiryAttachmentCommand({
      file,
      inquiryId: "inquiry-1",
      uploader: { type: "STAFF", userId: "user-1" },
    });

    expect(result.id).toBe("attachment-1");
    expect(mockPutPrivateObject).toHaveBeenCalledTimes(1);
    expect(mockAttachmentCreate).toHaveBeenCalledTimes(1);
    const createArgs = mockAttachmentCreate.mock.calls[0]?.[0] as
      { data: Record<string, unknown> } | undefined;
    expect(createArgs?.data["uploadedById"]).toBe("user-1");
    expect(createArgs?.data["uploadedByCustomerId"]).toBeNull();
  });

  test("CUSTOMER アップロードは uploadedByCustomerId を記録する", async () => {
    const file = makeFile("photo.jpg", "image/jpeg", JPEG_HEADER, 1024);
    await uploadInquiryAttachmentCommand({
      file,
      inquiryId: "inquiry-1",
      uploader: { type: "CUSTOMER", customerId: "cust-1" },
    });

    const createArgs = mockAttachmentCreate.mock.calls[0]?.[0] as
      { data: Record<string, unknown> } | undefined;
    expect(createArgs?.data["uploadedByCustomerId"]).toBe("cust-1");
    expect(createArgs?.data["uploadedById"]).toBeNull();
  });

  test("PDF は成功する（許可 MIME）", async () => {
    const file = makeFile("quote.pdf", "application/pdf", PDF_HEADER, 2048);
    mockAttachmentCreate.mockImplementationOnce(() =>
      Promise.resolve({
        id: "attachment-2",
        filename: "quote.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2048,
        replyId: null,
        createdAt: new Date(),
      }),
    );
    const result = await uploadInquiryAttachmentCommand({
      file,
      inquiryId: "inquiry-1",
      uploader: { type: "STAFF", userId: "user-1" },
    });
    expect(result.mimeType).toBe("application/pdf");
  });

  test("inquiry が存在しない → NOT_FOUND、R2 は呼ばれない", async () => {
    mockInquiryFindUnique.mockImplementationOnce(() => Promise.resolve(null));
    const file = makeFile("photo.jpg", "image/jpeg", JPEG_HEADER, 1024);

    await expect(
      uploadInquiryAttachmentCommand({
        file,
        inquiryId: "missing",
        uploader: { type: "STAFF", userId: "user-1" },
      }),
    ).rejects.toThrow(DomainError);
    expect(mockPutPrivateObject).not.toHaveBeenCalled();
  });

  test("anonymized 済み inquiry → NOT_FOUND", async () => {
    mockInquiryFindUnique.mockImplementationOnce(() =>
      Promise.resolve({
        id: "inquiry-1",
        deletedAt: null,
        anonymizedAt: new Date(),
      }),
    );
    const file = makeFile("photo.jpg", "image/jpeg", JPEG_HEADER, 1024);

    await expect(
      uploadInquiryAttachmentCommand({
        file,
        inquiryId: "inquiry-1",
        uploader: { type: "STAFF", userId: "user-1" },
      }),
    ).rejects.toThrow(DomainError);
  });

  test("replyId 指定時に別 inquiry の reply → NOT_FOUND", async () => {
    mockInquiryReplyFindUnique.mockImplementationOnce(() =>
      Promise.resolve({ id: "reply-1", inquiryId: "other-inquiry" }),
    );
    const file = makeFile("photo.jpg", "image/jpeg", JPEG_HEADER, 1024);

    await expect(
      uploadInquiryAttachmentCommand({
        file,
        inquiryId: "inquiry-1",
        replyId: "reply-1",
        uploader: { type: "STAFF", userId: "user-1" },
      }),
    ).rejects.toThrow(DomainError);
    expect(mockPutPrivateObject).not.toHaveBeenCalled();
  });

  test("許可 MIME 外（GIF）→ VALIDATION、R2 は呼ばれない", async () => {
    const file = makeFile("photo.gif", "image/gif", GIF_HEADER, 1024);

    await expect(
      uploadInquiryAttachmentCommand({
        file,
        inquiryId: "inquiry-1",
        uploader: { type: "STAFF", userId: "user-1" },
      }),
    ).rejects.toThrow(DomainError);
    expect(mockPutPrivateObject).not.toHaveBeenCalled();
  });

  test("JPEG が per-type 上限 (5MB) 超過 → VALIDATION", async () => {
    const file = makeFile(
      "big.jpg",
      "image/jpeg",
      JPEG_HEADER,
      6 * 1024 * 1024,
    );

    await expect(
      uploadInquiryAttachmentCommand({
        file,
        inquiryId: "inquiry-1",
        uploader: { type: "STAFF", userId: "user-1" },
      }),
    ).rejects.toThrow(DomainError);
    expect(mockPutPrivateObject).not.toHaveBeenCalled();
  });

  test("aggregate 上限 (10MB) 超過 → magic-byte 判定より前に VALIDATION", async () => {
    const file = makeFile(
      "huge.pdf",
      "application/pdf",
      PDF_HEADER,
      11 * 1024 * 1024,
    );

    await expect(
      uploadInquiryAttachmentCommand({
        file,
        inquiryId: "inquiry-1",
        uploader: { type: "STAFF", userId: "user-1" },
      }),
    ).rejects.toThrow(DomainError);
    expect(mockPutPrivateObject).not.toHaveBeenCalled();
  });

  test("putPrivateObject 失敗 → UNEXPECTED、DB create は呼ばれない", async () => {
    mockPutPrivateObject.mockImplementationOnce(() =>
      Promise.resolve({ success: false, error: "upload failed" }),
    );
    const file = makeFile("photo.jpg", "image/jpeg", JPEG_HEADER, 1024);

    await expect(
      uploadInquiryAttachmentCommand({
        file,
        inquiryId: "inquiry-1",
        uploader: { type: "STAFF", userId: "user-1" },
      }),
    ).rejects.toThrow(DomainError);
    expect(mockAttachmentCreate).not.toHaveBeenCalled();
  });

  test("DB create 失敗 → R2 orphan を削除して UNEXPECTED を throw する", async () => {
    mockAttachmentCreate.mockImplementationOnce(() => {
      throw new Error("unique constraint violation");
    });
    const file = makeFile("photo.jpg", "image/jpeg", JPEG_HEADER, 1024);

    await expect(
      uploadInquiryAttachmentCommand({
        file,
        inquiryId: "inquiry-1",
        uploader: { type: "STAFF", userId: "user-1" },
      }),
    ).rejects.toThrow(DomainError);
    expect(mockDeleteObjectFromBucket).toHaveBeenCalledTimes(1);
  });
});

describe("deleteInquiryAttachmentCommand", () => {
  test("STAFF は他人のアップロードでも削除できる", async () => {
    mockAttachmentFindUnique.mockImplementationOnce(() =>
      Promise.resolve({
        id: "attachment-1",
        r2Key: "inquiries/inquiry-1/1-a.jpg",
        uploadedByCustomerId: "some-other-customer",
      }),
    );

    await deleteInquiryAttachmentCommand({
      attachmentId: "attachment-1",
      actor: { type: "STAFF_ADMIN" },
    });

    expect(mockDeleteObjectFromBucket).toHaveBeenCalledWith(
      "test-inquiries-bucket",
      "inquiries/inquiry-1/1-a.jpg",
    );
    expect(mockAttachmentDelete).toHaveBeenCalledTimes(1);
  });

  test("CUSTOMER は本人アップロードなら削除できる", async () => {
    mockAttachmentFindUnique.mockImplementationOnce(() =>
      Promise.resolve({
        id: "attachment-1",
        r2Key: "inquiries/inquiry-1/1-a.jpg",
        uploadedByCustomerId: "cust-1",
      }),
    );

    await deleteInquiryAttachmentCommand({
      attachmentId: "attachment-1",
      actor: { type: "CUSTOMER", customerId: "cust-1" },
    });

    expect(mockAttachmentDelete).toHaveBeenCalledTimes(1);
  });

  test("CUSTOMER が他人のアップロードを削除しようとすると FORBIDDEN", async () => {
    mockAttachmentFindUnique.mockImplementationOnce(() =>
      Promise.resolve({
        id: "attachment-1",
        r2Key: "inquiries/inquiry-1/1-a.jpg",
        uploadedByCustomerId: "cust-1",
      }),
    );

    await expect(
      deleteInquiryAttachmentCommand({
        attachmentId: "attachment-1",
        actor: { type: "CUSTOMER", customerId: "cust-2" },
      }),
    ).rejects.toThrow(DomainError);
    expect(mockDeleteObjectFromBucket).not.toHaveBeenCalled();
    expect(mockAttachmentDelete).not.toHaveBeenCalled();
  });

  test("添付が存在しない → NOT_FOUND", async () => {
    mockAttachmentFindUnique.mockImplementationOnce(() =>
      Promise.resolve(null),
    );

    await expect(
      deleteInquiryAttachmentCommand({
        attachmentId: "missing",
        actor: { type: "STAFF_ADMIN" },
      }),
    ).rejects.toThrow(DomainError);
  });

  test("R2 削除失敗 → UNEXPECTED、DB delete は呼ばれない", async () => {
    mockDeleteObjectFromBucket.mockImplementationOnce(() =>
      Promise.resolve({ success: false, error: "delete failed" }),
    );

    await expect(
      deleteInquiryAttachmentCommand({
        attachmentId: "attachment-1",
        actor: { type: "STAFF_ADMIN" },
      }),
    ).rejects.toThrow(DomainError);
    expect(mockAttachmentDelete).not.toHaveBeenCalled();
  });
});
