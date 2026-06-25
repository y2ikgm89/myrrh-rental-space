import { describe, test, expect, mock } from "bun:test";

// Enum モック（import より前に配置）
// mock.module() のグローバルスコープ干渉を防ぐため、全 export を含める
const ALL_ENUMS = {
  Role: {
    SUPER_ADMIN: "SUPER_ADMIN",
    ADMIN: "ADMIN",
    EDITOR: "EDITOR",
    VIEWER: "VIEWER",
    USER: "USER",
    CUSTOMER: "CUSTOMER",
  },
  ReservationStatus: {
    PENDING: "PENDING",
    CONFIRMED: "CONFIRMED",
    COMPLETED: "COMPLETED",
    CANCELLED: "CANCELLED",
    NO_SHOW: "NO_SHOW",
  },
  InquiryStatus: {
    NEW: "NEW",
    IN_PROGRESS: "IN_PROGRESS",
    RESOLVED: "RESOLVED",
    CLOSED: "CLOSED",
  },
  CustomerStatus: {
    NEW: "NEW",
    REGULAR: "REGULAR",
    VIP: "VIP",
    INACTIVE: "INACTIVE",
    BLACKLIST: "BLACKLIST",
  },
  PaymentStatus: {
    UNPAID: "UNPAID",
    PENDING: "PENDING",
    PAID: "PAID",
    REFUNDED: "REFUNDED",
    FAILED: "FAILED",
  },
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
  LayoutWidth: {
    XS: "XS",
    SM: "SM",
    MD: "MD",
    LG: "LG",
    XL: "XL",
    FULL: "FULL",
    CUSTOM: "CUSTOM",
  },
  SectionType: {
    HERO: "HERO",
    HERO_PARALLAX: "HERO_PARALLAX",
    CUSTOM: "CUSTOM",
    CONCEPT: "CONCEPT",
    SPACE_LIST: "SPACE_LIST",
    SPACE_SHOWCASE: "SPACE_SHOWCASE",
    NEWS_LIST: "NEWS_LIST",
    POST_LIST: "POST_LIST",
    FAQ_LIST: "FAQ_LIST",
    FEATURES: "FEATURES",
    TESTIMONIAL: "TESTIMONIAL",
    GALLERY: "GALLERY",
    CTA: "CTA",
    CONTACT_FORM: "CONTACT_FORM",
    MAP: "MAP",
    EMBED: "EMBED",
    INSTAGRAM: "INSTAGRAM",
  },
  PostStatus: { DRAFT: "DRAFT", PUBLISHED: "PUBLISHED", ARCHIVED: "ARCHIVED" },
  CouponType: { PERCENTAGE: "PERCENTAGE", FIXED_AMOUNT: "FIXED_AMOUNT" },
  AnnouncementBarType: { info: "info", warning: "warning", promo: "promo" },
  DiscountType: { none: "none", percentage: "percentage", fixed: "fixed" },
  DurationDiscountOverride: {
    inherit: "inherit",
    enabled: "enabled",
    disabled: "disabled",
  },
  TaxRateType: { standard: "standard", reduced: "reduced" },
  HeaderScrollBehavior: {
    auto_hide: "auto_hide",
    always_visible: "always_visible",
    hide_on_scroll: "hide_on_scroll",
  },
  HeaderBackgroundMode: { solid: "solid", transparent: "transparent" },
  TaxDisplayMode: {
    tax_excluded: "tax_excluded",
    tax_included: "tax_included",
    both: "both",
  },
  TaxInputMode: { tax_excluded: "tax_excluded", tax_included: "tax_included" },
  CalendarSyncMethod: { polling: "polling", webhook: "webhook", both: "both" },
  AnalyticsType: { ga4: "ga4", gtm: "gtm" },
  DiscountCombinationMode: { best: "best", both: "both" },
  AnnouncementBarAnimation: {
    fade: "fade",
    slideX: "slideX",
    slideY: "slideY",
  },
  AnnouncementBarDesignStyle: {
    solid: "solid",
    gradient: "gradient",
    outlined: "outlined",
    glass: "glass",
    minimal: "minimal",
    striped: "striped",
  },
  InstagramMediaType: {
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    CAROUSEL_ALBUM: "CAROUSEL_ALBUM",
  },
  AuditAction: {
    CREATE: "CREATE",
    UPDATE: "UPDATE",
    DELETE: "DELETE",
    PUBLISH: "PUBLISH",
    LOGIN_SUCCESS: "LOGIN_SUCCESS",
    LOGIN_FAILED: "LOGIN_FAILED",
    PERMISSION_DENIED: "PERMISSION_DENIED",
    PASSWORD_CHANGE: "PASSWORD_CHANGE",
    ROLE_CHANGE: "ROLE_CHANGE",
  },
  EditorCommentStatus: {
    ACTIVE: "ACTIVE",
    RESOLVED: "RESOLVED",
    DELETED: "DELETED",
  },
  MediaType: {
    IMAGE: "IMAGE",
    VIDEO: "VIDEO",
    DOCUMENT: "DOCUMENT",
    OTHER: "OTHER",
  },
  MediaUsage: {
    POST: "POST",
    NEWS: "NEWS",
    PAGE: "PAGE",
    SPACE: "SPACE",
    SITE: "SITE",
    GENERAL: "GENERAL",
  },
} as const;

mock.module("@generated/prisma/enums", () => ALL_ENUMS);

import {
  getTaxRate,
  calculateTaxIncludedPrice,
  calculateTaxExcludedPrice,
  calculateTaxAmount,
  DEFAULT_TAX_SETTINGS,
} from "@/shared/lib/pricing/tax";
import type { TaxSettings } from "@/shared/lib/pricing/types";

// =============================================================================
// DEFAULT_TAX_SETTINGS
// =============================================================================

describe("DEFAULT_TAX_SETTINGS", () => {
  test("標準税率が 10% であること", () => {
    expect(DEFAULT_TAX_SETTINGS.standardRate).toBe(10);
  });

  test("軽減税率が 8% であること", () => {
    expect(DEFAULT_TAX_SETTINGS.reducedRate).toBe(8);
  });
});

// =============================================================================
// getTaxRate
// =============================================================================

describe("getTaxRate", () => {
  describe("デフォルト設定を使用", () => {
    test("standard タイプでデフォルト標準税率 (10%) を返す", () => {
      expect(getTaxRate("standard")).toBe(10);
    });

    test("reduced タイプでデフォルト軽減税率 (8%) を返す", () => {
      expect(getTaxRate("reduced")).toBe(8);
    });
  });

  describe("カスタム設定を使用", () => {
    test("カスタム標準税率を返す", () => {
      const customSettings: TaxSettings = {
        ...DEFAULT_TAX_SETTINGS,
        standardRate: 15,
      };
      expect(getTaxRate("standard", customSettings)).toBe(15);
    });

    test("カスタム軽減税率を返す", () => {
      const customSettings: TaxSettings = {
        ...DEFAULT_TAX_SETTINGS,
        reducedRate: 5,
      };
      expect(getTaxRate("reduced", customSettings)).toBe(5);
    });

    test("標準税率 0% のカスタム設定", () => {
      const customSettings: TaxSettings = {
        ...DEFAULT_TAX_SETTINGS,
        standardRate: 0,
      };
      expect(getTaxRate("standard", customSettings)).toBe(0);
    });
  });

  describe("エッジケース", () => {
    test("standard タイプは reducedRate を返さない", () => {
      const settings: TaxSettings = {
        ...DEFAULT_TAX_SETTINGS,
        standardRate: 10,
        reducedRate: 8,
      };
      expect(getTaxRate("standard", settings)).toBe(10);
      expect(getTaxRate("standard", settings)).not.toBe(8);
    });

    test("reduced タイプは standardRate を返さない", () => {
      const settings: TaxSettings = {
        ...DEFAULT_TAX_SETTINGS,
        standardRate: 10,
        reducedRate: 8,
      };
      expect(getTaxRate("reduced", settings)).toBe(8);
      expect(getTaxRate("reduced", settings)).not.toBe(10);
    });
  });
});

// =============================================================================
// calculateTaxIncludedPrice
// =============================================================================

describe("calculateTaxIncludedPrice", () => {
  describe("消費税 10%", () => {
    test("10000 円（税抜）+ 10% = 11000 円（税込）", () => {
      expect(calculateTaxIncludedPrice(10000, 10)).toBe(11000);
    });

    test("1000 円（税抜）+ 10% = 1100 円（税込）", () => {
      expect(calculateTaxIncludedPrice(1000, 10)).toBe(1100);
    });

    test("端数は四捨五入（Math.round）", () => {
      // 1001 * 1.10 = 1101.1 → Math.round → 1101
      expect(calculateTaxIncludedPrice(1001, 10)).toBe(1101);
    });

    test("端数が 0.5 以上で切り上げ", () => {
      // 1 * 1.10 = 1.1 → Math.round → 1
      expect(calculateTaxIncludedPrice(1, 10)).toBe(1);
      // 5 * 1.10 = 5.5 → Math.round → 6
      expect(calculateTaxIncludedPrice(5, 10)).toBe(6);
    });
  });

  describe("消費税 8%（軽減税率）", () => {
    test("10000 円（税抜）+ 8% = 10800 円（税込）", () => {
      expect(calculateTaxIncludedPrice(10000, 8)).toBe(10800);
    });

    test("1000 円（税抜）+ 8% = 1080 円（税込）", () => {
      expect(calculateTaxIncludedPrice(1000, 8)).toBe(1080);
    });

    test("端数は四捨五入", () => {
      // 100 * 1.08 = 108.0 → 108
      expect(calculateTaxIncludedPrice(100, 8)).toBe(108);
      // 10 * 1.08 = 10.8 → Math.round → 11
      expect(calculateTaxIncludedPrice(10, 8)).toBe(11);
    });
  });

  describe("エッジケース", () => {
    test("税率 0% の場合は元の価格をそのまま返す", () => {
      expect(calculateTaxIncludedPrice(10000, 0)).toBe(10000);
    });

    test("価格 0 の場合は 0 を返す", () => {
      expect(calculateTaxIncludedPrice(0, 10)).toBe(0);
    });

    test("大きな金額でも正しく計算する", () => {
      expect(calculateTaxIncludedPrice(1000000, 10)).toBe(1100000);
    });

    test("税率 100% の場合は 2倍になる", () => {
      expect(calculateTaxIncludedPrice(5000, 100)).toBe(10000);
    });
  });
});

// =============================================================================
// calculateTaxExcludedPrice
// =============================================================================

describe("calculateTaxExcludedPrice", () => {
  describe("消費税 10%", () => {
    test("11000 円（税込）÷ 1.10 = 10000 円（税抜）", () => {
      expect(calculateTaxExcludedPrice(11000, 10)).toBe(10000);
    });

    test("1100 円（税込）÷ 1.10 = 1000 円（税抜）", () => {
      expect(calculateTaxExcludedPrice(1100, 10)).toBe(1000);
    });

    test("端数は四捨五入（Math.round）", () => {
      // 1000 / 1.10 = 909.0909... → Math.round → 909
      expect(calculateTaxExcludedPrice(1000, 10)).toBe(909);
    });

    test("税込価格から税抜価格への逆算", () => {
      // calculateTaxIncludedPrice(10000, 10) = 11000
      // calculateTaxExcludedPrice(11000, 10) = 10000
      const taxIncluded = calculateTaxIncludedPrice(10000, 10);
      const taxExcluded = calculateTaxExcludedPrice(taxIncluded, 10);
      expect(taxExcluded).toBe(10000);
    });
  });

  describe("消費税 8%（軽減税率）", () => {
    test("10800 円（税込）÷ 1.08 = 10000 円（税抜）", () => {
      expect(calculateTaxExcludedPrice(10800, 8)).toBe(10000);
    });

    test("端数は四捨五入", () => {
      // 100 / 1.08 = 92.5925... → Math.round → 93
      expect(calculateTaxExcludedPrice(100, 8)).toBe(93);
    });

    test("税込価格から税抜価格への逆算（8%）", () => {
      const taxIncluded = calculateTaxIncludedPrice(5000, 8);
      const taxExcluded = calculateTaxExcludedPrice(taxIncluded, 8);
      expect(taxExcluded).toBe(5000);
    });
  });

  describe("エッジケース", () => {
    test("税率 0% の場合は元の価格をそのまま返す", () => {
      expect(calculateTaxExcludedPrice(10000, 0)).toBe(10000);
    });

    test("価格 0 の場合は 0 を返す", () => {
      expect(calculateTaxExcludedPrice(0, 10)).toBe(0);
    });

    test("大きな金額でも正しく計算する", () => {
      expect(calculateTaxExcludedPrice(1100000, 10)).toBe(1000000);
    });
  });
});

// =============================================================================
// calculateTaxAmount
// =============================================================================

describe("calculateTaxAmount", () => {
  describe("消費税 10%", () => {
    test("10000 円の 10% = 1000 円", () => {
      expect(calculateTaxAmount(10000, 10)).toBe(1000);
    });

    test("1000 円の 10% = 100 円", () => {
      expect(calculateTaxAmount(1000, 10)).toBe(100);
    });

    test("端数は四捨五入（Math.round）", () => {
      // 1001 * 0.10 = 100.1 → Math.round → 100
      expect(calculateTaxAmount(1001, 10)).toBe(100);
      // 1005 * 0.10 = 100.5 → Math.round → 101（.5は切り上げ）
      expect(calculateTaxAmount(1005, 10)).toBe(101);
    });
  });

  describe("消費税 8%（軽減税率）", () => {
    test("10000 円の 8% = 800 円", () => {
      expect(calculateTaxAmount(10000, 8)).toBe(800);
    });

    test("1000 円の 8% = 80 円", () => {
      expect(calculateTaxAmount(1000, 8)).toBe(80);
    });

    test("端数は四捨五入", () => {
      // 100 * 0.08 = 8.0 → 8
      expect(calculateTaxAmount(100, 8)).toBe(8);
      // 10 * 0.08 = 0.8 → Math.round → 1
      expect(calculateTaxAmount(10, 8)).toBe(1);
    });
  });

  describe("エッジケース", () => {
    test("税率 0% の場合は 0 を返す", () => {
      expect(calculateTaxAmount(10000, 0)).toBe(0);
    });

    test("価格 0 の場合は 0 を返す", () => {
      expect(calculateTaxAmount(0, 10)).toBe(0);
    });

    test("大きな金額でも正しく計算する", () => {
      expect(calculateTaxAmount(1000000, 10)).toBe(100000);
    });

    test("税額 = 税込価格 - 税抜価格 の関係を確認", () => {
      const taxExcluded = 10000;
      const taxRate = 10;
      const taxIncluded = calculateTaxIncludedPrice(taxExcluded, taxRate);
      const taxAmount = calculateTaxAmount(taxExcluded, taxRate);
      // 四捨五入の誤差が生じる場合があるため、±1 の範囲で確認
      expect(
        Math.abs(taxIncluded - taxExcluded - taxAmount),
      ).toBeLessThanOrEqual(1);
    });
  });
});

// =============================================================================
// 税計算の往復変換（整合性テスト）
// =============================================================================

describe("税計算の往復変換", () => {
  test("税抜 → 税込 → 税抜 で元の価格に戻る（10%）", () => {
    const original = 10000;
    const withTax = calculateTaxIncludedPrice(original, 10);
    const withoutTax = calculateTaxExcludedPrice(withTax, 10);
    expect(withoutTax).toBe(original);
  });

  test("税抜 → 税込 → 税抜 で元の価格に戻る（8%）", () => {
    const original = 50000;
    const withTax = calculateTaxIncludedPrice(original, 8);
    const withoutTax = calculateTaxExcludedPrice(withTax, 8);
    expect(withoutTax).toBe(original);
  });

  test("税込価格 = 税抜価格 + 税額（10%, 誤差 ±1 以内）", () => {
    const taxExcluded = 9876;
    const taxRate = 10;
    const taxIncluded = calculateTaxIncludedPrice(taxExcluded, taxRate);
    const taxAmount = calculateTaxAmount(taxExcluded, taxRate);
    // 四捨五入誤差を許容
    expect(
      Math.abs(taxIncluded - (taxExcluded + taxAmount)),
    ).toBeLessThanOrEqual(1);
  });

  test("税込価格 = 税抜価格 + 税額（8%, 誤差 ±1 以内）", () => {
    const taxExcluded = 12345;
    const taxRate = 8;
    const taxIncluded = calculateTaxIncludedPrice(taxExcluded, taxRate);
    const taxAmount = calculateTaxAmount(taxExcluded, taxRate);
    expect(
      Math.abs(taxIncluded - (taxExcluded + taxAmount)),
    ).toBeLessThanOrEqual(1);
  });

  test("複数の金額でパターンが一致すること（10%）", () => {
    const amounts = [100, 1000, 5000, 10000, 100000];
    for (const amount of amounts) {
      const taxIncluded = calculateTaxIncludedPrice(amount, 10);
      expect(taxIncluded).toBeGreaterThanOrEqual(amount);
    }
  });
});
