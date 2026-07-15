import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockFindUnique = mock<
  () => Promise<{
    slug: string;
    name: string;
    descriptionJson: unknown;
    descriptionHtml: string;
    descriptionPlainText: string;
    addressDetail: string | null;
    capacity: number;
    area: number | null;
    hourlyPrice: number;
    mainImageUrl: string;
    gallery: unknown;
    facilities: string[];
    businessHours: unknown;
    reviewsEnabled: boolean;
    metaDescription: string | null;
    metaKeywords: string | null;
    ogpTitle: string | null;
    ogpDescription: string | null;
    ogpImageUrl: string | null;
    termsId: string | null;
    discountType: string;
    discountValue: number | null;
    durationDiscountOverride: string;
    taxRateType: string;
    locationId: string;
    categoryId: string | null;
  } | null>
>();
const mockFindUniqueBySlug = mock<() => Promise<{ id: string } | null>>(() =>
  Promise.resolve(null),
);
const mockFindMany = mock<() => Promise<{ slug: string }[]>>(() =>
  Promise.resolve([]),
);
const mockCreate = mock<
  (args: {
    data: Record<string, unknown>;
    select: Record<string, boolean>;
  }) => Promise<{ id: string; slug: string }>
>(() => Promise.resolve({ id: "new-space-id", slug: "test-copy" }));

mock.module("server-only", () => ({}));
mock.module("@/shared/lib/env/server", () => ({
  serverEnv: {
    R2_PUBLIC_URL: "https://media.example.com",
  },
}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    space: {
      findUnique: (args: { where: { id?: string; slug?: string } }) => {
        if (args.where.slug !== undefined) return mockFindUniqueBySlug();
        return mockFindUnique();
      },
      findMany: () => mockFindMany(),
      create: (args: {
        data: Record<string, unknown>;
        select: Record<string, boolean>;
      }) => mockCreate(args),
    },
  },
}));

const { duplicateSpaceCommand } =
  await import("@/shared/domain/spaces/commands");

const SOURCE_SPACE = {
  slug: "test",
  name: "テストスペース",
  descriptionJson: { root: { children: [], type: "root", version: 1 } },
  descriptionHtml: "<p>desc</p>",
  descriptionPlainText: "desc",
  addressDetail: "1F",
  capacity: 10,
  area: 30,
  hourlyPrice: 1000,
  mainImageUrl: "https://media.example.com/spaces/main.jpg",
  gallery: [
    { url: "https://media.example.com/spaces/1.jpg", alt: "", caption: "" },
    { url: "https://media.example.com/spaces/2.jpg", alt: "", caption: "" },
  ],
  facilities: ["wifi", "projector"],
  businessHours: null,
  reviewsEnabled: true,
  metaDescription: null,
  metaKeywords: null,
  ogpTitle: null,
  ogpDescription: null,
  ogpImageUrl: null,
  termsId: null,
  discountType: "none",
  discountValue: null,
  durationDiscountOverride: "inherit",
  taxRateType: "standard",
  locationId: "00000000-0000-0000-0000-000000000001",
  categoryId: null,
};

describe("duplicateSpaceCommand", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockFindUniqueBySlug.mockReset();
    mockFindUniqueBySlug.mockResolvedValue(null);
    mockFindMany.mockReset();
    mockFindMany.mockResolvedValue([]);
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({ id: "new-space-id", slug: "test-copy" });
  });

  test("複製先は isPublished=false / publishedAt=null / name に （コピー） 付与", async () => {
    mockFindUnique.mockResolvedValueOnce(SOURCE_SPACE);

    const result = await duplicateSpaceCommand(
      "00000000-0000-0000-0000-000000000099",
    );

    expect(result).toEqual({ id: "new-space-id", slug: "test-copy" });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          slug: "test-copy",
          name: "テストスペース（コピー）",
          isPublished: false,
          publishedAt: null,
          reviewsEnabled: true,
          locationId: SOURCE_SPACE.locationId,
        }),
      }),
    );
  });

  test("slug 衝突時は -copy-2 / -copy-3 ... の最小未使用番号で採番", async () => {
    mockFindUnique.mockResolvedValueOnce(SOURCE_SPACE);
    mockFindUniqueBySlug.mockResolvedValueOnce({ id: "conflict-1" });
    mockFindMany.mockResolvedValueOnce([
      { slug: "test-copy-2" },
      { slug: "test-copy-3" },
    ]);

    await duplicateSpaceCommand("00000000-0000-0000-0000-000000000099");

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: "test-copy-4" }),
      }),
    );
  });

  test("非存在 ID は DomainError NOT_FOUND をスロー", async () => {
    mockFindUnique.mockResolvedValueOnce(null);

    await expect(
      duplicateSpaceCommand("00000000-0000-0000-0000-000000000099"),
    ).rejects.toThrow("スペースが見つかりません");

    expect(mockCreate).not.toHaveBeenCalled();
  });
});
