import { describe, test, expect, mock, beforeEach } from "bun:test";

// Prisma モック関数（mock.module より先に定義）
const mockLocationFindUnique = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));

const mockLocationCreate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "location-1", slug: "shibuya-space" }),
);

const mockLocationUpdate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "location-1" }),
);

const mockLocationDelete = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "location-1" }),
);

const mockTransaction = mock<
  (ops: unknown[]) => Promise<Record<string, unknown>[]>
>(() => Promise.resolve([]));

// モジュールモック（import より前に配置）
mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    location: {
      findUnique: mockLocationFindUnique,
      create: mockLocationCreate,
      update: mockLocationUpdate,
      delete: mockLocationDelete,
    },
    $transaction: mockTransaction,
  },
}));

import {
  createLocation,
  updateLocation,
  updateLocationPublished,
  updateLocationOrder,
  deleteLocation,
  hardDeleteLocation,
} from "@/shared/domain/locations/commands";
import { DomainError } from "@/shared/domain/domain-error";
// Prisma 実体から JsonNull を取得し、実装と同じ参照で比較する
// gateway は型のみ（Prisma 名前空間の値 re-export は Client Component への
// node:module 伝播を防ぐため除去済み）。テストは server runtime なので
// @generated/prisma/client から直接値を import する
import { Prisma } from "@generated/prisma/client";

// テスト用定数
const LOCATION_ID = "location-1";

const VALID_BUSINESS_HOURS = {
  monday: { isOpen: true, slots: [{ openTime: "09:00", closeTime: "18:00" }] },
  tuesday: {
    isOpen: true,
    slots: [{ openTime: "09:00", closeTime: "18:00" }],
  },
  wednesday: {
    isOpen: true,
    slots: [{ openTime: "09:00", closeTime: "18:00" }],
  },
  thursday: {
    isOpen: true,
    slots: [{ openTime: "09:00", closeTime: "18:00" }],
  },
  friday: { isOpen: true, slots: [{ openTime: "09:00", closeTime: "18:00" }] },
  saturday: {
    isOpen: false,
    slots: [],
  },
  sunday: { isOpen: false, slots: [] },
};

const VALID_FORM_DATA = {
  slug: "shibuya-space",
  name: "渋谷スペース",
  description: "渋谷駅近くのレンタルスペース",
  address: "東京都渋谷区1-1-1",
  accessLines: [{ value: "渋谷駅から徒歩5分" }],
  parkingInfo: "近隣コインパーキング",
  amenities: { wifi: true, parking: true } as Record<string, boolean>,
  imageUrl: "https://example.com/main.jpg",
  imageUrls: [
    { url: "https://example.com/image1.jpg" },
    { url: "https://example.com/image2.jpg" },
  ],
  businessHours: VALID_BUSINESS_HOURS,
  specialHolidays: null,
  latitude: null,
  longitude: null,
  googleBusinessPlaceId: null,
  googleReviewUrl: null,
  priceRange: null,
  paymentAccepted: null,
  phoneNumber: null,
  email: null,
  sortOrder: 1,
  isPublished: true,
  isActive: true,
};

const EXISTING_LOCATION = {
  id: LOCATION_ID,
  _count: { spaces: 0 },
};

// =============================================================================
// createLocation
// =============================================================================

describe("createLocation", () => {
  beforeEach(() => {
    mockLocationCreate.mockReset();
    mockLocationCreate.mockResolvedValue({
      id: LOCATION_ID,
      slug: "shibuya-space",
    });
  });

  describe("正常系", () => {
    test("有効なフォームデータで場所を作成できる", async () => {
      const result = await createLocation(VALID_FORM_DATA);

      expect(result).toEqual({ id: LOCATION_ID, slug: "shibuya-space" });
      expect(mockLocationCreate).toHaveBeenCalledTimes(1);
    });

    test("create が正しいデータで呼ばれる", async () => {
      await createLocation(VALID_FORM_DATA);

      expect(mockLocationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "渋谷スペース",
            address: "東京都渋谷区1-1-1",
            imageUrl: "https://example.com/main.jpg",
            imageUrls: [
              "https://example.com/image1.jpg",
              "https://example.com/image2.jpg",
            ],
            sortOrder: 1,
            isPublished: true,
          }),
        }),
      );
    });

    test("description が空文字の場合は null に変換される", async () => {
      await createLocation({ ...VALID_FORM_DATA, description: "" });

      expect(mockLocationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: null,
          }),
        }),
      );
    });

    test("accessLines が空配列の場合は空配列で渡される", async () => {
      await createLocation({ ...VALID_FORM_DATA, accessLines: [] });

      expect(mockLocationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            accessLines: [],
          }),
        }),
      );
    });

    test("description が省略された場合は null に変換される", async () => {
      const { description: _d, ...dataWithoutDescription } = VALID_FORM_DATA;
      await createLocation({ ...dataWithoutDescription });

      expect(mockLocationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: null,
          }),
        }),
      );
    });

    test("businessHours が null の場合は Prisma.JsonNull に変換される", async () => {
      await createLocation({ ...VALID_FORM_DATA, businessHours: null });

      expect(mockLocationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            businessHours: Prisma.JsonNull,
          }),
        }),
      );
    });

    test("businessHours が undefined の場合は Prisma.JsonNull に変換される", async () => {
      const { businessHours: _bh, ...dataWithoutHours } = VALID_FORM_DATA;
      await createLocation({ ...dataWithoutHours });

      expect(mockLocationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            businessHours: Prisma.JsonNull,
          }),
        }),
      );
    });

    test("businessHours が指定されている場合は各曜日の isOpen と slots に変換される", async () => {
      await createLocation(VALID_FORM_DATA);

      expect(mockLocationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            businessHours: expect.objectContaining({
              monday: {
                isOpen: true,
                slots: [{ openTime: "09:00", closeTime: "18:00" }],
              },
              saturday: { isOpen: false, slots: [] },
            }),
          }),
        }),
      );
    });

    test("imageUrls が空配列の場合も正常に作成できる", async () => {
      await createLocation({ ...VALID_FORM_DATA, imageUrls: [] });

      expect(mockLocationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            imageUrls: [],
          }),
        }),
      );
    });
  });
});

// =============================================================================
// updateLocation
// =============================================================================

describe("updateLocation", () => {
  beforeEach(() => {
    mockLocationFindUnique.mockReset();
    mockLocationUpdate.mockReset();
    mockLocationFindUnique.mockResolvedValue(null);
    mockLocationUpdate.mockResolvedValue({ id: LOCATION_ID });
  });

  describe("正常系", () => {
    test("存在する場所の情報を更新できる", async () => {
      mockLocationFindUnique.mockResolvedValue(EXISTING_LOCATION);

      const result = await updateLocation(LOCATION_ID, VALID_FORM_DATA);

      expect(result).toEqual({ id: LOCATION_ID, slug: "shibuya-space" });
      expect(mockLocationUpdate).toHaveBeenCalledTimes(1);
    });

    test("update が正しい where 条件で呼ばれる", async () => {
      mockLocationFindUnique.mockResolvedValue(EXISTING_LOCATION);

      await updateLocation(LOCATION_ID, VALID_FORM_DATA);

      expect(mockLocationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: LOCATION_ID },
        }),
      );
    });

    test("update が正しいデータで呼ばれる", async () => {
      mockLocationFindUnique.mockResolvedValue(EXISTING_LOCATION);

      await updateLocation(LOCATION_ID, VALID_FORM_DATA);

      expect(mockLocationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "渋谷スペース",
            address: "東京都渋谷区1-1-1",
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("存在しない場所 ID で NOT_FOUND エラーをスローする", async () => {
      mockLocationFindUnique.mockResolvedValue(null);

      await expect(
        updateLocation("non-existent", VALID_FORM_DATA),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "場所が見つかりません",
      });
    });

    test("存在しない場合は update が呼ばれない", async () => {
      mockLocationFindUnique.mockResolvedValue(null);

      await expect(
        updateLocation("non-existent", VALID_FORM_DATA),
      ).rejects.toThrow(DomainError);

      expect(mockLocationUpdate).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// updateLocationPublished
// =============================================================================

describe("updateLocationPublished", () => {
  beforeEach(() => {
    mockLocationFindUnique.mockReset();
    mockLocationUpdate.mockReset();
    mockLocationFindUnique.mockResolvedValue(null);
    mockLocationUpdate.mockResolvedValue({ id: LOCATION_ID });
  });

  describe("正常系", () => {
    test("場所を公開状態に切り替えると id と isPublished を返す", async () => {
      mockLocationFindUnique.mockResolvedValue(EXISTING_LOCATION);

      const result = await updateLocationPublished(LOCATION_ID, true);

      expect(result).toEqual({ id: LOCATION_ID, isPublished: true });
    });

    test("場所を非公開状態に切り替えると isPublished: false を返す", async () => {
      mockLocationFindUnique.mockResolvedValue(EXISTING_LOCATION);

      const result = await updateLocationPublished(LOCATION_ID, false);

      expect(result).toEqual({ id: LOCATION_ID, isPublished: false });
    });

    test("公開切り替え時に update が正しいデータで呼ばれる", async () => {
      mockLocationFindUnique.mockResolvedValue(EXISTING_LOCATION);

      await updateLocationPublished(LOCATION_ID, true);

      expect(mockLocationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: LOCATION_ID },
          data: { isPublished: true },
        }),
      );
    });
  });

  describe("異常系", () => {
    test("存在しない場所 ID で NOT_FOUND エラーをスローする", async () => {
      mockLocationFindUnique.mockResolvedValue(null);

      await expect(
        updateLocationPublished("non-existent", true),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "場所が見つかりません",
      });
    });

    test("存在しない場合は update が呼ばれない", async () => {
      mockLocationFindUnique.mockResolvedValue(null);

      await expect(
        updateLocationPublished("non-existent", true),
      ).rejects.toThrow(DomainError);

      expect(mockLocationUpdate).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// updateLocationOrder
// =============================================================================

describe("updateLocationOrder", () => {
  beforeEach(() => {
    mockTransaction.mockReset();
    mockLocationUpdate.mockReset();
    mockTransaction.mockResolvedValue([]);
  });

  describe("正常系", () => {
    test("複数アイテムの並び順を更新し updated 件数を返す", async () => {
      const items = [
        { id: "location-1", sortOrder: 0 },
        { id: "location-2", sortOrder: 1 },
        { id: "location-3", sortOrder: 2 },
      ];

      const result = await updateLocationOrder(items);

      expect(result).toEqual({ updated: 3 });
    });

    test("各アイテムに対して location.update が並列実行される（$transaction は使わない）", async () => {
      const items = [
        { id: "location-1", sortOrder: 0 },
        { id: "location-2", sortOrder: 1 },
      ];

      await updateLocationOrder(items);

      expect(mockLocationUpdate).toHaveBeenCalledTimes(2);
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    test("空配列を渡すと updated: 0 を返す", async () => {
      const result = await updateLocationOrder([]);

      expect(result).toEqual({ updated: 0 });
    });

    test("1件の場合も updated: 1 を返す", async () => {
      const result = await updateLocationOrder([
        { id: "location-1", sortOrder: 5 },
      ]);

      expect(result).toEqual({ updated: 1 });
    });
  });
});

// =============================================================================
// deleteLocation（ソフトデリート）
// =============================================================================

describe("deleteLocation", () => {
  beforeEach(() => {
    mockLocationFindUnique.mockReset();
    mockLocationUpdate.mockReset();
    mockLocationFindUnique.mockResolvedValue(null);
    mockLocationUpdate.mockResolvedValue({ id: LOCATION_ID });
  });

  describe("正常系", () => {
    test("スペースが紐づいていない場所を論理削除できる", async () => {
      mockLocationFindUnique.mockResolvedValue(EXISTING_LOCATION);

      const result = await deleteLocation(LOCATION_ID);

      expect(result).toEqual({ id: LOCATION_ID });
    });

    test("論理削除時に isActive: false で update が呼ばれる", async () => {
      mockLocationFindUnique.mockResolvedValue(EXISTING_LOCATION);

      await deleteLocation(LOCATION_ID);

      expect(mockLocationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: LOCATION_ID },
          data: { isActive: false },
        }),
      );
    });
  });

  describe("異常系", () => {
    test("存在しない場所 ID で NOT_FOUND エラーをスローする", async () => {
      mockLocationFindUnique.mockResolvedValue(null);

      await expect(deleteLocation("non-existent")).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "場所が見つかりません",
      });
    });

    test("スペースが紐づいている場合は CONFLICT エラーをスローする", async () => {
      mockLocationFindUnique.mockResolvedValue({
        id: LOCATION_ID,
        _count: { spaces: 3 },
      });

      await expect(deleteLocation(LOCATION_ID)).rejects.toMatchObject({
        code: "CONFLICT",
        message: expect.stringContaining("3件のスペース"),
      });
    });

    test("スペースが紐づいている場合は update が呼ばれない", async () => {
      mockLocationFindUnique.mockResolvedValue({
        id: LOCATION_ID,
        _count: { spaces: 1 },
      });

      await expect(deleteLocation(LOCATION_ID)).rejects.toThrow(DomainError);

      expect(mockLocationUpdate).not.toHaveBeenCalled();
    });

    test("スペースが紐づいていない場合は CONFLICT エラーにならない", async () => {
      mockLocationFindUnique.mockResolvedValue({
        id: LOCATION_ID,
        _count: { spaces: 0 },
      });

      const result = await deleteLocation(LOCATION_ID);

      expect(result).toEqual({ id: LOCATION_ID });
    });
  });
});

// =============================================================================
// hardDeleteLocation（物理削除）
// =============================================================================

describe("hardDeleteLocation", () => {
  beforeEach(() => {
    mockLocationFindUnique.mockReset();
    mockLocationDelete.mockReset();
    mockLocationFindUnique.mockResolvedValue(null);
    mockLocationDelete.mockResolvedValue({ id: LOCATION_ID });
  });

  describe("正常系", () => {
    test("スペースが紐づいていない場所を物理削除できる", async () => {
      mockLocationFindUnique.mockResolvedValue(EXISTING_LOCATION);

      const result = await hardDeleteLocation(LOCATION_ID);

      expect(result).toEqual({ id: LOCATION_ID });
    });

    test("delete が正しい where 条件で呼ばれる", async () => {
      mockLocationFindUnique.mockResolvedValue(EXISTING_LOCATION);

      await hardDeleteLocation(LOCATION_ID);

      expect(mockLocationDelete).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: LOCATION_ID },
        }),
      );
    });
  });

  describe("異常系", () => {
    test("存在しない場所 ID で NOT_FOUND エラーをスローする", async () => {
      mockLocationFindUnique.mockResolvedValue(null);

      await expect(hardDeleteLocation("non-existent")).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "場所が見つかりません",
      });
    });

    test("スペースが紐づいている場合は CONFLICT エラーをスローする", async () => {
      mockLocationFindUnique.mockResolvedValue({
        id: LOCATION_ID,
        _count: { spaces: 2 },
      });

      await expect(hardDeleteLocation(LOCATION_ID)).rejects.toMatchObject({
        code: "CONFLICT",
        message: expect.stringContaining("2件のスペース"),
      });
    });

    test("スペースが紐づいている場合は delete が呼ばれない", async () => {
      mockLocationFindUnique.mockResolvedValue({
        id: LOCATION_ID,
        _count: { spaces: 1 },
      });

      await expect(hardDeleteLocation(LOCATION_ID)).rejects.toThrow(
        DomainError,
      );

      expect(mockLocationDelete).not.toHaveBeenCalled();
    });
  });

  describe("deleteLocation との違い", () => {
    test("hardDeleteLocation は delete（物理削除）を使い update（論理削除）は使わない", async () => {
      mockLocationFindUnique.mockReset();
      mockLocationDelete.mockReset();
      mockLocationUpdate.mockReset();
      mockLocationFindUnique.mockResolvedValue(EXISTING_LOCATION);
      mockLocationDelete.mockResolvedValue({ id: LOCATION_ID });

      await hardDeleteLocation(LOCATION_ID);

      expect(mockLocationDelete).toHaveBeenCalledTimes(1);
      expect(mockLocationUpdate).not.toHaveBeenCalled();
    });

    test("deleteLocation は update（論理削除）を使い delete（物理削除）は使わない", async () => {
      mockLocationFindUnique.mockReset();
      mockLocationUpdate.mockReset();
      mockLocationDelete.mockReset();
      mockLocationFindUnique.mockResolvedValue(EXISTING_LOCATION);
      mockLocationUpdate.mockResolvedValue({ id: LOCATION_ID });

      await deleteLocation(LOCATION_ID);

      expect(mockLocationUpdate).toHaveBeenCalledTimes(1);
      expect(mockLocationDelete).not.toHaveBeenCalled();
    });
  });
});
