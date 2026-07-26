import { beforeEach, describe, expect, mock, test } from "bun:test";

type AttachmentDownloadRow = {
  id: string;
  r2Key: string;
  mimeType: string;
  filename: string;
  inquiryId: string;
  inquiry: {
    customerId: string | null;
    anonymizedAt: Date | null;
    deletedAt: Date | null;
  };
};

const mockAttachmentFindUnique = mock<
  () => Promise<AttachmentDownloadRow | null>
>(() => Promise.resolve(null));

mock.module("server-only", () => ({}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    inquiryAttachment: {
      findUnique: mockAttachmentFindUnique,
    },
  },
}));

import { getInquiryAttachmentForDownload } from "@/shared/domain/inquiries/queries";

function attachmentRow(
  overrides: Partial<AttachmentDownloadRow["inquiry"]> = {},
): AttachmentDownloadRow {
  return {
    id: "att-1",
    r2Key: "inquiries/inq-1/1-a.jpg",
    mimeType: "image/jpeg",
    filename: "photo.jpg",
    inquiryId: "inq-1",
    inquiry: {
      customerId: "cust-1",
      anonymizedAt: null,
      deletedAt: null,
      ...overrides,
    },
  };
}

describe("getInquiryAttachmentForDownload", () => {
  beforeEach(() => {
    mockAttachmentFindUnique.mockReset();
  });

  test("active inquiry の添付を返す", async () => {
    mockAttachmentFindUnique.mockResolvedValue(attachmentRow());

    const result = await getInquiryAttachmentForDownload("att-1");

    expect(result).toEqual({
      id: "att-1",
      r2Key: "inquiries/inq-1/1-a.jpg",
      mimeType: "image/jpeg",
      filename: "photo.jpg",
      inquiryId: "inq-1",
      customerId: "cust-1",
    });
  });

  test("soft-deleted inquiry（deletedAt 非 null）は null（404 相当）", async () => {
    mockAttachmentFindUnique.mockResolvedValue(
      attachmentRow({ deletedAt: new Date("2026-07-01T00:00:00.000Z") }),
    );

    const result = await getInquiryAttachmentForDownload("att-1");

    expect(result).toBeNull();
  });

  test("anonymized inquiry は null（404 相当）", async () => {
    mockAttachmentFindUnique.mockResolvedValue(
      attachmentRow({ anonymizedAt: new Date("2026-07-01T00:00:00.000Z") }),
    );

    const result = await getInquiryAttachmentForDownload("att-1");

    expect(result).toBeNull();
  });

  test("存在しない添付は null", async () => {
    mockAttachmentFindUnique.mockResolvedValue(null);

    const result = await getInquiryAttachmentForDownload("missing");

    expect(result).toBeNull();
  });

  test("inquiry.deletedAt を select に含める", async () => {
    mockAttachmentFindUnique.mockResolvedValue(attachmentRow());

    await getInquiryAttachmentForDownload("att-1");

    expect(mockAttachmentFindUnique).toHaveBeenCalledWith({
      where: { id: "att-1" },
      select: {
        id: true,
        r2Key: true,
        mimeType: true,
        filename: true,
        inquiryId: true,
        inquiry: {
          select: { customerId: true, anonymizedAt: true, deletedAt: true },
        },
      },
    });
  });
});
