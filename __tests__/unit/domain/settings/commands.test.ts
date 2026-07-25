import { describe, test, expect, mock, beforeEach } from "bun:test";

// Prisma モック関数（import より前に定義 — TDZ 回避）
type SettingsUpsertArgs = { update?: Record<string, unknown> };
type UpdateManyArgs = {
  where?: Record<string, unknown>;
  data?: Record<string, unknown>;
};
const mockSettingsFeaturesUpsert = mock<
  (args: SettingsUpsertArgs) => Promise<Record<string, unknown>>
>(() => Promise.resolve({ id: "singleton" }));
const mockSettingsSeoUpsert = mock<
  (args: SettingsUpsertArgs) => Promise<Record<string, unknown>>
>(() => Promise.resolve({ id: "singleton" }));
const mockSettingsLayoutUpsert = mock<
  (args: SettingsUpsertArgs) => Promise<Record<string, unknown>>
>(() => Promise.resolve({ id: "singleton" }));
const mockSettingsOrganizationUpsert = mock<
  (args: SettingsUpsertArgs) => Promise<Record<string, unknown>>
>(() => Promise.resolve({ id: "singleton" }));
const mockSettingsOrganizationUpdateMany = mock<
  (args: UpdateManyArgs) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 1 }));
const mockSettingsCommerceUpsert = mock<
  (args: SettingsUpsertArgs) => Promise<Record<string, unknown>>
>(() => Promise.resolve({ id: "singleton" }));
const mockSettingsReservationUpsert = mock<
  (args: SettingsUpsertArgs) => Promise<Record<string, unknown>>
>(() => Promise.resolve({ id: "singleton" }));
const mockSettingsReservationUpdateMany = mock<
  (args: UpdateManyArgs) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 1 }));
const mockSettingsDataRetentionUpsert = mock<
  (args: SettingsUpsertArgs) => Promise<Record<string, unknown>>
>(() => Promise.resolve({ id: "singleton" }));

const txClient = {
  settingsOrganization: {
    upsert: mockSettingsOrganizationUpsert,
    updateMany: mockSettingsOrganizationUpdateMany,
  },
  settingsReservation: {
    upsert: mockSettingsReservationUpsert,
    updateMany: mockSettingsReservationUpdateMany,
  },
};

const mockTransaction = mock(
  async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: {
    R2_PUBLIC_URL: "https://media.example.com",
  },
}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: mockTransaction,
    settingsFeatures: {
      upsert: mockSettingsFeaturesUpsert,
    },
    settingsSeo: {
      upsert: mockSettingsSeoUpsert,
    },
    settingsLayout: {
      upsert: mockSettingsLayoutUpsert,
    },
    settingsOrganization: {
      upsert: mockSettingsOrganizationUpsert,
      updateMany: mockSettingsOrganizationUpdateMany,
    },
    settingsCommerce: {
      upsert: mockSettingsCommerceUpsert,
    },
    settingsReservation: {
      upsert: mockSettingsReservationUpsert,
      updateMany: mockSettingsReservationUpdateMany,
    },
    settingsDataRetention: {
      upsert: mockSettingsDataRetentionUpsert,
    },
  },
  Prisma: {
    JsonNull: null,
  },
}));

mock.module("@generated/prisma/enums", () => ({
  HeaderScrollBehavior: {
    auto_hide: "auto_hide",
    always_visible: "always_visible",
    hide_on_scroll: "hide_on_scroll",
  },
  HeaderBackgroundMode: {
    solid: "solid",
    transparent: "transparent",
  },
  DiscountCombinationMode: {
    best: "best",
    both: "both",
  },
  TaxDisplayMode: {
    tax_included: "tax_included",
    tax_excluded: "tax_excluded",
    both: "both",
  },
  TaxInputMode: {
    tax_included: "tax_included",
    tax_excluded: "tax_excluded",
  },
  AnalyticsType: {
    ga4: "ga4",
    gtm: "gtm",
  },
  LayoutWidth: {
    FULL: "FULL",
    CUSTOM: "CUSTOM",
  },
}));

import {
  updateBasicInfo,
  updateBusinessInfo,
  updateBusinessHoursSettings,
  updateReservationSettings,
  updateDiscountSettings,
  updateTaxSettings,
  updateHeaderSettings,
  updateLayoutSettings,
  updateContactInfo,
  updateDataRetentionSettings,
  SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE,
} from "@/shared/domain/settings/commands";
import { DomainError } from "@/shared/domain/domain-error";
import type { BusinessHours } from "@/shared/lib/json-validators";

// =============================================================================
// テスト用定数
// =============================================================================

const BASIC_INFO_INPUT = {
  siteName: "Myrrh Rental Space",
  siteDescription: "レンタルスペース予約サービス",
  faviconUrl: "https://media.example.com/site/favicon.png",
  defaultOgpImageUrl: "https://media.example.com/site/ogp.jpg",
  headerLogoUrl: "https://media.example.com/site/header-logo.png",
  footerLogoUrl: "https://media.example.com/site/footer-logo.png",
  footerCopyright: "© 2024 Myrrh",
  useHeaderLogo: true,
  useFooterLogo: true,
};

const EXPECTED_UPDATED_AT = new Date("2026-01-15T00:00:00.000Z");

const BUSINESS_INFO_INPUT = {
  businessName: "株式会社テスト",
  businessNameKana: "カブシキガイシャテスト",
  representativeName: "山田太郎",
  establishedDate: "2020-01-01",
  registrationNumber: "1234567890123",
  invoiceNumber: "T1234567890123",
  businessDescription: "レンタルスペースの運営",
  expectedUpdatedAt: EXPECTED_UPDATED_AT,
};

const OPEN_DAY = {
  isOpen: true,
  slots: [{ openTime: "09:00", closeTime: "18:00" }],
};
const CLOSED_DAY = {
  isOpen: false,
  slots: [] as { openTime: string; closeTime: string }[],
};
const BUSINESS_HOURS: BusinessHours = {
  monday: OPEN_DAY,
  tuesday: OPEN_DAY,
  wednesday: OPEN_DAY,
  thursday: OPEN_DAY,
  friday: OPEN_DAY,
  saturday: CLOSED_DAY,
  sunday: CLOSED_DAY,
};

const BUSINESS_HOURS_INPUT = {
  businessHours: BUSINESS_HOURS,
  holidayNotice: null as string | null,
  expectedUpdatedAt: EXPECTED_UPDATED_AT,
};

const RESERVATION_SETTINGS_INPUT = {
  defaultTimeSlot: 60,
  minReservationDuration: 60,
  maxReservationDuration: 480,
  cancellationDeadlineHours: 24,
  modificationDeadlineHours: 24,
  customerCanCancelSeriesInFull: false,
  maxRecurrenceInstances: 26,
  expectedUpdatedAt: EXPECTED_UPDATED_AT,
};

const DISCOUNT_SETTINGS_INPUT = {
  durationDiscountEnabled: true,
  durationDiscountRules: [
    { hours: 2, discountRate: 5 },
    { hours: 4, discountRate: 10 },
  ],
  discountCombinationMode: "best" as const,
  showOriginalPrice: true,
};

const TAX_SETTINGS_INPUT = {
  taxStandardRate: 10,
  taxReducedRate: 8,
  taxDisplayModePublic: "tax_included" as const,
};

const HEADER_SETTINGS_INPUT = {
  headerScrollBehavior: "always_visible" as const,
  headerBackgroundMode: "transparent" as const,
};

// =============================================================================
// updateBasicInfo
// =============================================================================

describe("updateBasicInfo", () => {
  beforeEach(() => {
    mockSettingsSeoUpsert.mockReset();
    mockSettingsSeoUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("有効な基本情報でアップサートが実行される", async () => {
      await updateBasicInfo(BASIC_INFO_INPUT);

      expect(mockSettingsSeoUpsert).toHaveBeenCalledTimes(1);
    });

    test("upsert が singleton ID で呼ばれる", async () => {
      await updateBasicInfo(BASIC_INFO_INPUT);

      expect(mockSettingsSeoUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "singleton" },
        }),
      );
    });

    test("null フィールドを含む入力でも正常に動作する（faviconUrl は空文字）", async () => {
      await updateBasicInfo({
        ...BASIC_INFO_INPUT,
        siteName: null,
        siteDescription: null,
        // faviconUrl は NOT NULL + DEFAULT '' で型 string なので null 不可。
        // 未設定状態のテストは空文字で行う。
        faviconUrl: "",
        defaultOgpImageUrl: null,
      });

      expect(mockSettingsSeoUpsert).toHaveBeenCalledTimes(1);
    });

    test("faviconUrl が upsert の create/update に渡される (dynamic icon route の SSoT)", async () => {
      await updateBasicInfo(BASIC_INFO_INPUT);

      expect(mockSettingsSeoUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            faviconUrl: "https://media.example.com/site/favicon.png",
          }),
          update: expect.objectContaining({
            faviconUrl: "https://media.example.com/site/favicon.png",
          }),
        }),
      );
    });

    test("戻り値が void（undefined）", async () => {
      const result = await updateBasicInfo(BASIC_INFO_INPUT);

      expect(result).toBeUndefined();
    });

    test("管理メディア origin 外の画像 URL は拒否する", async () => {
      await expect(
        updateBasicInfo({
          ...BASIC_INFO_INPUT,
          headerLogoUrl: "https://external.example.com/header-logo.png",
        }),
      ).rejects.toMatchObject({
        code: "VALIDATION",
      });
      expect(mockSettingsSeoUpsert).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// updateBusinessInfo
// =============================================================================

describe("updateBusinessInfo", () => {
  beforeEach(() => {
    mockTransaction.mockClear();
    mockSettingsOrganizationUpdateMany.mockReset();
    mockSettingsOrganizationUpdateMany.mockResolvedValue({ count: 1 });
  });

  describe("正常系", () => {
    test("CAS updateMany が expectedUpdatedAt 付きで実行される", async () => {
      await updateBusinessInfo(BUSINESS_INFO_INPUT);

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockSettingsOrganizationUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "singleton", updatedAt: EXPECTED_UPDATED_AT },
          data: expect.objectContaining({
            businessName: "株式会社テスト",
            establishedDate: expect.any(Date),
          }),
        }),
      );
    });

    test("establishedDate が null の場合 null として保存される", async () => {
      await updateBusinessInfo({
        ...BUSINESS_INFO_INPUT,
        establishedDate: null,
      });

      expect(mockSettingsOrganizationUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            establishedDate: null,
          }),
        }),
      );
    });

    test("全フィールドが null の場合も正常に動作する", async () => {
      await updateBusinessInfo({
        businessName: null,
        businessNameKana: null,
        representativeName: null,
        establishedDate: null,
        registrationNumber: null,
        invoiceNumber: null,
        businessDescription: null,
        expectedUpdatedAt: EXPECTED_UPDATED_AT,
      });

      expect(mockSettingsOrganizationUpdateMany).toHaveBeenCalledTimes(1);
    });
  });

  describe("楽観的 concurrency", () => {
    test("updateMany count=0 なら DomainError CONFLICT", async () => {
      mockSettingsOrganizationUpdateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        updateBusinessInfo(BUSINESS_INFO_INPUT),
      ).rejects.toMatchObject({
        message: SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE,
        code: "CONFLICT",
      });
    });
  });
});

// =============================================================================
// updateBusinessHoursSettings
// =============================================================================

describe("updateBusinessHoursSettings", () => {
  beforeEach(() => {
    mockTransaction.mockClear();
    mockSettingsOrganizationUpdateMany.mockReset();
    mockSettingsOrganizationUpdateMany.mockResolvedValue({ count: 1 });
  });

  describe("正常系", () => {
    test("CAS updateMany が expectedUpdatedAt 付きで実行される", async () => {
      await updateBusinessHoursSettings(BUSINESS_HOURS_INPUT);

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockSettingsOrganizationUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "singleton", updatedAt: EXPECTED_UPDATED_AT },
          data: expect.objectContaining({
            businessHours: BUSINESS_HOURS,
            holidayNotice: null,
          }),
        }),
      );
    });
  });

  describe("楽観的 concurrency", () => {
    test("updateMany count=0 なら DomainError CONFLICT", async () => {
      mockSettingsOrganizationUpdateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        updateBusinessHoursSettings(BUSINESS_HOURS_INPUT),
      ).rejects.toMatchObject({
        message: SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE,
        code: "CONFLICT",
      });
    });

    test("不正な expectedUpdatedAt は DomainError CONFLICT", async () => {
      await expect(
        updateBusinessHoursSettings({
          ...BUSINESS_HOURS_INPUT,
          expectedUpdatedAt: "not-a-date",
        }),
      ).rejects.toMatchObject({
        message: SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE,
        code: "CONFLICT",
      });
      expect(mockSettingsOrganizationUpdateMany).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// updateReservationSettings
// =============================================================================

describe("updateReservationSettings", () => {
  beforeEach(() => {
    mockTransaction.mockClear();
    mockSettingsReservationUpdateMany.mockReset();
    mockSettingsReservationUpdateMany.mockResolvedValue({ count: 1 });
  });

  describe("正常系", () => {
    test("CAS updateMany に予約設定データが渡される", async () => {
      await updateReservationSettings(RESERVATION_SETTINGS_INPUT);

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockSettingsReservationUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "singleton", updatedAt: EXPECTED_UPDATED_AT },
          data: expect.objectContaining({
            defaultTimeSlot: 60,
            minReservationDuration: 60,
            maxReservationDuration: 480,
          }),
        }),
      );
    });
  });

  describe("楽観的 concurrency", () => {
    test("updateMany count=0 なら DomainError CONFLICT", async () => {
      mockSettingsReservationUpdateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        updateReservationSettings(RESERVATION_SETTINGS_INPUT),
      ).rejects.toMatchObject({
        message: SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE,
        code: "CONFLICT",
      });
    });
  });
});

// =============================================================================
// updateDiscountSettings
// =============================================================================

describe("updateDiscountSettings", () => {
  beforeEach(() => {
    mockSettingsCommerceUpsert.mockReset();
    mockSettingsCommerceUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("重複のない割引ルールで正常にアップサートされる", async () => {
      await updateDiscountSettings(DISCOUNT_SETTINGS_INPUT);

      expect(mockSettingsCommerceUpsert).toHaveBeenCalledTimes(1);
    });

    test("durationDiscountRules が Prisma Json 配列としてそのまま渡される", async () => {
      await updateDiscountSettings(DISCOUNT_SETTINGS_INPUT);

      expect(mockSettingsCommerceUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            durationDiscountRules:
              DISCOUNT_SETTINGS_INPUT.durationDiscountRules,
          }),
        }),
      );
    });

    test("round-trip: 保存値を parseDurationDiscountRules で読み戻すと入力と deep-equal", async () => {
      const { parseDurationDiscountRules } =
        await import("@/shared/lib/pricing/discount");

      await updateDiscountSettings(DISCOUNT_SETTINGS_INPUT);

      const firstCall = mockSettingsCommerceUpsert.mock.calls[0];
      expect(firstCall).toBeDefined();
      if (firstCall === undefined) {
        throw new Error("settings.upsert must be called");
      }
      const stored = firstCall[0].update?.["durationDiscountRules"];
      expect(Array.isArray(stored)).toBe(true);
      // Prisma Json 列に object を渡したときの read 側挙動を模した round-trip
      const roundTripped = parseDurationDiscountRules(stored);
      expect(roundTripped).toEqual(
        DISCOUNT_SETTINGS_INPUT.durationDiscountRules,
      );
    });

    test("ルールが空配列の場合も正常に動作する", async () => {
      await updateDiscountSettings({
        ...DISCOUNT_SETTINGS_INPUT,
        durationDiscountRules: [],
      });

      expect(mockSettingsCommerceUpsert).toHaveBeenCalledTimes(1);
    });

    test("durationDiscountEnabled が false でも正常に動作する", async () => {
      await updateDiscountSettings({
        ...DISCOUNT_SETTINGS_INPUT,
        durationDiscountEnabled: false,
        durationDiscountRules: [],
      });

      expect(mockSettingsCommerceUpsert).toHaveBeenCalledTimes(1);
    });
  });

  describe("異常系", () => {
    test("同じ時間数の割引ルールが重複している場合 VALIDATION エラーをスローする", async () => {
      await expect(
        updateDiscountSettings({
          ...DISCOUNT_SETTINGS_INPUT,
          durationDiscountRules: [
            { hours: 2, discountRate: 5 },
            { hours: 2, discountRate: 10 }, // 重複
          ],
        }),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        message: "2時間の割引ルールが重複しています",
      });
    });

    test("重複ルールがある場合は upsert が呼ばれない", async () => {
      await expect(
        updateDiscountSettings({
          ...DISCOUNT_SETTINGS_INPUT,
          durationDiscountRules: [
            { hours: 3, discountRate: 5 },
            { hours: 3, discountRate: 8 },
          ],
        }),
      ).rejects.toThrow(DomainError);

      expect(mockSettingsCommerceUpsert).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// updateTaxSettings
// =============================================================================

describe("updateTaxSettings", () => {
  beforeEach(() => {
    mockSettingsCommerceUpsert.mockReset();
    mockSettingsCommerceUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("有効な税設定でアップサートが実行される", async () => {
      await updateTaxSettings(TAX_SETTINGS_INPUT);

      expect(mockSettingsCommerceUpsert).toHaveBeenCalledTimes(1);
    });

    test("税設定データが upsert の update フィールドに渡される", async () => {
      await updateTaxSettings(TAX_SETTINGS_INPUT);

      expect(mockSettingsCommerceUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            taxStandardRate: 10,
            taxReducedRate: 8,
          }),
        }),
      );
    });

    test("戻り値が void（undefined）", async () => {
      const result = await updateTaxSettings(TAX_SETTINGS_INPUT);

      expect(result).toBeUndefined();
    });
  });
});

// =============================================================================
// updateHeaderSettings
// =============================================================================

describe("updateHeaderSettings", () => {
  beforeEach(() => {
    mockSettingsLayoutUpsert.mockReset();
    mockSettingsLayoutUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("有効なヘッダー設定でアップサートが実行される", async () => {
      await updateHeaderSettings(HEADER_SETTINGS_INPUT);

      expect(mockSettingsLayoutUpsert).toHaveBeenCalledTimes(1);
    });

    test("ヘッダー設定データが upsert に渡される", async () => {
      await updateHeaderSettings(HEADER_SETTINGS_INPUT);

      expect(mockSettingsLayoutUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "singleton" },
          update: expect.objectContaining({
            headerScrollBehavior: "always_visible",
            headerBackgroundMode: "transparent",
          }),
        }),
      );
    });

    test("hide_on_scroll スクロールと solid 背景でも正常に動作する", async () => {
      await updateHeaderSettings({
        headerScrollBehavior: "hide_on_scroll",
        headerBackgroundMode: "solid",
      });

      expect(mockSettingsLayoutUpsert).toHaveBeenCalledTimes(1);
    });
  });
});

// =============================================================================
// updateLayoutSettings
// =============================================================================

describe("updateLayoutSettings", () => {
  beforeEach(() => {
    mockSettingsLayoutUpsert.mockReset();
    mockSettingsLayoutUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("FULL 幅の設定でアップサートが実行される", async () => {
      await updateLayoutSettings({
        containerWidth: "FULL",
        containerWidthCustom: null,
        contentWidth: "FULL",
        contentWidthCustom: null,
      });

      expect(mockSettingsLayoutUpsert).toHaveBeenCalledTimes(1);
    });

    test("CUSTOM 幅でカスタム値を指定するとアップサートが実行される", async () => {
      await updateLayoutSettings({
        containerWidth: "CUSTOM",
        containerWidthCustom: 1200,
        contentWidth: "CUSTOM",
        contentWidthCustom: 900,
      });

      expect(mockSettingsLayoutUpsert).toHaveBeenCalledTimes(1);
    });

    test("CUSTOM containerWidth の場合 containerWidthCustom が設定される", async () => {
      await updateLayoutSettings({
        containerWidth: "CUSTOM",
        containerWidthCustom: 1400,
        contentWidth: "FULL",
        contentWidthCustom: null,
      });

      expect(mockSettingsLayoutUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            containerWidthCustom: 1400,
          }),
        }),
      );
    });

    test("FULL containerWidth の場合 containerWidthCustom が null になる", async () => {
      await updateLayoutSettings({
        containerWidth: "FULL",
        containerWidthCustom: 1400, // 指定しても FULL なら null
        contentWidth: "FULL",
        contentWidthCustom: null,
      });

      expect(mockSettingsLayoutUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            containerWidthCustom: null,
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("CUSTOM containerWidth でカスタム値が null の場合 VALIDATION エラーをスローする", async () => {
      await expect(
        updateLayoutSettings({
          containerWidth: "CUSTOM",
          containerWidthCustom: null,
          contentWidth: "FULL",
          contentWidthCustom: null,
        }),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        message: "Container幅のカスタム値を入力してください",
      });
    });

    test("CUSTOM contentWidth でカスタム値が null の場合 VALIDATION エラーをスローする", async () => {
      await expect(
        updateLayoutSettings({
          containerWidth: "FULL",
          containerWidthCustom: null,
          contentWidth: "CUSTOM",
          contentWidthCustom: null,
        }),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        message: "コンテンツ幅のカスタム値を入力してください",
      });
    });

    test("バリデーションエラー時は upsert が呼ばれない", async () => {
      await expect(
        updateLayoutSettings({
          containerWidth: "CUSTOM",
          containerWidthCustom: null,
          contentWidth: "FULL",
          contentWidthCustom: null,
        }),
      ).rejects.toThrow(DomainError);

      expect(mockSettingsLayoutUpsert).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// updateContactInfo（normalizeNullableString の動作確認）
// =============================================================================

describe("updateContactInfo", () => {
  beforeEach(() => {
    mockSettingsOrganizationUpsert.mockReset();
    mockSettingsOrganizationUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("有効な連絡先情報でアップサートが実行される", async () => {
      await updateContactInfo({
        phoneNumber: "03-1234-5678",
        faxNumber: null,
        email: "contact@example.com",
        postalCode: "150-0001",
        prefecture: "東京都",
        city: "渋谷区",
        streetAddress: "1-1-1",
        buildingName: null,
      });

      expect(mockSettingsOrganizationUpsert).toHaveBeenCalledTimes(1);
    });

    test("空文字のメールアドレスが null に正規化される", async () => {
      await updateContactInfo({
        phoneNumber: null,
        faxNumber: null,
        email: "",
        postalCode: null,
        prefecture: null,
        city: null,
        streetAddress: null,
        buildingName: null,
      });

      expect(mockSettingsOrganizationUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            email: null,
          }),
        }),
      );
    });

    test("有効なメールアドレスはそのまま保持される", async () => {
      await updateContactInfo({
        phoneNumber: null,
        faxNumber: null,
        email: "test@example.com",
        postalCode: null,
        prefecture: null,
        city: null,
        streetAddress: null,
        buildingName: null,
      });

      expect(mockSettingsOrganizationUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            email: "test@example.com",
          }),
        }),
      );
    });
  });
});

// =============================================================================
// updateDataRetentionSettings
// =============================================================================

describe("updateDataRetentionSettings", () => {
  beforeEach(() => {
    mockSettingsDataRetentionUpsert.mockReset();
    mockSettingsDataRetentionUpsert.mockResolvedValue({ id: "singleton" });
  });

  test("保持月数 config を settingsDataRetention に upsert する", async () => {
    const config = {
      sessionMonths: 6,
      verificationMonths: 6,
      loginAttemptMonths: 6,
      reservationGuestMonths: 12,
      inquiryMonths: 36,
      customerInactiveMonths: 84,
    };

    await updateDataRetentionSettings(config);

    expect(mockSettingsDataRetentionUpsert).toHaveBeenCalledTimes(1);
    expect(mockSettingsDataRetentionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "singleton" },
        update: expect.objectContaining({
          dataRetention: config,
        }),
      }),
    );
  });
});
