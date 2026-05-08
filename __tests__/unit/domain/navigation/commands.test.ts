import { describe, test, expect, mock, beforeEach } from "bun:test";

// Prisma モック関数（mock.module より先に定義 — TDZ 回避）
const mockNavigationItemCreate = mock<() => Promise<Record<string, unknown>>>(
  () => Promise.resolve({ id: "nav-1" }),
);

const mockNavigationItemFindUnique = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));

const mockNavigationItemUpdate = mock<() => Promise<Record<string, unknown>>>(
  () => Promise.resolve({ id: "nav-1" }),
);

const mockNavigationItemDelete = mock<() => Promise<Record<string, unknown>>>(
  () => Promise.resolve({ id: "nav-1" }),
);

const mockSocialLinkCreate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "social-1" }),
);

const mockSocialLinkFindUnique = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));

const mockSocialLinkUpdate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "social-1" }),
);

const mockSocialLinkDelete = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "social-1" }),
);

const mockTransaction = mock<
  (ops: unknown[]) => Promise<Record<string, unknown>[]>
>(() => Promise.resolve([]));

// モジュールモック（import より前に配置）
mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    navigationItem: {
      create: mockNavigationItemCreate,
      findUnique: mockNavigationItemFindUnique,
      update: mockNavigationItemUpdate,
      delete: mockNavigationItemDelete,
    },
    socialLink: {
      create: mockSocialLinkCreate,
      findUnique: mockSocialLinkFindUnique,
      update: mockSocialLinkUpdate,
      delete: mockSocialLinkDelete,
    },
    $transaction: mockTransaction,
  },
}));

mock.module("@generated/prisma/enums", () => ({
  NavigationType: {
    HEADER_DESKTOP: "HEADER_DESKTOP",
    HEADER_MOBILE: "HEADER_MOBILE",
    FOOTER: "FOOTER",
  },
  SocialPlatform: {
    TWITTER: "TWITTER",
    FACEBOOK: "FACEBOOK",
    INSTAGRAM: "INSTAGRAM",
    YOUTUBE: "YOUTUBE",
    LINE: "LINE",
    TIKTOK: "TIKTOK",
    OTHER: "OTHER",
  },
}));

import {
  createNavigationItem,
  updateNavigationItem,
  deleteNavigationItem,
  updateNavigationOrder,
  createSocialLink,
  updateSocialLink,
  deleteSocialLink,
  updateSocialLinkOrder,
  navigationItemInputSchema,
  navigationOrderInputSchema,
  socialLinkInputSchema,
  socialLinkOrderInputSchema,
} from "@/shared/domain/navigation/commands";
import { DomainError } from "@/shared/domain/domain-error";

// =============================================================================
// テスト用定数
// =============================================================================

const NAV_ID = "nav-1";
const SOCIAL_ID = "social-1";

const VALID_NAV_INPUT = {
  type: "HEADER_DESKTOP" as const,
  label: [{ _key: "tk-home", type: "text" as const, value: "ホーム" }],
  url: "/",
  isExternal: false,
  order: 0,
  isActive: true,
};

const VALID_SOCIAL_INPUT = {
  platform: "TWITTER" as const,
  url: "https://twitter.com/example",
  order: 0,
  isActive: true,
  showOnDesktop: true,
  showOnMobile: true,
};

// =============================================================================
// navigationItemInputSchema バリデーション
// =============================================================================

describe("navigationItemInputSchema バリデーション", () => {
  describe("正常系", () => {
    test("有効な最小データで通過する", () => {
      const result = navigationItemInputSchema.safeParse(VALID_NAV_INPUT);
      expect(result.success).toBe(true);
    });

    test("parentId が null の場合も通過する", () => {
      const result = navigationItemInputSchema.safeParse({
        ...VALID_NAV_INPUT,
        parentId: null,
      });
      expect(result.success).toBe(true);
    });

    test("parentId が省略された場合も通過する", () => {
      const result = navigationItemInputSchema.safeParse(VALID_NAV_INPUT);
      expect(result.success).toBe(true);
    });

    test("isExternal のデフォルト値は false", () => {
      const { isExternal: _unused, ...inputWithoutExternal } = VALID_NAV_INPUT;
      void _unused;
      const result = navigationItemInputSchema.safeParse(inputWithoutExternal);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isExternal).toBe(false);
      }
    });

    test("isActive のデフォルト値は true", () => {
      const { isActive: _unused, ...inputWithoutActive } = VALID_NAV_INPUT;
      void _unused;
      const result = navigationItemInputSchema.safeParse(inputWithoutActive);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isActive).toBe(true);
      }
    });

    test("type が HEADER_MOBILE の場合も通過する", () => {
      const result = navigationItemInputSchema.safeParse({
        ...VALID_NAV_INPUT,
        type: "HEADER_MOBILE",
      });
      expect(result.success).toBe(true);
    });

    test("type が FOOTER の場合も通過する", () => {
      const result = navigationItemInputSchema.safeParse({
        ...VALID_NAV_INPUT,
        type: "FOOTER",
      });
      expect(result.success).toBe(true);
    });

    test("label の text token が200文字以内なら通過する", () => {
      const result = navigationItemInputSchema.safeParse({
        ...VALID_NAV_INPUT,
        label: [{ _key: "k", type: "text" as const, value: "あ".repeat(200) }],
      });
      expect(result.success).toBe(true);
    });

    test("label に icon token を含めて通過する", () => {
      const result = navigationItemInputSchema.safeParse({
        ...VALID_NAV_INPUT,
        label: [
          { _key: "k", type: "icon" as const, name: "IconHome" },
          { _key: "k", type: "text" as const, value: "ホーム" },
        ],
      });
      expect(result.success).toBe(true);
    });

    test("url が500文字のとき通過する", () => {
      const result = navigationItemInputSchema.safeParse({
        ...VALID_NAV_INPUT,
        url: "https://example.com/" + "a".repeat(480),
      });
      expect(result.success).toBe(true);
    });
  });

  describe("異常系", () => {
    test("label が空配列で失敗する", () => {
      const result = navigationItemInputSchema.safeParse({
        ...VALID_NAV_INPUT,
        label: [],
      });
      expect(result.success).toBe(false);
    });

    test("label に text token がない（icon のみ）で失敗する (icon-only モード禁止)", () => {
      const result = navigationItemInputSchema.safeParse({
        ...VALID_NAV_INPUT,
        label: [{ _key: "k", type: "icon" as const, name: "IconHome" }],
      });
      expect(result.success).toBe(false);
    });

    test("label の text token が201文字で失敗する", () => {
      const result = navigationItemInputSchema.safeParse({
        ...VALID_NAV_INPUT,
        label: [{ _key: "k", type: "text" as const, value: "あ".repeat(201) }],
      });
      expect(result.success).toBe(false);
    });

    test("url が空文字で失敗する", () => {
      const result = navigationItemInputSchema.safeParse({
        ...VALID_NAV_INPUT,
        url: "",
      });
      expect(result.success).toBe(false);
    });

    test("url が501文字で失敗する", () => {
      const result = navigationItemInputSchema.safeParse({
        ...VALID_NAV_INPUT,
        url: "https://example.com/" + "a".repeat(481),
      });
      expect(result.success).toBe(false);
    });

    test("type が不正な値で失敗する", () => {
      const result = navigationItemInputSchema.safeParse({
        ...VALID_NAV_INPUT,
        type: "INVALID_TYPE",
      });
      expect(result.success).toBe(false);
    });

    test("order が負の値で失敗する", () => {
      const result = navigationItemInputSchema.safeParse({
        ...VALID_NAV_INPUT,
        order: -1,
      });
      expect(result.success).toBe(false);
    });

    test("order が小数で失敗する", () => {
      const result = navigationItemInputSchema.safeParse({
        ...VALID_NAV_INPUT,
        order: 1.5,
      });
      expect(result.success).toBe(false);
    });
  });
});

// =============================================================================
// navigationOrderInputSchema バリデーション
// =============================================================================

describe("navigationOrderInputSchema バリデーション", () => {
  describe("正常系", () => {
    test("有効なアイテム配列で通過する", () => {
      const result = navigationOrderInputSchema.safeParse([
        { id: "550e8400-e29b-41d4-a716-446655440000", order: 0 },
        { id: "550e8400-e29b-41d4-a716-446655440001", order: 1 },
      ]);
      expect(result.success).toBe(true);
    });

    test("空配列で通過する", () => {
      const result = navigationOrderInputSchema.safeParse([]);
      expect(result.success).toBe(true);
    });

    test("parentId が null の場合も通過する", () => {
      const result = navigationOrderInputSchema.safeParse([
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          order: 0,
          parentId: null,
        },
      ]);
      expect(result.success).toBe(true);
    });
  });

  describe("異常系", () => {
    test("id が UUID でない場合に失敗する", () => {
      const result = navigationOrderInputSchema.safeParse([
        { id: "not-a-uuid", order: 0 },
      ]);
      expect(result.success).toBe(false);
    });

    test("order が負の値で失敗する", () => {
      const result = navigationOrderInputSchema.safeParse([
        { id: "550e8400-e29b-41d4-a716-446655440000", order: -1 },
      ]);
      expect(result.success).toBe(false);
    });
  });
});

// =============================================================================
// socialLinkInputSchema バリデーション
// =============================================================================

describe("socialLinkInputSchema バリデーション", () => {
  describe("正常系", () => {
    test("有効な最小データで通過する", () => {
      const result = socialLinkInputSchema.safeParse(VALID_SOCIAL_INPUT);
      expect(result.success).toBe(true);
    });

    test("showOnDesktop のデフォルト値は true", () => {
      const { showOnDesktop: _unused, ...input } = VALID_SOCIAL_INPUT;
      void _unused;
      const result = socialLinkInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.showOnDesktop).toBe(true);
      }
    });

    test("showOnMobile のデフォルト値は true", () => {
      const { showOnMobile: _unused, ...input } = VALID_SOCIAL_INPUT;
      void _unused;
      const result = socialLinkInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.showOnMobile).toBe(true);
      }
    });

    test("全プラットフォーム種別で通過する", () => {
      const platforms = [
        "TWITTER",
        "FACEBOOK",
        "INSTAGRAM",
        "YOUTUBE",
        "LINE",
        "TIKTOK",
        "OTHER",
      ] as const;
      for (const platform of platforms) {
        const result = socialLinkInputSchema.safeParse({
          ...VALID_SOCIAL_INPUT,
          platform,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe("異常系", () => {
    test("url が空文字で失敗する", () => {
      const result = socialLinkInputSchema.safeParse({
        ...VALID_SOCIAL_INPUT,
        url: "",
      });
      expect(result.success).toBe(false);
    });

    test("url が有効な URL でない場合に失敗する", () => {
      const result = socialLinkInputSchema.safeParse({
        ...VALID_SOCIAL_INPUT,
        url: "not-a-url",
      });
      expect(result.success).toBe(false);
    });

    test("platform が不正な値で失敗する", () => {
      const result = socialLinkInputSchema.safeParse({
        ...VALID_SOCIAL_INPUT,
        platform: "INVALID_PLATFORM",
      });
      expect(result.success).toBe(false);
    });

    test("order が負の値で失敗する", () => {
      const result = socialLinkInputSchema.safeParse({
        ...VALID_SOCIAL_INPUT,
        order: -1,
      });
      expect(result.success).toBe(false);
    });
  });
});

// =============================================================================
// socialLinkOrderInputSchema バリデーション
// =============================================================================

describe("socialLinkOrderInputSchema バリデーション", () => {
  describe("正常系", () => {
    test("有効なアイテム配列で通過する", () => {
      const result = socialLinkOrderInputSchema.safeParse([
        { id: "550e8400-e29b-41d4-a716-446655440000", order: 0 },
        { id: "550e8400-e29b-41d4-a716-446655440001", order: 1 },
      ]);
      expect(result.success).toBe(true);
    });

    test("空配列で通過する", () => {
      const result = socialLinkOrderInputSchema.safeParse([]);
      expect(result.success).toBe(true);
    });
  });

  describe("異常系", () => {
    test("id が UUID でない場合に失敗する", () => {
      const result = socialLinkOrderInputSchema.safeParse([
        { id: "not-a-uuid", order: 0 },
      ]);
      expect(result.success).toBe(false);
    });
  });
});

// =============================================================================
// createNavigationItem
// =============================================================================

describe("createNavigationItem", () => {
  beforeEach(() => {
    mockNavigationItemCreate.mockReset();
    mockNavigationItemCreate.mockResolvedValue({ id: NAV_ID });
  });

  describe("正常系", () => {
    test("有効な入力でナビゲーションアイテムを作成できる", async () => {
      const result = await createNavigationItem(VALID_NAV_INPUT);

      expect(result).toEqual({ id: NAV_ID });
      expect(mockNavigationItemCreate).toHaveBeenCalledTimes(1);
    });

    test("create が正しいデータで呼ばれる", async () => {
      await createNavigationItem(VALID_NAV_INPUT);

      expect(mockNavigationItemCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "HEADER_DESKTOP",
            label: [{ _key: "tk-home", type: "text", value: "ホーム" }],
            url: "/",
            isExternal: false,
            order: 0,
            isActive: true,
          }),
        }),
      );
    });

    test("parentId が省略された場合 null が設定される", async () => {
      await createNavigationItem(VALID_NAV_INPUT);

      expect(mockNavigationItemCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            parentId: null,
          }),
        }),
      );
    });

    test("parentId が明示的に null の場合も null が設定される", async () => {
      await createNavigationItem({ ...VALID_NAV_INPUT, parentId: null });

      expect(mockNavigationItemCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            parentId: null,
          }),
        }),
      );
    });

    test("isExternal が true の場合も正常に作成できる", async () => {
      const result = await createNavigationItem({
        ...VALID_NAV_INPUT,
        isExternal: true,
      });

      expect(result).toEqual({ id: NAV_ID });
    });
  });
});

// =============================================================================
// updateNavigationItem
// =============================================================================

describe("updateNavigationItem", () => {
  beforeEach(() => {
    mockNavigationItemFindUnique.mockReset();
    mockNavigationItemUpdate.mockReset();
    mockNavigationItemFindUnique.mockResolvedValue({ id: NAV_ID });
    mockNavigationItemUpdate.mockResolvedValue({ id: NAV_ID });
  });

  describe("正常系", () => {
    test("既存アイテムを更新できる", async () => {
      await updateNavigationItem(NAV_ID, VALID_NAV_INPUT);

      expect(mockNavigationItemUpdate).toHaveBeenCalledTimes(1);
    });

    test("update が正しい where 条件で呼ばれる", async () => {
      await updateNavigationItem(NAV_ID, VALID_NAV_INPUT);

      expect(mockNavigationItemUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: NAV_ID },
        }),
      );
    });

    test("update が正しいデータで呼ばれる", async () => {
      const labelTokens = [
        { _key: "tk-update", type: "text" as const, value: "更新後ラベル" },
      ];
      await updateNavigationItem(NAV_ID, {
        ...VALID_NAV_INPUT,
        label: labelTokens,
      });

      expect(mockNavigationItemUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            label: labelTokens,
          }),
        }),
      );
    });

    test("parentId が省略された場合 null が設定される", async () => {
      await updateNavigationItem(NAV_ID, VALID_NAV_INPUT);

      expect(mockNavigationItemUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            parentId: null,
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("存在しない ID で NOT_FOUND エラーをスローする", async () => {
      mockNavigationItemFindUnique.mockResolvedValue(null);

      await expect(
        updateNavigationItem("non-existent", VALID_NAV_INPUT),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "ナビゲーションが見つかりません",
      });
    });

    test("存在しない場合は update が呼ばれない", async () => {
      mockNavigationItemFindUnique.mockResolvedValue(null);

      await expect(
        updateNavigationItem("non-existent", VALID_NAV_INPUT),
      ).rejects.toThrow(DomainError);

      expect(mockNavigationItemUpdate).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// deleteNavigationItem
// =============================================================================

describe("deleteNavigationItem", () => {
  beforeEach(() => {
    mockNavigationItemFindUnique.mockReset();
    mockNavigationItemDelete.mockReset();
    mockNavigationItemFindUnique.mockResolvedValue({
      id: NAV_ID,
      children: [],
    });
    mockNavigationItemDelete.mockResolvedValue({ id: NAV_ID });
  });

  describe("正常系", () => {
    test("子アイテムがないナビゲーションアイテムを削除できる", async () => {
      await deleteNavigationItem(NAV_ID);

      expect(mockNavigationItemDelete).toHaveBeenCalledTimes(1);
    });

    test("delete が正しい where 条件で呼ばれる", async () => {
      await deleteNavigationItem(NAV_ID);

      expect(mockNavigationItemDelete).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: NAV_ID },
        }),
      );
    });
  });

  describe("異常系", () => {
    test("存在しない ID で NOT_FOUND エラーをスローする", async () => {
      mockNavigationItemFindUnique.mockResolvedValue(null);

      await expect(deleteNavigationItem("non-existent")).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "ナビゲーションが見つかりません",
      });
    });

    test("子アイテムが存在する場合 CONFLICT エラーをスローする", async () => {
      mockNavigationItemFindUnique.mockResolvedValue({
        id: NAV_ID,
        children: [{ id: "child-1" }, { id: "child-2" }],
      });

      await expect(deleteNavigationItem(NAV_ID)).rejects.toMatchObject({
        code: "CONFLICT",
        message: "サブメニューがあるため削除できません",
      });
    });

    test("子アイテムが存在する場合は delete が呼ばれない", async () => {
      mockNavigationItemFindUnique.mockResolvedValue({
        id: NAV_ID,
        children: [{ id: "child-1" }],
      });

      await expect(deleteNavigationItem(NAV_ID)).rejects.toThrow(DomainError);

      expect(mockNavigationItemDelete).not.toHaveBeenCalled();
    });

    test("存在しない場合は delete が呼ばれない", async () => {
      mockNavigationItemFindUnique.mockResolvedValue(null);

      await expect(deleteNavigationItem("non-existent")).rejects.toThrow(
        DomainError,
      );

      expect(mockNavigationItemDelete).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// updateNavigationOrder
// =============================================================================

describe("updateNavigationOrder", () => {
  beforeEach(() => {
    mockTransaction.mockReset();
    mockNavigationItemUpdate.mockReset();
    mockTransaction.mockResolvedValue([]);
  });

  describe("正常系", () => {
    test("複数アイテムの並び順を更新できる", async () => {
      const items = [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          order: 0,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440001",
          order: 1,
        },
      ];

      await updateNavigationOrder(items);

      expect(mockNavigationItemUpdate).toHaveBeenCalledTimes(2);
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    test("空配列を渡しても正常に処理される", async () => {
      await updateNavigationOrder([]);

      expect(mockNavigationItemUpdate).not.toHaveBeenCalled();
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    test("1件の場合も正常に処理される", async () => {
      await updateNavigationOrder([
        { id: "550e8400-e29b-41d4-a716-446655440000", order: 5 },
      ]);

      expect(mockNavigationItemUpdate).toHaveBeenCalledTimes(1);
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    test("parentId を含む場合も正常に処理される", async () => {
      const items = [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          order: 0,
          parentId: "550e8400-e29b-41d4-a716-446655440099",
        },
      ];

      await updateNavigationOrder(items);

      expect(mockNavigationItemUpdate).toHaveBeenCalledWith({
        where: { id: "550e8400-e29b-41d4-a716-446655440000" },
        data: {
          order: 0,
          parentId: "550e8400-e29b-41d4-a716-446655440099",
        },
      });
      expect(mockTransaction).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// createSocialLink
// =============================================================================

describe("createSocialLink", () => {
  beforeEach(() => {
    mockSocialLinkCreate.mockReset();
    mockSocialLinkCreate.mockResolvedValue({ id: SOCIAL_ID });
  });

  describe("正常系", () => {
    test("有効な入力でSNSリンクを作成できる", async () => {
      const result = await createSocialLink(VALID_SOCIAL_INPUT);

      expect(result).toEqual({ id: SOCIAL_ID });
      expect(mockSocialLinkCreate).toHaveBeenCalledTimes(1);
    });

    test("create が正しいデータで呼ばれる", async () => {
      await createSocialLink(VALID_SOCIAL_INPUT);

      expect(mockSocialLinkCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            platform: "TWITTER",
            url: "https://twitter.com/example",
            order: 0,
            isActive: true,
            showOnDesktop: true,
            showOnMobile: true,
          }),
        }),
      );
    });

    test("各プラットフォームで作成できる", async () => {
      const platforms = [
        "FACEBOOK",
        "INSTAGRAM",
        "YOUTUBE",
        "LINE",
        "TIKTOK",
        "OTHER",
      ] as const;

      for (const platform of platforms) {
        mockSocialLinkCreate.mockReset();
        mockSocialLinkCreate.mockResolvedValue({ id: SOCIAL_ID });

        const result = await createSocialLink({
          ...VALID_SOCIAL_INPUT,
          platform,
        });
        expect(result).toEqual({ id: SOCIAL_ID });
      }
    });
  });
});

// =============================================================================
// updateSocialLink
// =============================================================================

describe("updateSocialLink", () => {
  beforeEach(() => {
    mockSocialLinkFindUnique.mockReset();
    mockSocialLinkUpdate.mockReset();
    mockSocialLinkFindUnique.mockResolvedValue({ id: SOCIAL_ID });
    mockSocialLinkUpdate.mockResolvedValue({ id: SOCIAL_ID });
  });

  describe("正常系", () => {
    test("既存SNSリンクを更新できる", async () => {
      await updateSocialLink(SOCIAL_ID, VALID_SOCIAL_INPUT);

      expect(mockSocialLinkUpdate).toHaveBeenCalledTimes(1);
    });

    test("update が正しい where 条件で呼ばれる", async () => {
      await updateSocialLink(SOCIAL_ID, VALID_SOCIAL_INPUT);

      expect(mockSocialLinkUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: SOCIAL_ID },
        }),
      );
    });

    test("update が正しいデータで呼ばれる", async () => {
      await updateSocialLink(SOCIAL_ID, {
        ...VALID_SOCIAL_INPUT,
        url: "https://twitter.com/updated",
      });

      expect(mockSocialLinkUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            url: "https://twitter.com/updated",
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("存在しない ID で NOT_FOUND エラーをスローする", async () => {
      mockSocialLinkFindUnique.mockResolvedValue(null);

      await expect(
        updateSocialLink("non-existent", VALID_SOCIAL_INPUT),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "SNSリンクが見つかりません",
      });
    });

    test("存在しない場合は update が呼ばれない", async () => {
      mockSocialLinkFindUnique.mockResolvedValue(null);

      await expect(
        updateSocialLink("non-existent", VALID_SOCIAL_INPUT),
      ).rejects.toThrow(DomainError);

      expect(mockSocialLinkUpdate).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// deleteSocialLink
// =============================================================================

describe("deleteSocialLink", () => {
  beforeEach(() => {
    mockSocialLinkFindUnique.mockReset();
    mockSocialLinkDelete.mockReset();
    mockSocialLinkFindUnique.mockResolvedValue({ id: SOCIAL_ID });
    mockSocialLinkDelete.mockResolvedValue({ id: SOCIAL_ID });
  });

  describe("正常系", () => {
    test("存在するSNSリンクを削除できる", async () => {
      await deleteSocialLink(SOCIAL_ID);

      expect(mockSocialLinkDelete).toHaveBeenCalledTimes(1);
    });

    test("delete が正しい where 条件で呼ばれる", async () => {
      await deleteSocialLink(SOCIAL_ID);

      expect(mockSocialLinkDelete).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: SOCIAL_ID },
        }),
      );
    });
  });

  describe("異常系", () => {
    test("存在しない ID で NOT_FOUND エラーをスローする", async () => {
      mockSocialLinkFindUnique.mockResolvedValue(null);

      await expect(deleteSocialLink("non-existent")).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "SNSリンクが見つかりません",
      });
    });

    test("存在しない場合は delete が呼ばれない", async () => {
      mockSocialLinkFindUnique.mockResolvedValue(null);

      await expect(deleteSocialLink("non-existent")).rejects.toThrow(
        DomainError,
      );

      expect(mockSocialLinkDelete).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// updateSocialLinkOrder
// =============================================================================

describe("updateSocialLinkOrder", () => {
  beforeEach(() => {
    mockTransaction.mockReset();
    mockSocialLinkUpdate.mockReset();
    mockTransaction.mockResolvedValue([]);
  });

  describe("正常系", () => {
    test("複数アイテムの並び順を更新できる", async () => {
      const items = [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          order: 0,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440001",
          order: 1,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440002",
          order: 2,
        },
      ];

      await updateSocialLinkOrder(items);

      expect(mockSocialLinkUpdate).toHaveBeenCalledTimes(3);
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    test("空配列を渡しても正常に処理される", async () => {
      await updateSocialLinkOrder([]);

      expect(mockSocialLinkUpdate).not.toHaveBeenCalled();
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    test("1件の場合も正常に処理される", async () => {
      await updateSocialLinkOrder([
        { id: "550e8400-e29b-41d4-a716-446655440000", order: 3 },
      ]);

      expect(mockSocialLinkUpdate).toHaveBeenCalledTimes(1);
      expect(mockTransaction).not.toHaveBeenCalled();
    });
  });
});
