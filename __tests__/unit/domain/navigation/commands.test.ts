import { describe, test, expect, mock, beforeEach } from "bun:test";

// Prisma モック関数（mock.module より先に定義 — TDZ 回避）
const mockNavigationItemCreate = mock<() => Promise<Record<string, unknown>>>(
  () => Promise.resolve({ id: "nav-1" }),
);

const mockNavigationItemFindUnique = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));

const mockNavigationItemFindMany = mock<
  () => Promise<ReadonlyArray<Record<string, unknown>>>
>(() => Promise.resolve([]));

const mockNavigationItemUpdate = mock<
  (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>
>(() => Promise.resolve({ id: "nav-1" }));

const mockNavigationItemDelete = mock<() => Promise<Record<string, unknown>>>(
  () => Promise.resolve({ id: "nav-1" }),
);

const mockNavigationItemAggregate = mock<
  () => Promise<{ _max: { order: number | null } }>
>(() => Promise.resolve({ _max: { order: null } }));

const mockSocialLinkCreate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "social-1" }),
);

const mockSocialLinkFindUnique = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));

const mockSocialLinkFindMany = mock<
  () => Promise<ReadonlyArray<Record<string, unknown>>>
>(() => Promise.resolve([]));

const mockSocialLinkUpdate = mock<
  (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>
>(() => Promise.resolve({ id: "social-1" }));

const mockSocialLinkDelete = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "social-1" }),
);

const mockSocialLinkAggregate = mock<
  () => Promise<{ _max: { order: number | null } }>
>(() => Promise.resolve({ _max: { order: null } }));

const mockTransaction = mock<
  (
    cb: (tx: {
      $executeRaw: typeof mockExecuteRaw;
      navigationItem: {
        create: typeof mockNavigationItemCreate;
        aggregate: typeof mockNavigationItemAggregate;
      };
      socialLink: {
        create: typeof mockSocialLinkCreate;
        aggregate: typeof mockSocialLinkAggregate;
      };
    }) => Promise<unknown>,
  ) => Promise<unknown>
>((cb) =>
  cb({
    $executeRaw: mockExecuteRaw,
    navigationItem: {
      create: mockNavigationItemCreate,
      aggregate: mockNavigationItemAggregate,
    },
    socialLink: {
      create: mockSocialLinkCreate,
      aggregate: mockSocialLinkAggregate,
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
    navigationItem: {
      create: mockNavigationItemCreate,
      findUnique: mockNavigationItemFindUnique,
      findMany: mockNavigationItemFindMany,
      update: mockNavigationItemUpdate,
      delete: mockNavigationItemDelete,
      aggregate: mockNavigationItemAggregate,
    },
    socialLink: {
      create: mockSocialLinkCreate,
      findUnique: mockSocialLinkFindUnique,
      findMany: mockSocialLinkFindMany,
      update: mockSocialLinkUpdate,
      delete: mockSocialLinkDelete,
      aggregate: mockSocialLinkAggregate,
    },
    $transaction: mockTransaction,
    $executeRaw: mockExecuteRaw,
  },
}));

type SqlFragment = { __sql: string; __values: unknown[] };

function isSqlFragment(value: unknown): value is SqlFragment {
  return (
    typeof value === "object" &&
    value !== null &&
    "__sql" in value &&
    "__values" in value
  );
}

mock.module("@generated/prisma/client", () => {
  const sql = (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): SqlFragment => {
    let combined = "";
    for (let i = 0; i < strings.length; i++) {
      combined += strings[i];
      if (i < values.length) {
        const value = values[i];
        combined += isSqlFragment(value) ? value.__sql : "?";
      }
    }
    return { __sql: combined, __values: values };
  };

  return {
    Prisma: {
      sql,
      join: (items: SqlFragment[], separator = ", ") => ({
        __sql: items.map((item) => item.__sql).join(separator),
        __values: items.flatMap((item) => item.__values),
      }),
    },
  };
});

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
  label: [{ _key: "tk-home", _type: "span" as const, text: "ホーム" }],
  url: "/",
  isExternal: false,
  isActive: true,
};

const VALID_SOCIAL_INPUT = {
  platform: "TWITTER" as const,
  url: "https://twitter.com/example",
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
        label: [{ _key: "k", _type: "span" as const, text: "あ".repeat(200) }],
      });
      expect(result.success).toBe(true);
    });

    test("label に icon token を含めて通過する", () => {
      const result = navigationItemInputSchema.safeParse({
        ...VALID_NAV_INPUT,
        label: [
          { _key: "k", _type: "iconInline" as const, name: "IconHome" },
          { _key: "k", _type: "span" as const, text: "ホーム" },
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
        label: [{ _key: "k", _type: "iconInline" as const, name: "IconHome" }],
      });
      expect(result.success).toBe(false);
    });

    test("label の text token が501文字で失敗する（PortableTextSpan max 500）", () => {
      const result = navigationItemInputSchema.safeParse({
        ...VALID_NAV_INPUT,
        label: [{ _key: "k", _type: "span" as const, text: "あ".repeat(501) }],
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

    test("order は create/update 入力として拒否する", () => {
      const result = navigationItemInputSchema.safeParse({
        ...VALID_NAV_INPUT,
        order: 999,
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

    test("order が重複している場合に失敗する", () => {
      const result = navigationOrderInputSchema.safeParse([
        { id: "550e8400-e29b-41d4-a716-446655440000", order: 0 },
        { id: "550e8400-e29b-41d4-a716-446655440001", order: 0 },
      ]);
      expect(result.success).toBe(false);
    });

    test("自分自身を parentId に指定すると失敗する", () => {
      const result = navigationOrderInputSchema.safeParse([
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          order: 0,
          parentId: "550e8400-e29b-41d4-a716-446655440000",
        },
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

    test("order は create/update 入力として拒否する", () => {
      const result = socialLinkInputSchema.safeParse({
        ...VALID_SOCIAL_INPUT,
        order: 999,
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

    test("order が重複している場合に失敗する", () => {
      const result = socialLinkOrderInputSchema.safeParse([
        { id: "550e8400-e29b-41d4-a716-446655440000", order: 0 },
        { id: "550e8400-e29b-41d4-a716-446655440001", order: 0 },
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
    mockNavigationItemAggregate.mockReset();
    mockNavigationItemCreate.mockResolvedValue({ id: NAV_ID });
    mockNavigationItemAggregate.mockResolvedValue({ _max: { order: null } });
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
            label: [{ _key: "tk-home", _type: "span", text: "ホーム" }],
            url: "/",
            isExternal: false,
            order: 0,
            isActive: true,
          }),
        }),
      );
    });

    test("既存の同種メニューの末尾に order を自動採番する", async () => {
      mockNavigationItemAggregate.mockResolvedValue({ _max: { order: 7 } });

      await createNavigationItem(VALID_NAV_INPUT);

      expect(mockNavigationItemAggregate).toHaveBeenCalledWith({
        where: { type: "HEADER_DESKTOP" },
        _max: { order: true },
      });
      expect(mockNavigationItemCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            order: 8,
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
        { _key: "tk-update", _type: "span" as const, text: "更新後ラベル" },
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

    test("update は order を更新しない", async () => {
      await updateNavigationItem(NAV_ID, VALID_NAV_INPUT);

      const call = mockNavigationItemUpdate.mock.calls.at(-1)?.[0] as
        { data: Record<string, unknown> } | undefined;
      expect(call).toBeDefined();
      if (call) {
        expect(call.data).not.toHaveProperty("order");
      }
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
    mockNavigationItemFindMany.mockReset();
    mockNavigationItemUpdate.mockReset();
    mockExecuteRaw.mockReset();
    mockTransaction.mockImplementation((cb) =>
      cb({
        $executeRaw: mockExecuteRaw,
        navigationItem: {
          create: mockNavigationItemCreate,
          aggregate: mockNavigationItemAggregate,
        },
        socialLink: {
          create: mockSocialLinkCreate,
          aggregate: mockSocialLinkAggregate,
        },
      }),
    );
    mockExecuteRaw.mockResolvedValue(0);
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
      mockNavigationItemFindMany
        .mockResolvedValueOnce(
          items.map((item) => ({ id: item.id, type: "HEADER_DESKTOP" })),
        )
        .mockResolvedValueOnce(items.map((item) => ({ id: item.id })));

      await updateNavigationOrder(items);

      expect(mockNavigationItemUpdate).not.toHaveBeenCalled();
      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockExecuteRaw).toHaveBeenCalledTimes(3);
    });

    test("空配列を渡しても正常に処理される", async () => {
      await updateNavigationOrder([]);

      expect(mockNavigationItemFindMany).not.toHaveBeenCalled();
      expect(mockNavigationItemUpdate).not.toHaveBeenCalled();
      expect(mockExecuteRaw).not.toHaveBeenCalled();
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    test("1件の場合も正常に処理される", async () => {
      const items = [{ id: "550e8400-e29b-41d4-a716-446655440000", order: 5 }];
      mockNavigationItemFindMany
        .mockResolvedValueOnce(
          items.map((item) => ({ id: item.id, type: "HEADER_DESKTOP" })),
        )
        .mockResolvedValueOnce(items.map((item) => ({ id: item.id })));

      await updateNavigationOrder(items);

      expect(mockNavigationItemUpdate).not.toHaveBeenCalled();
      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockExecuteRaw).toHaveBeenCalledTimes(3);
    });

    test("parentId を含む場合も正常に処理される", async () => {
      const items = [
        {
          id: "550e8400-e29b-41d4-a716-446655440099",
          order: 0,
          parentId: null,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          order: 1,
          parentId: "550e8400-e29b-41d4-a716-446655440099",
        },
      ];
      mockNavigationItemFindMany
        .mockResolvedValueOnce(
          items.map((item) => ({ id: item.id, type: "HEADER_DESKTOP" })),
        )
        .mockResolvedValueOnce(items.map((item) => ({ id: item.id })))
        .mockResolvedValueOnce([
          {
            id: "550e8400-e29b-41d4-a716-446655440099",
            type: "HEADER_DESKTOP",
          },
        ]);

      await updateNavigationOrder(items);

      expect(mockNavigationItemUpdate).not.toHaveBeenCalled();
      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockExecuteRaw).toHaveBeenCalledTimes(3);
      const sql = mockExecuteRaw.mock.calls[2]?.[0].join("?") ?? "";
      expect(sql).toContain("navigation_items");
      expect(sql).toContain("parentId");
    });
  });

  describe("異常系", () => {
    test("重複 ID は DB アクセス前に拒否する", async () => {
      await expect(
        updateNavigationOrder([
          { id: "550e8400-e29b-41d4-a716-446655440000", order: 0 },
          { id: "550e8400-e29b-41d4-a716-446655440000", order: 1 },
        ]),
      ).rejects.toThrow("同じIDを複数指定することはできません");

      expect(mockNavigationItemFindMany).not.toHaveBeenCalled();
      expect(mockExecuteRaw).not.toHaveBeenCalled();
    });

    test("重複 order は DB アクセス前に拒否する", async () => {
      await expect(
        updateNavigationOrder([
          { id: "550e8400-e29b-41d4-a716-446655440000", order: 0 },
          { id: "550e8400-e29b-41d4-a716-446655440001", order: 0 },
        ]),
      ).rejects.toThrow("同じ順序を複数指定することはできません");

      expect(mockNavigationItemFindMany).not.toHaveBeenCalled();
      expect(mockExecuteRaw).not.toHaveBeenCalled();
    });

    test("存在しないナビゲーション ID が混ざる場合 SQL が実行されない", async () => {
      const items = [
        { id: "550e8400-e29b-41d4-a716-446655440000", order: 0 },
        { id: "550e8400-e29b-41d4-a716-446655440001", order: 1 },
      ];
      mockNavigationItemFindMany.mockResolvedValueOnce([
        { id: "550e8400-e29b-41d4-a716-446655440000", type: "HEADER_DESKTOP" },
      ]);

      await expect(updateNavigationOrder(items)).rejects.toThrow(
        "ナビゲーションが見つかりません",
      );

      expect(mockExecuteRaw).not.toHaveBeenCalled();
    });

    test("存在しない親 ID が混ざる場合 SQL が実行されない", async () => {
      const items = [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          order: 0,
          parentId: "550e8400-e29b-41d4-a716-446655440099",
        },
      ];
      mockNavigationItemFindMany
        .mockResolvedValueOnce([
          {
            id: "550e8400-e29b-41d4-a716-446655440000",
            type: "HEADER_DESKTOP",
          },
        ])
        .mockResolvedValueOnce([{ id: "550e8400-e29b-41d4-a716-446655440000" }])
        .mockResolvedValueOnce([]);

      await expect(updateNavigationOrder(items)).rejects.toThrow(
        "親ナビゲーションが見つかりません",
      );

      expect(mockExecuteRaw).not.toHaveBeenCalled();
    });

    test("同一 type の subset は過不足として拒否する", async () => {
      const items = [{ id: "550e8400-e29b-41d4-a716-446655440000", order: 0 }];
      mockNavigationItemFindMany
        .mockResolvedValueOnce([
          {
            id: "550e8400-e29b-41d4-a716-446655440000",
            type: "HEADER_DESKTOP",
          },
        ])
        .mockResolvedValueOnce([
          { id: "550e8400-e29b-41d4-a716-446655440000" },
          { id: "550e8400-e29b-41d4-a716-446655440001" },
        ]);

      await expect(updateNavigationOrder(items)).rejects.toThrow(
        "ナビゲーション数が一致しません",
      );

      expect(mockExecuteRaw).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// createSocialLink
// =============================================================================

describe("createSocialLink", () => {
  beforeEach(() => {
    mockSocialLinkCreate.mockReset();
    mockSocialLinkAggregate.mockReset();
    mockSocialLinkCreate.mockResolvedValue({ id: SOCIAL_ID });
    mockSocialLinkAggregate.mockResolvedValue({ _max: { order: null } });
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

    test("既存SNSリンクの末尾に order を自動採番する", async () => {
      mockSocialLinkAggregate.mockResolvedValue({ _max: { order: 11 } });

      await createSocialLink(VALID_SOCIAL_INPUT);

      expect(mockSocialLinkAggregate).toHaveBeenCalledWith({
        _max: { order: true },
      });
      expect(mockSocialLinkCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            order: 12,
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
        mockSocialLinkAggregate.mockReset();
        mockSocialLinkCreate.mockResolvedValue({ id: SOCIAL_ID });
        mockSocialLinkAggregate.mockResolvedValue({ _max: { order: null } });

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

    test("update は order を更新しない", async () => {
      await updateSocialLink(SOCIAL_ID, VALID_SOCIAL_INPUT);

      const call = mockSocialLinkUpdate.mock.calls.at(-1)?.[0] as
        { data: Record<string, unknown> } | undefined;
      expect(call).toBeDefined();
      if (call) {
        expect(call.data).not.toHaveProperty("order");
      }
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
    mockSocialLinkFindMany.mockReset();
    mockSocialLinkUpdate.mockReset();
    mockExecuteRaw.mockReset();
    mockTransaction.mockImplementation((cb) =>
      cb({
        $executeRaw: mockExecuteRaw,
        navigationItem: {
          create: mockNavigationItemCreate,
          aggregate: mockNavigationItemAggregate,
        },
        socialLink: {
          create: mockSocialLinkCreate,
          aggregate: mockSocialLinkAggregate,
        },
      }),
    );
    mockExecuteRaw.mockResolvedValue(0);
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
      mockSocialLinkFindMany.mockResolvedValueOnce(
        items.map((item) => ({ id: item.id })),
      );

      await updateSocialLinkOrder(items);

      expect(mockSocialLinkUpdate).not.toHaveBeenCalled();
      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockExecuteRaw).toHaveBeenCalledTimes(3);
    });

    test("空配列を渡しても正常に処理される", async () => {
      await updateSocialLinkOrder([]);

      expect(mockSocialLinkFindMany).not.toHaveBeenCalled();
      expect(mockSocialLinkUpdate).not.toHaveBeenCalled();
      expect(mockExecuteRaw).not.toHaveBeenCalled();
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    test("1件の場合も正常に処理される", async () => {
      const items = [{ id: "550e8400-e29b-41d4-a716-446655440000", order: 3 }];
      mockSocialLinkFindMany.mockResolvedValueOnce(
        items.map((item) => ({ id: item.id })),
      );

      await updateSocialLinkOrder(items);

      expect(mockSocialLinkUpdate).not.toHaveBeenCalled();
      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockExecuteRaw).toHaveBeenCalledTimes(3);
    });
  });

  describe("異常系", () => {
    test("重複 ID は DB アクセス前に拒否する", async () => {
      await expect(
        updateSocialLinkOrder([
          { id: "550e8400-e29b-41d4-a716-446655440000", order: 0 },
          { id: "550e8400-e29b-41d4-a716-446655440000", order: 1 },
        ]),
      ).rejects.toThrow("同じIDを複数指定することはできません");

      expect(mockSocialLinkFindMany).not.toHaveBeenCalled();
      expect(mockExecuteRaw).not.toHaveBeenCalled();
    });

    test("重複 order は DB アクセス前に拒否する", async () => {
      await expect(
        updateSocialLinkOrder([
          { id: "550e8400-e29b-41d4-a716-446655440000", order: 0 },
          { id: "550e8400-e29b-41d4-a716-446655440001", order: 0 },
        ]),
      ).rejects.toThrow("同じ順序を複数指定することはできません");

      expect(mockSocialLinkFindMany).not.toHaveBeenCalled();
      expect(mockExecuteRaw).not.toHaveBeenCalled();
    });

    test("存在しない SNS リンク ID が混ざる場合 SQL が実行されない", async () => {
      const items = [
        { id: "550e8400-e29b-41d4-a716-446655440000", order: 0 },
        { id: "550e8400-e29b-41d4-a716-446655440001", order: 1 },
      ];
      mockSocialLinkFindMany.mockResolvedValueOnce([
        { id: "550e8400-e29b-41d4-a716-446655440000" },
      ]);

      await expect(updateSocialLinkOrder(items)).rejects.toThrow(
        "SNSリンクが見つかりません",
      );

      expect(mockExecuteRaw).not.toHaveBeenCalled();
    });

    test("既存 ID の subset は過不足として拒否する", async () => {
      const items = [{ id: "550e8400-e29b-41d4-a716-446655440000", order: 0 }];
      mockSocialLinkFindMany.mockResolvedValueOnce([
        { id: "550e8400-e29b-41d4-a716-446655440000" },
        { id: "550e8400-e29b-41d4-a716-446655440001" },
      ]);

      await expect(updateSocialLinkOrder(items)).rejects.toThrow(
        "SNSリンク数が一致しません",
      );

      expect(mockExecuteRaw).not.toHaveBeenCalled();
    });
  });
});
