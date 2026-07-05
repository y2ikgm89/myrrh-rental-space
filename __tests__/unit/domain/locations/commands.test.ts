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

const mockLocationFindMany = mock<
  () => Promise<ReadonlyArray<Record<string, unknown>>>
>(() => Promise.resolve([]));

const mockLocationDelete = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "location-1" }),
);

const mockLocationAggregate = mock<
  () => Promise<{ _max: { sortOrder: number | null } }>
>(() => Promise.resolve({ _max: { sortOrder: null } }));

const mockTransaction = mock<
  (
    cb: (tx: {
      $executeRaw: typeof mockExecuteRaw;
      location: {
        create: typeof mockLocationCreate;
        aggregate: typeof mockLocationAggregate;
      };
    }) => Promise<unknown>,
  ) => Promise<unknown>
>((cb) =>
  cb({
    $executeRaw: mockExecuteRaw,
    location: {
      create: mockLocationCreate,
      aggregate: mockLocationAggregate,
    },
  }),
);

const mockExecuteRaw = mock<
  (strings: TemplateStringsArray, ...values: unknown[]) => Promise<number>
>(() => Promise.resolve(0));

// モジュールモック（import より前に配置）
mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    location: {
      findUnique: mockLocationFindUnique,
      findMany: mockLocationFindMany,
      create: mockLocationCreate,
      update: mockLocationUpdate,
      delete: mockLocationDelete,
      aggregate: mockLocationAggregate,
    },
    $transaction: mockTransaction,
    $executeRaw: mockExecuteRaw,
  },
}));

import {
  createLocation,
  updateLocation,
  updateLocationPublished,
  updateLocationOrder,
  deleteLocation,
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
const VALID_AMENITIES: Record<string, boolean> = { wifi: true, parking: true };

const VALID_FORM_DATA = {
  slug: "shibuya-space",
  name: "渋谷スペース",
  description: "渋谷駅近くのレンタルスペース",
  address: "東京都渋谷区1-1-1",
  accessLines: [{ value: "渋谷駅から徒歩5分" }],
  parkingInfo: "近隣コインパーキング",
  amenities: VALID_AMENITIES,
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
    mockLocationAggregate.mockReset();
    mockLocationFindUnique.mockReset();
    mockLocationFindUnique.mockResolvedValue(null);
    mockLocationAggregate.mockResolvedValue({ _max: { sortOrder: null } });
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

    test("sortOrder は末尾に自動採番される（maxOrder + 1）", async () => {
      mockLocationAggregate.mockResolvedValue({ _max: { sortOrder: 9 } });

      await createLocation(VALID_FORM_DATA);

      expect(mockLocationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sortOrder: 10 }),
        }),
      );
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

    test("更新対象は active な場所だけを存在扱いする", async () => {
      mockLocationFindUnique.mockResolvedValue(EXISTING_LOCATION);

      await updateLocation(LOCATION_ID, VALID_FORM_DATA);

      expect(mockLocationFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: LOCATION_ID, isActive: true },
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

    test("公開切り替え対象は active な場所だけを存在扱いする", async () => {
      mockLocationFindUnique.mockResolvedValue(EXISTING_LOCATION);

      await updateLocationPublished(LOCATION_ID, true);

      expect(mockLocationFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: LOCATION_ID, isActive: true },
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
    mockExecuteRaw.mockReset();
    mockLocationFindMany.mockReset();
    mockLocationUpdate.mockReset();
    mockTransaction.mockImplementation((cb) =>
      cb({
        $executeRaw: mockExecuteRaw,
        location: {
          create: mockLocationCreate,
          aggregate: mockLocationAggregate,
        },
      }),
    );
    mockExecuteRaw.mockResolvedValue(0);
    mockLocationFindMany.mockImplementation((args?: unknown) => {
      const where = (args as { where?: { id?: { in?: string[] } } } | undefined)
        ?.where;
      return Promise.resolve((where?.id?.in ?? []).map((id) => ({ id })));
    });
  });

  describe("正常系", () => {
    test("複数アイテムの並び順を更新し updated 件数を返す", async () => {
      const items = [
        { id: "location-1", sortOrder: 0 },
        { id: "location-2", sortOrder: 1 },
        { id: "location-3", sortOrder: 2 },
      ];
      mockLocationFindMany.mockResolvedValueOnce(
        items.map((item) => ({ id: item.id })),
      );

      const result = await updateLocationOrder(items);

      expect(result).toEqual({ updated: 3 });
    });

    test("CASE WHEN 二段更新で一括更新する（N 回 UPDATE は使わない）", async () => {
      const items = [
        { id: "location-1", sortOrder: 0 },
        { id: "location-2", sortOrder: 1 },
      ];
      mockLocationFindMany.mockResolvedValueOnce(
        items.map((item) => ({ id: item.id })),
      );

      await updateLocationOrder(items);

      expect(mockLocationUpdate).not.toHaveBeenCalled();
      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockExecuteRaw).toHaveBeenCalledTimes(3);
    });

    test("生成 SQL は locations / CASE / isActive を含む", async () => {
      const items = [
        { id: "location-1", sortOrder: 10 },
        { id: "location-2", sortOrder: 11 },
      ];
      mockLocationFindMany.mockResolvedValueOnce(
        items.map((item) => ({ id: item.id })),
      );

      await updateLocationOrder(items);

      for (const call of mockExecuteRaw.mock.calls.slice(1)) {
        const sql = call[0].join("?");
        expect(sql).toContain("locations");
        expect(sql).toContain("CASE");
        expect(sql).toContain("isActive");
      }
    });

    test("空配列を渡すと updated: 0 を返す", async () => {
      const result = await updateLocationOrder([]);

      expect(result).toEqual({ updated: 0 });
      expect(mockExecuteRaw).not.toHaveBeenCalled();
    });

    test("重複 ID は DB アクセス前に拒否する", async () => {
      await expect(
        updateLocationOrder([
          { id: "location-1", sortOrder: 0 },
          { id: "location-1", sortOrder: 1 },
        ]),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        message: "同じIDを複数指定することはできません",
      });
      expect(mockLocationFindMany).not.toHaveBeenCalled();
      expect(mockExecuteRaw).not.toHaveBeenCalled();
    });

    test("重複 sortOrder は DB アクセス前に拒否する", async () => {
      await expect(
        updateLocationOrder([
          { id: "location-1", sortOrder: 0 },
          { id: "location-2", sortOrder: 0 },
        ]),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        message: "同じ並び順を複数指定することはできません",
      });
      expect(mockLocationFindMany).not.toHaveBeenCalled();
      expect(mockExecuteRaw).not.toHaveBeenCalled();
    });

    test("1件の場合も updated: 1 を返す", async () => {
      const items = [{ id: "location-1", sortOrder: 5 }];
      mockLocationFindMany.mockResolvedValueOnce(
        items.map((item) => ({ id: item.id })),
      );

      const result = await updateLocationOrder(items);

      expect(result).toEqual({ updated: 1 });
    });

    test("存在しない場所が混ざる場合 SQL が実行されない", async () => {
      mockLocationFindMany.mockResolvedValue([{ id: "location-1" }]);

      await expect(
        updateLocationOrder([
          { id: "location-1", sortOrder: 0 },
          { id: "location-2", sortOrder: 1 },
        ]),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "場所が見つかりません",
      });
      expect(mockExecuteRaw).not.toHaveBeenCalled();
    });

    test("既存 ID の subset は過不足として拒否する", async () => {
      mockLocationFindMany.mockResolvedValueOnce([
        { id: "location-1" },
        { id: "location-2" },
        { id: "location-3" },
      ]);

      await expect(
        updateLocationOrder([
          { id: "location-1", sortOrder: 0 },
          { id: "location-2", sortOrder: 1 },
        ]),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        message: "場所数が一致しません（過不足）",
      });
      expect(mockExecuteRaw).not.toHaveBeenCalled();
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

    test("削除対象は active な場所だけを存在扱いする", async () => {
      mockLocationFindUnique.mockResolvedValue(EXISTING_LOCATION);

      await deleteLocation(LOCATION_ID);

      expect(mockLocationFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: LOCATION_ID, isActive: true },
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
