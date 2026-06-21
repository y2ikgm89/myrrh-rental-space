import { describe, test, expect, mock, beforeEach } from "bun:test";

// Prisma モック関数（import より前に定義 — TDZ 回避）
const mockSpaceCreate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "space-1", slug: "test-space" }),
);
const mockSpaceFindUnique = mock<() => Promise<Record<string, unknown> | null>>(
  () => Promise.resolve(null),
);
const mockSpaceUpdate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "space-1", slug: "test-space" }),
);
const mockLocationFindFirst = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));
const mockSpaceCategoryFindFirst = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));

mock.module("server-only", () => ({}));

// updateSpaceCommand は interactive `$transaction(async (tx) => ...)` を使うため、
// tx として同じ space mocks を露出する callback ベースの実装を提供する。
interface PrismaMock {
  space: {
    create: typeof mockSpaceCreate;
    findUnique: typeof mockSpaceFindUnique;
    update: typeof mockSpaceUpdate;
  };
  location: { findFirst: typeof mockLocationFindFirst };
  spaceCategory: { findFirst: typeof mockSpaceCategoryFindFirst };
  $transaction: <T>(fn: (tx: PrismaMock) => Promise<T>) => Promise<T>;
}

const prismaMock: PrismaMock = {
  space: {
    create: mockSpaceCreate,
    findUnique: mockSpaceFindUnique,
    update: mockSpaceUpdate,
  },
  location: {
    findFirst: mockLocationFindFirst,
  },
  spaceCategory: {
    findFirst: mockSpaceCategoryFindFirst,
  },
  $transaction: <T>(fn: (tx: PrismaMock) => Promise<T>): Promise<T> =>
    fn(prismaMock),
};

mock.module("@/shared/db/prisma", () => ({
  prisma: prismaMock,
}));

// enum モック
mock.module("@generated/prisma/enums", () => ({
  DiscountType: {
    none: "none",
    percentage: "percentage",
    fixed: "fixed",
  },
  DurationDiscountOverride: {
    inherit: "inherit",
    override: "override",
  },
  TaxRateType: {
    standard: "standard",
    reduced: "reduced",
    zero: "zero",
    exempt: "exempt",
  },
  ReservationStatus: {
    PENDING: "PENDING",
    CONFIRMED: "CONFIRMED",
    COMPLETED: "COMPLETED",
    CANCELLED: "CANCELLED",
    NO_SHOW: "NO_SHOW",
  },
}));

// スラッグバリデーションモック
const mockCheckSlugAvailability = mock<
  () => Promise<{ available: boolean; reason?: unknown }>
>(() => Promise.resolve({ available: true }));
const mockGetSlugErrorMessage = mock<() => string>(() => "スラッグエラー");

mock.module("@/shared/lib/slug-validation", () => ({
  checkSlugAvailability: mockCheckSlugAvailability,
  getSlugErrorMessage: mockGetSlugErrorMessage,
}));

// ACTIVE_RESERVATION_STATUSES モック
mock.module("@/shared/lib/validations/enums/helpers", () => ({
  ACTIVE_RESERVATION_STATUSES: ["PENDING", "CONFIRMED"],
}));

import {
  createSpaceCommand,
  updateSpaceCommand,
  updateSpacePublishedCommand,
  deleteSpaceCommand,
} from "@/shared/domain/spaces/commands";
import { DomainError } from "@/shared/domain/domain-error";

// =============================================================================
// テスト用定数
// =============================================================================

const SPACE_ID = "space-1";
const LOCATION_ID = "location-1";
const CATEGORY_ID = "category-1";

const VALID_INPUT = {
  slug: "test-space",
  name: "テストスペース",
  descriptionJson: { root: { type: "root", children: [] } },
  descriptionHtml: "<p>テスト用のスペースです</p>",
  descriptionPlainText: "テスト用のスペースです",
  capacity: 10,
  hourlyPrice: 1000,
  mainImageUrl: "https://example.com/image.jpg",
  imageUrls: ["https://example.com/image1.jpg"],
  facilities: [
    { name: "Wi-Fi", iconName: "IconWifi" },
    { name: "プロジェクター", iconName: "IconPresentation" },
  ],
  isPublished: false,
  reviewsEnabled: true,
  locationId: LOCATION_ID,
};

const ACTIVE_SPACE = {
  id: SPACE_ID,
  slug: "test-space",
  isPublished: false,
  publishedAt: null,
};

const ACTIVE_LOCATION = { id: LOCATION_ID };
const ACTIVE_CATEGORY = { id: CATEGORY_ID };

// =============================================================================
// createSpaceCommand
// =============================================================================

describe("createSpaceCommand", () => {
  beforeEach(() => {
    mockSpaceCreate.mockReset();
    mockLocationFindFirst.mockReset();
    mockSpaceCategoryFindFirst.mockReset();
    mockCheckSlugAvailability.mockReset();
    mockGetSlugErrorMessage.mockReset();

    mockSpaceCreate.mockResolvedValue({ id: SPACE_ID, slug: "test-space" });
    mockLocationFindFirst.mockResolvedValue(ACTIVE_LOCATION);
    mockSpaceCategoryFindFirst.mockResolvedValue(ACTIVE_CATEGORY);
    mockCheckSlugAvailability.mockResolvedValue({ available: true });
    mockGetSlugErrorMessage.mockReturnValue("スラッグエラー");
  });

  describe("正常系", () => {
    test("有効な入力でスペースを作成できる", async () => {
      const result = await createSpaceCommand(VALID_INPUT);

      expect(result).toEqual({ id: SPACE_ID, slug: "test-space" });
      expect(mockSpaceCreate).toHaveBeenCalledTimes(1);
    });

    test("isPublished が true の場合 publishedAt が設定される", async () => {
      await createSpaceCommand({ ...VALID_INPUT, isPublished: true });

      expect(mockSpaceCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            publishedAt: expect.any(Date),
          }),
        }),
      );
    });

    test("isPublished が false の場合 publishedAt が null になる", async () => {
      await createSpaceCommand({ ...VALID_INPUT, isPublished: false });

      expect(mockSpaceCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            publishedAt: null,
          }),
        }),
      );
    });

    test("categoryId が null の場合カテゴリーチェックをスキップする", async () => {
      await createSpaceCommand({ ...VALID_INPUT, categoryId: null });

      expect(mockSpaceCategoryFindFirst).not.toHaveBeenCalled();
    });

    test("categoryId が undefined の場合カテゴリーチェックをスキップする", async () => {
      const { categoryId: _unused, ...inputWithoutCategory } = {
        ...VALID_INPUT,
        categoryId: undefined,
      };
      void _unused;
      await createSpaceCommand(inputWithoutCategory);

      expect(mockSpaceCategoryFindFirst).not.toHaveBeenCalled();
    });

    test("オプションフィールドが空の場合 null として保存される", async () => {
      await createSpaceCommand({
        ...VALID_INPUT,
        addressDetail: "",
        metaDescription: "",
      });

      expect(mockSpaceCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            addressDetail: null,
            metaDescription: null,
          }),
        }),
      );
    });

    test("有効な categoryId を指定してスペースを作成できる", async () => {
      const result = await createSpaceCommand({
        ...VALID_INPUT,
        categoryId: CATEGORY_ID,
      });

      expect(result).toEqual({ id: SPACE_ID, slug: "test-space" });
      expect(mockSpaceCategoryFindFirst).toHaveBeenCalledTimes(1);
    });
  });

  describe("異常系", () => {
    test("スラッグが使用不可の場合 CONFLICT エラーをスローする", async () => {
      mockCheckSlugAvailability.mockResolvedValue({
        available: false,
        reason: { type: "conflict", contentType: "space", id: "other-space" },
      });
      mockGetSlugErrorMessage.mockReturnValue(
        "このスラッグは既に使用されています",
      );

      await expect(createSpaceCommand(VALID_INPUT)).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });

    test("拠点が存在しない場合 VALIDATION エラーをスローする", async () => {
      mockLocationFindFirst.mockResolvedValue(null);

      await expect(createSpaceCommand(VALID_INPUT)).rejects.toMatchObject({
        code: "VALIDATION",
        message: "拠点が見つからないか、無効です",
      });
    });

    test("拠点が無効（isActive:false）の場合 VALIDATION エラーをスローする", async () => {
      mockLocationFindFirst.mockResolvedValue(null);

      await expect(createSpaceCommand(VALID_INPUT)).rejects.toThrow(
        DomainError,
      );
    });

    test("カテゴリーが存在しない場合 VALIDATION エラーをスローする", async () => {
      mockSpaceCategoryFindFirst.mockResolvedValue(null);

      await expect(
        createSpaceCommand({ ...VALID_INPUT, categoryId: CATEGORY_ID }),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        message: "カテゴリーが見つからないか、無効です",
      });
    });

    test("スラッグエラー時は prisma.space.create が呼ばれない", async () => {
      mockCheckSlugAvailability.mockResolvedValue({
        available: false,
        reason: { type: "reserved", path: "admin" },
      });

      await expect(createSpaceCommand(VALID_INPUT)).rejects.toThrow(
        DomainError,
      );
      expect(mockSpaceCreate).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// updateSpaceCommand
// =============================================================================

describe("updateSpaceCommand", () => {
  beforeEach(() => {
    mockSpaceFindUnique.mockReset();
    mockSpaceUpdate.mockReset();
    mockLocationFindFirst.mockReset();
    mockSpaceCategoryFindFirst.mockReset();
    mockCheckSlugAvailability.mockReset();
    mockGetSlugErrorMessage.mockReset();

    mockSpaceFindUnique.mockResolvedValue(ACTIVE_SPACE);
    mockSpaceUpdate.mockResolvedValue({ id: SPACE_ID, slug: "test-space" });
    mockLocationFindFirst.mockResolvedValue(ACTIVE_LOCATION);
    mockSpaceCategoryFindFirst.mockResolvedValue(ACTIVE_CATEGORY);
    mockCheckSlugAvailability.mockResolvedValue({ available: true });
    mockGetSlugErrorMessage.mockReturnValue("スラッグエラー");
  });

  describe("正常系", () => {
    test("既存スペースを更新できる", async () => {
      await updateSpaceCommand(SPACE_ID, VALID_INPUT);

      expect(mockSpaceUpdate).toHaveBeenCalledTimes(1);
    });

    test("非公開→公開に変更した場合 publishedAt が新しい日時になる", async () => {
      mockSpaceFindUnique.mockResolvedValue({
        id: SPACE_ID,
        isPublished: false,
        publishedAt: null,
      });

      await updateSpaceCommand(SPACE_ID, { ...VALID_INPUT, isPublished: true });

      expect(mockSpaceUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            publishedAt: expect.any(Date),
          }),
        }),
      );
    });

    test("公開→非公開に変更した場合 publishedAt が null になる", async () => {
      const existingPublishedAt = new Date("2024-01-01T12:00:00Z");
      mockSpaceFindUnique.mockResolvedValue({
        id: SPACE_ID,
        isPublished: true,
        publishedAt: existingPublishedAt,
      });

      await updateSpaceCommand(SPACE_ID, {
        ...VALID_INPUT,
        isPublished: false,
      });

      expect(mockSpaceUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            publishedAt: null,
          }),
        }),
      );
    });

    test("公開済みで公開維持の場合 publishedAt が変わらない", async () => {
      const existingPublishedAt = new Date("2024-01-01T12:00:00Z");
      mockSpaceFindUnique.mockResolvedValue({
        id: SPACE_ID,
        isPublished: true,
        publishedAt: existingPublishedAt,
      });

      await updateSpaceCommand(SPACE_ID, { ...VALID_INPUT, isPublished: true });

      expect(mockSpaceUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            publishedAt: existingPublishedAt,
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("スペースが存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockSpaceFindUnique.mockResolvedValue(null);

      await expect(
        updateSpaceCommand(SPACE_ID, VALID_INPUT),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "スペースが見つかりません",
      });
    });

    test("拠点が存在しない場合 VALIDATION エラーをスローする", async () => {
      mockLocationFindFirst.mockResolvedValue(null);

      await expect(
        updateSpaceCommand(SPACE_ID, VALID_INPUT),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        message: "拠点が見つからないか、無効です",
      });
    });

    test("スラッグが使用不可の場合 CONFLICT エラーをスローする", async () => {
      mockCheckSlugAvailability.mockResolvedValue({
        available: false,
        reason: { type: "conflict", contentType: "post", id: "post-1" },
      });

      await expect(
        updateSpaceCommand(SPACE_ID, VALID_INPUT),
      ).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });
  });
});

// =============================================================================
// updateSpacePublishedCommand
// =============================================================================

describe("updateSpacePublishedCommand", () => {
  beforeEach(() => {
    mockSpaceFindUnique.mockReset();
    mockSpaceUpdate.mockReset();

    mockSpaceFindUnique.mockResolvedValue(ACTIVE_SPACE);
    mockSpaceUpdate.mockResolvedValue({ id: SPACE_ID, slug: "test-space" });
  });

  describe("正常系", () => {
    test("スペースを公開状態に変更し戻り値を返す", async () => {
      const result = await updateSpacePublishedCommand(SPACE_ID, true);

      expect(result).toEqual({
        id: SPACE_ID,
        slug: "test-space",
        isPublished: true,
      });
      expect(mockSpaceUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isPublished: true,
          }),
        }),
      );
    });

    test("スペースを非公開状態に変更し戻り値を返す", async () => {
      const result = await updateSpacePublishedCommand(SPACE_ID, false);

      expect(result).toEqual({
        id: SPACE_ID,
        slug: "test-space",
        isPublished: false,
      });
      expect(mockSpaceUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isPublished: false,
            publishedAt: null,
          }),
        }),
      );
    });

    test("公開時に publishedAt が設定される", async () => {
      await updateSpacePublishedCommand(SPACE_ID, true);

      expect(mockSpaceUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isPublished: true,
            publishedAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("スペースが存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockSpaceFindUnique.mockResolvedValue(null);

      await expect(
        updateSpacePublishedCommand(SPACE_ID, true),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "スペースが見つかりません",
      });
    });

    test("存在しないスペースでは update が呼ばれない", async () => {
      mockSpaceFindUnique.mockResolvedValue(null);

      await expect(
        updateSpacePublishedCommand("non-existent", true),
      ).rejects.toThrow(DomainError);

      expect(mockSpaceUpdate).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// deleteSpaceCommand
// =============================================================================

describe("deleteSpaceCommand", () => {
  beforeEach(() => {
    mockSpaceFindUnique.mockReset();
    mockSpaceUpdate.mockReset();

    mockSpaceFindUnique.mockResolvedValue({
      id: SPACE_ID,
      _count: { reservations: 0 },
    });
    mockSpaceUpdate.mockResolvedValue({ id: SPACE_ID });
  });

  describe("正常系", () => {
    test("有効な予約がないスペースを削除（無効化）できる", async () => {
      await deleteSpaceCommand(SPACE_ID);

      expect(mockSpaceUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: SPACE_ID },
          data: { isActive: false, isPublished: false },
        }),
      );
    });

    test("削除後は isActive が false かつ isPublished が false になる", async () => {
      await deleteSpaceCommand(SPACE_ID);

      expect(mockSpaceUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isActive: false,
            isPublished: false,
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("スペースが存在しない場合 NOT_FOUND エラーをスローする", async () => {
      mockSpaceFindUnique.mockResolvedValue(null);

      await expect(deleteSpaceCommand(SPACE_ID)).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "スペースが見つかりません",
      });
    });

    test("有効な予約が存在する場合 VALIDATION エラーをスローする", async () => {
      mockSpaceFindUnique.mockResolvedValue({
        id: SPACE_ID,
        _count: { reservations: 3 },
      });

      await expect(deleteSpaceCommand(SPACE_ID)).rejects.toMatchObject({
        code: "VALIDATION",
        message: "有効な予約があるため削除できません",
      });
    });

    test("有効な予約が1件でも存在する場合は削除できない", async () => {
      mockSpaceFindUnique.mockResolvedValue({
        id: SPACE_ID,
        _count: { reservations: 1 },
      });

      await expect(deleteSpaceCommand(SPACE_ID)).rejects.toThrow(DomainError);
      expect(mockSpaceUpdate).not.toHaveBeenCalled();
    });

    test("存在しないスペースでは update が呼ばれない", async () => {
      mockSpaceFindUnique.mockResolvedValue(null);

      await expect(deleteSpaceCommand("non-existent")).rejects.toThrow(
        DomainError,
      );

      expect(mockSpaceUpdate).not.toHaveBeenCalled();
    });
  });
});
