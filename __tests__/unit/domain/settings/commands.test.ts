import { describe, test, expect, mock, beforeEach } from "bun:test";

// Prisma モック関数（import より前に定義 — TDZ 回避）
const mockSettingsUpsert = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "singleton" }),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    settings: {
      upsert: mockSettingsUpsert,
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
  PostPermalinkStructure: {
    post_name: "post_name",
    date_name: "date_name",
    category_name: "category_name",
  },
}));

mock.module("@/shared/domain/settings/robots-txt", () => ({
  checkRobotsTxtWarnings: mock<(content: string) => string[]>(() => []),
}));

import {
  updateBasicInfo,
  updateBusinessInfo,
  updateReservationSettings,
  updateDiscountSettings,
  updateTaxSettings,
  updateHeaderSettings,
  updateLayoutSettings,
  updateContactInfo,
} from "@/shared/domain/settings/commands";
import { DomainError } from "@/shared/domain/domain-error";

// =============================================================================
// テスト用定数
// =============================================================================

const BASIC_INFO_INPUT = {
  siteName: "Myrrh Rental Space",
  siteDescription: "レンタルスペース予約サービス",
  faviconUrl: "https://example.com/favicon.ico",
  defaultOgpImageUrl: "https://example.com/ogp.jpg",
  headerLogoUrl: "https://example.com/header-logo.png",
  footerLogoUrl: "https://example.com/footer-logo.png",
  footerCopyright: "© 2024 Myrrh",
  useHeaderLogo: true,
  useFooterLogo: true,
};

const BUSINESS_INFO_INPUT = {
  businessName: "株式会社テスト",
  businessNameKana: "カブシキガイシャテスト",
  representativeName: "山田太郎",
  businessType: "法人",
  industryType: "サービス業",
  establishedDate: "2020-01-01",
  registrationNumber: "1234567890123",
  invoiceNumber: "T1234567890123",
  businessDescription: "レンタルスペースの運営",
};

const RESERVATION_SETTINGS_INPUT = {
  defaultTimeSlot: 60,
  minReservationDuration: 60,
  maxReservationDuration: 480,
  cancellationDeadlineHours: 24,
  modificationDeadlineHours: 24,
};

const DISCOUNT_SETTINGS_INPUT = {
  durationDiscountEnabled: true,
  durationDiscountRules: [
    { hours: 2, discountRate: 5 },
    { hours: 4, discountRate: 10 },
  ],
  discountCombinationMode: "best" as const,
  showOriginalPrice: true,
  discountWarningEnabled: false,
};

const TAX_SETTINGS_INPUT = {
  taxStandardRate: 10,
  taxReducedRate: 8,
  taxDisplayModeAdmin: "tax_excluded" as const,
  taxDisplayModePublic: "tax_included" as const,
  taxInputMode: "tax_excluded" as const,
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
    mockSettingsUpsert.mockReset();
    mockSettingsUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("有効な基本情報でアップサートが実行される", async () => {
      await updateBasicInfo(BASIC_INFO_INPUT);

      expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
    });

    test("upsert が singleton ID で呼ばれる", async () => {
      await updateBasicInfo(BASIC_INFO_INPUT);

      expect(mockSettingsUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "singleton" },
        }),
      );
    });

    test("null フィールドを含む入力でも正常に動作する", async () => {
      await updateBasicInfo({
        ...BASIC_INFO_INPUT,
        siteName: null,
        siteDescription: null,
        faviconUrl: null,
      });

      expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
    });

    test("戻り値が void（undefined）", async () => {
      const result = await updateBasicInfo(BASIC_INFO_INPUT);

      expect(result).toBeUndefined();
    });
  });
});

// =============================================================================
// updateBusinessInfo
// =============================================================================

describe("updateBusinessInfo", () => {
  beforeEach(() => {
    mockSettingsUpsert.mockReset();
    mockSettingsUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("有効な事業者情報でアップサートが実行される", async () => {
      await updateBusinessInfo(BUSINESS_INFO_INPUT);

      expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
    });

    test("establishedDate が Date オブジェクトに変換される", async () => {
      await updateBusinessInfo(BUSINESS_INFO_INPUT);

      expect(mockSettingsUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
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

      expect(mockSettingsUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
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
        businessType: null,
        industryType: null,
        establishedDate: null,
        registrationNumber: null,
        invoiceNumber: null,
        businessDescription: null,
      });

      expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
    });
  });
});

// =============================================================================
// updateReservationSettings
// =============================================================================

describe("updateReservationSettings", () => {
  beforeEach(() => {
    mockSettingsUpsert.mockReset();
    mockSettingsUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("予約設定データが upsert の update フィールドに渡される", async () => {
      await updateReservationSettings(RESERVATION_SETTINGS_INPUT);

      expect(mockSettingsUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            defaultTimeSlot: 60,
            minReservationDuration: 60,
            maxReservationDuration: 480,
          }),
        }),
      );
    });
  });
});

// =============================================================================
// updateDiscountSettings
// =============================================================================

describe("updateDiscountSettings", () => {
  beforeEach(() => {
    mockSettingsUpsert.mockReset();
    mockSettingsUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("重複のない割引ルールで正常にアップサートされる", async () => {
      await updateDiscountSettings(DISCOUNT_SETTINGS_INPUT);

      expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
    });

    test("durationDiscountRules が JSON 文字列に変換される", async () => {
      await updateDiscountSettings(DISCOUNT_SETTINGS_INPUT);

      expect(mockSettingsUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            durationDiscountRules: expect.any(String),
          }),
        }),
      );
    });

    test("ルールが空配列の場合も正常に動作する", async () => {
      await updateDiscountSettings({
        ...DISCOUNT_SETTINGS_INPUT,
        durationDiscountRules: [],
      });

      expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
    });

    test("durationDiscountEnabled が false でも正常に動作する", async () => {
      await updateDiscountSettings({
        ...DISCOUNT_SETTINGS_INPUT,
        durationDiscountEnabled: false,
        durationDiscountRules: [],
      });

      expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
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

      expect(mockSettingsUpsert).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// updateTaxSettings
// =============================================================================

describe("updateTaxSettings", () => {
  beforeEach(() => {
    mockSettingsUpsert.mockReset();
    mockSettingsUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("有効な税設定でアップサートが実行される", async () => {
      await updateTaxSettings(TAX_SETTINGS_INPUT);

      expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
    });

    test("税設定データが upsert の update フィールドに渡される", async () => {
      await updateTaxSettings(TAX_SETTINGS_INPUT);

      expect(mockSettingsUpsert).toHaveBeenCalledWith(
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
    mockSettingsUpsert.mockReset();
    mockSettingsUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("有効なヘッダー設定でアップサートが実行される", async () => {
      await updateHeaderSettings(HEADER_SETTINGS_INPUT);

      expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
    });

    test("ヘッダー設定データが upsert に渡される", async () => {
      await updateHeaderSettings(HEADER_SETTINGS_INPUT);

      expect(mockSettingsUpsert).toHaveBeenCalledWith(
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

      expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
    });
  });
});

// =============================================================================
// updateLayoutSettings
// =============================================================================

describe("updateLayoutSettings", () => {
  beforeEach(() => {
    mockSettingsUpsert.mockReset();
    mockSettingsUpsert.mockResolvedValue({ id: "singleton" });
  });

  describe("正常系", () => {
    test("FULL 幅の設定でアップサートが実行される", async () => {
      await updateLayoutSettings({
        containerWidth: "FULL",
        containerWidthCustom: null,
        contentWidth: "FULL",
        contentWidthCustom: null,
      });

      expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
    });

    test("CUSTOM 幅でカスタム値を指定するとアップサートが実行される", async () => {
      await updateLayoutSettings({
        containerWidth: "CUSTOM",
        containerWidthCustom: 1200,
        contentWidth: "CUSTOM",
        contentWidthCustom: 900,
      });

      expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
    });

    test("CUSTOM containerWidth の場合 containerWidthCustom が設定される", async () => {
      await updateLayoutSettings({
        containerWidth: "CUSTOM",
        containerWidthCustom: 1400,
        contentWidth: "FULL",
        contentWidthCustom: null,
      });

      expect(mockSettingsUpsert).toHaveBeenCalledWith(
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

      expect(mockSettingsUpsert).toHaveBeenCalledWith(
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

      expect(mockSettingsUpsert).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// updateContactInfo（normalizeNullableString の動作確認）
// =============================================================================

describe("updateContactInfo", () => {
  beforeEach(() => {
    mockSettingsUpsert.mockReset();
    mockSettingsUpsert.mockResolvedValue({ id: "singleton" });
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

      expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
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

      expect(mockSettingsUpsert).toHaveBeenCalledWith(
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

      expect(mockSettingsUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            email: "test@example.com",
          }),
        }),
      );
    });
  });
});
