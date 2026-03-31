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
  TermsType: {
    TERMS_OF_USE: "TERMS_OF_USE",
    PRIVACY_POLICY: "PRIVACY_POLICY",
    CANCELLATION: "CANCELLATION",
    PAYMENT: "PAYMENT",
    CUSTOM: "CUSTOM",
  },
  TermsStatus: { DRAFT: "DRAFT", PUBLISHED: "PUBLISHED", ARCHIVED: "ARCHIVED" },
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
  PostPermalinkStructure: {
    post_name: "post_name",
    date_name: "date_name",
    category_name: "category_name",
  },
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
  InstagramFeedLayout: { grid: "grid", masonry: "masonry", slider: "slider" },
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
    UNPUBLISH: "UNPUBLISH",
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
mock.module("@/shared/db/enums", () => ALL_ENUMS);

import { calculateReservationPrice } from "@/shared/lib/pricing/reservation";
import type {
  DurationDiscountRule,
  PriceCalculationParams,
  SpaceDiscountSettings,
  CouponLike,
} from "@/shared/lib/pricing/types";

// テスト用フィクスチャ
const BASE_DURATION_RULES: DurationDiscountRule[] = [
  { hours: 3, discountRate: 5 },
  { hours: 5, discountRate: 10 },
  { hours: 8, discountRate: 20 },
];

const BASE_PARAMS: PriceCalculationParams = {
  hourlyPrice: 1000,
  hours: 2,
  durationRules: [],
  durationDiscountEnabled: false,
  combinationMode: "best",
  showWarning: true,
};

const PERCENTAGE_COUPON: CouponLike = {
  id: "coupon-1",
  code: "TEST20",
  name: "20%OFFクーポン",
  type: "PERCENTAGE",
  discountValue: 20,
  maxDiscountAmount: null,
  canCombineWithDurationDiscount: true,
};

const FIXED_COUPON: CouponLike = {
  id: "coupon-2",
  code: "FIX500",
  name: "500円OFFクーポン",
  type: "FIXED_AMOUNT",
  discountValue: 500,
  maxDiscountAmount: null,
  canCombineWithDurationDiscount: true,
};

// =============================================================================
// calculateReservationPrice
// =============================================================================

describe("calculateReservationPrice", () => {
  describe("基本料金計算", () => {
    test("時間単価 × 時間数で基本料金を計算する", () => {
      const result = calculateReservationPrice({
        ...BASE_PARAMS,
        hourlyPrice: 2000,
        hours: 3,
      });
      expect(result.basePrice).toBe(6000);
    });

    test("小数の時間数はフロアで処理する（Math.floor）", () => {
      // Math.floor(1500 * 2.5) = Math.floor(3750) = 3750（割り切れる場合）
      const result = calculateReservationPrice({
        ...BASE_PARAMS,
        hourlyPrice: 1500,
        hours: 2.5,
      });
      expect(result.basePrice).toBe(3750);
    });

    test("時間単価 × 時間数が割り切れない場合はフロア", () => {
      // Math.floor(1000 * 1.3) = Math.floor(1300) = 1300
      const result = calculateReservationPrice({
        ...BASE_PARAMS,
        hourlyPrice: 1000,
        hours: 1.3,
      });
      expect(result.basePrice).toBe(1300);
    });

    test("割引なしの場合は全割引額が 0 で totalPrice が basePrice と等しい", () => {
      const result = calculateReservationPrice({
        ...BASE_PARAMS,
        hourlyPrice: 3000,
        hours: 2,
      });
      expect(result.basePrice).toBe(6000);
      expect(result.spaceDiscount).toBe(0);
      expect(result.durationDiscount).toBe(0);
      expect(result.couponDiscount).toBe(0);
      expect(result.totalPrice).toBe(6000);
      expect(result.totalDiscountRate).toBe(0);
      expect(result.appliedSpaceDiscount).toBeNull();
      expect(result.appliedDurationRule).toBeNull();
      expect(result.appliedCoupon).toBeNull();
      expect(result.warnings).toEqual([]);
    });
  });

  describe("スペース割引のみ", () => {
    test("パーセント割引が正しく適用される", () => {
      const spaceDiscount: SpaceDiscountSettings = {
        discountType: "percentage",
        discountValue: 10,
        durationDiscountOverride: "inherit",
      };
      const result = calculateReservationPrice({
        ...BASE_PARAMS,
        hourlyPrice: 1000,
        hours: 5,
        spaceDiscount,
      });
      expect(result.basePrice).toBe(5000);
      expect(result.spaceDiscount).toBe(500);
      expect(result.totalPrice).toBe(4500);
      expect(result.appliedSpaceDiscount).toEqual({
        type: "percentage",
        value: 10,
      });
    });

    test("固定額割引が正しく適用される", () => {
      const spaceDiscount: SpaceDiscountSettings = {
        discountType: "fixed",
        discountValue: 800,
        durationDiscountOverride: "inherit",
      };
      const result = calculateReservationPrice({
        ...BASE_PARAMS,
        hourlyPrice: 1000,
        hours: 5,
        spaceDiscount,
      });
      expect(result.basePrice).toBe(5000);
      expect(result.spaceDiscount).toBe(800);
      expect(result.totalPrice).toBe(4200);
    });

    test("スペース割引のみの場合 durationDiscount と couponDiscount は 0", () => {
      const spaceDiscount: SpaceDiscountSettings = {
        discountType: "percentage",
        discountValue: 20,
        durationDiscountOverride: "inherit",
      };
      const result = calculateReservationPrice({
        ...BASE_PARAMS,
        hourlyPrice: 1000,
        hours: 5,
        spaceDiscount,
      });
      expect(result.durationDiscount).toBe(0);
      expect(result.couponDiscount).toBe(0);
    });

    test("総割引率を正しく計算する（パーセント割引 20% → 20%）", () => {
      const spaceDiscount: SpaceDiscountSettings = {
        discountType: "percentage",
        discountValue: 20,
        durationDiscountOverride: "inherit",
      };
      const result = calculateReservationPrice({
        ...BASE_PARAMS,
        hourlyPrice: 1000,
        hours: 5,
        spaceDiscount,
      });
      expect(result.totalDiscountRate).toBe(20);
    });
  });

  describe("長時間割引のみ", () => {
    test("durationDiscountEnabled=true でルールが適用される", () => {
      const result = calculateReservationPrice({
        ...BASE_PARAMS,
        hourlyPrice: 1000,
        hours: 5,
        durationRules: BASE_DURATION_RULES,
        durationDiscountEnabled: true,
      });
      // basePrice = 5000, priceAfterSpace = 5000, durationDiscount = Math.floor(5000 * 10%) = 500
      expect(result.durationDiscount).toBe(500);
      expect(result.appliedDurationRule).toEqual({
        hours: 5,
        discountRate: 10,
      });
    });

    test("durationDiscountEnabled=false では長時間割引が適用されない", () => {
      const result = calculateReservationPrice({
        ...BASE_PARAMS,
        hourlyPrice: 1000,
        hours: 5,
        durationRules: BASE_DURATION_RULES,
        durationDiscountEnabled: false,
      });
      expect(result.durationDiscount).toBe(0);
      expect(result.appliedDurationRule).toBeNull();
    });

    test("ルールが空の場合は長時間割引なし", () => {
      const result = calculateReservationPrice({
        ...BASE_PARAMS,
        hourlyPrice: 1000,
        hours: 5,
        durationRules: [],
        durationDiscountEnabled: true,
      });
      expect(result.durationDiscount).toBe(0);
    });

    test("閾値未満の時間では長時間割引なし", () => {
      const result = calculateReservationPrice({
        ...BASE_PARAMS,
        hourlyPrice: 1000,
        hours: 2,
        durationRules: BASE_DURATION_RULES,
        durationDiscountEnabled: true,
      });
      // 2時間 < 最小閾値 3時間
      expect(result.durationDiscount).toBe(0);
    });

    test("スペース割引適用後の価格に対して長時間割引を計算する", () => {
      const spaceDiscount: SpaceDiscountSettings = {
        discountType: "fixed",
        discountValue: 1000,
        durationDiscountOverride: "inherit",
      };
      const result = calculateReservationPrice({
        ...BASE_PARAMS,
        hourlyPrice: 1000,
        hours: 5,
        durationRules: BASE_DURATION_RULES,
        durationDiscountEnabled: true,
        spaceDiscount,
      });
      // basePrice = 5000, spaceDiscount = 1000, priceAfterSpace = 4000
      // durationDiscount = Math.floor(4000 * 10%) = 400
      expect(result.basePrice).toBe(5000);
      expect(result.spaceDiscount).toBe(1000);
      expect(result.durationDiscount).toBe(400);
    });
  });

  describe("クーポン割引のみ", () => {
    test("パーセントクーポンが正しく適用される", () => {
      const result = calculateReservationPrice({
        ...BASE_PARAMS,
        hourlyPrice: 1000,
        hours: 5,
        coupon: PERCENTAGE_COUPON,
      });
      // basePrice = 5000, 20% → 1000
      expect(result.couponDiscount).toBe(1000);
      expect(result.totalPrice).toBe(4000);
      expect(result.appliedCoupon).toEqual({
        id: "coupon-1",
        code: "TEST20",
        name: "20%OFFクーポン",
        type: "PERCENTAGE",
        discountValue: 20,
      });
    });

    test("固定額クーポンが正しく適用される", () => {
      const result = calculateReservationPrice({
        ...BASE_PARAMS,
        hourlyPrice: 1000,
        hours: 5,
        coupon: FIXED_COUPON,
      });
      expect(result.couponDiscount).toBe(500);
      expect(result.totalPrice).toBe(4500);
    });

    test("スペース割引・長時間割引適用後の価格にクーポンを計算する", () => {
      const spaceDiscount: SpaceDiscountSettings = {
        discountType: "fixed",
        discountValue: 500,
        durationDiscountOverride: "inherit",
      };
      const result = calculateReservationPrice({
        ...BASE_PARAMS,
        hourlyPrice: 1000,
        hours: 5,
        durationRules: BASE_DURATION_RULES,
        durationDiscountEnabled: true,
        spaceDiscount,
        coupon: PERCENTAGE_COUPON,
        combinationMode: "both",
      });
      // basePrice = 5000, spaceDiscount = 500, priceAfterSpace = 4500
      // durationDiscount = Math.floor(4500 * 10%) = 450, priceAfterDuration = 4050
      // couponDiscount = Math.floor(4050 * 20%) = 810
      expect(result.couponDiscount).toBe(810);
    });
  });

  describe("組み合わせモード: best（最大割引を選択）", () => {
    test("長時間割引の方が大きい場合はクーポンを無効化する", () => {
      // 長時間割引: 5000 * 20% = 1000
      // クーポン: 5000 * 10% = 500
      // → 長時間割引を採用
      const smallCoupon: CouponLike = {
        id: "coupon-small",
        code: "SMALL10",
        name: "10%OFF",
        type: "PERCENTAGE",
        discountValue: 10,
        maxDiscountAmount: null,
        canCombineWithDurationDiscount: true,
      };
      const result = calculateReservationPrice({
        ...BASE_PARAMS,
        hourlyPrice: 1000,
        hours: 8,
        durationRules: BASE_DURATION_RULES,
        durationDiscountEnabled: true,
        coupon: smallCoupon,
        combinationMode: "best",
      });
      // basePrice = 8000, durationDiscount = 8000 * 20% = 1600
      // couponDiscount = (8000 - 1600) * 10% = 640 → 実際は priceAfterSpace+duration で計算
      // best モードで durationDiscount > couponDiscount → coupon を無効化
      expect(result.durationDiscount).toBeGreaterThan(0);
      expect(result.couponDiscount).toBe(0);
      expect(result.appliedCoupon).toBeNull();
      expect(result.appliedDurationRule).not.toBeNull();
      expect(result.warnings).toContain(
        "より大きな割引が自動的に適用されました",
      );
    });

    test("クーポンの方が大きい場合は長時間割引を無効化する", () => {
      // 長時間割引: 5000 * 5% = 250
      // クーポン: (5000 - 250) * 50% = 2375 → 計算後の値で比較
      const bigCoupon: CouponLike = {
        id: "coupon-big",
        code: "BIG50",
        name: "50%OFF",
        type: "PERCENTAGE",
        discountValue: 50,
        maxDiscountAmount: null,
        canCombineWithDurationDiscount: true,
      };
      const result = calculateReservationPrice({
        ...BASE_PARAMS,
        hourlyPrice: 1000,
        hours: 3,
        durationRules: BASE_DURATION_RULES,
        durationDiscountEnabled: true,
        coupon: bigCoupon,
        combinationMode: "best",
      });
      expect(result.durationDiscount).toBe(0);
      expect(result.appliedDurationRule).toBeNull();
      expect(result.couponDiscount).toBeGreaterThan(0);
      expect(result.warnings).toContain(
        "より大きな割引が自動的に適用されました",
      );
    });

    test("割引が1種類しかない場合は警告なし", () => {
      const result = calculateReservationPrice({
        ...BASE_PARAMS,
        hourlyPrice: 1000,
        hours: 5,
        durationRules: BASE_DURATION_RULES,
        durationDiscountEnabled: true,
        combinationMode: "best",
      });
      expect(result.warnings).toEqual([]);
    });

    test("showWarning=false の場合は警告メッセージなし", () => {
      const smallCoupon: CouponLike = {
        id: "coupon-small",
        code: "SMALL5",
        name: "5%OFF",
        type: "PERCENTAGE",
        discountValue: 5,
        maxDiscountAmount: null,
        canCombineWithDurationDiscount: true,
      };
      const result = calculateReservationPrice({
        ...BASE_PARAMS,
        hourlyPrice: 1000,
        hours: 8,
        durationRules: BASE_DURATION_RULES,
        durationDiscountEnabled: true,
        coupon: smallCoupon,
        combinationMode: "best",
        showWarning: false,
      });
      expect(result.warnings).toEqual([]);
    });
  });

  describe("組み合わせモード: both（両方適用）", () => {
    test("canCombineWithDurationDiscount=true の場合は両方適用", () => {
      const combinableCoupon: CouponLike = {
        ...PERCENTAGE_COUPON,
        canCombineWithDurationDiscount: true,
      };
      const result = calculateReservationPrice({
        ...BASE_PARAMS,
        hourlyPrice: 1000,
        hours: 5,
        durationRules: BASE_DURATION_RULES,
        durationDiscountEnabled: true,
        coupon: combinableCoupon,
        combinationMode: "both",
      });
      expect(result.durationDiscount).toBeGreaterThan(0);
      expect(result.couponDiscount).toBeGreaterThan(0);
    });

    test("canCombineWithDurationDiscount=false の場合は長時間割引を無効化してクーポン優先", () => {
      const nonCombinableCoupon: CouponLike = {
        ...PERCENTAGE_COUPON,
        canCombineWithDurationDiscount: false,
      };
      const result = calculateReservationPrice({
        ...BASE_PARAMS,
        hourlyPrice: 1000,
        hours: 5,
        durationRules: BASE_DURATION_RULES,
        durationDiscountEnabled: true,
        coupon: nonCombinableCoupon,
        combinationMode: "both",
      });
      // クーポンが併用不可なのでクーポン優先、長時間割引を無効化
      expect(result.durationDiscount).toBe(0);
      expect(result.appliedDurationRule).toBeNull();
      expect(result.couponDiscount).toBeGreaterThan(0);
      expect(result.warnings).toContain(
        "このクーポンは他の割引と併用できません",
      );
    });

    test("both モードで両方適用時は警告メッセージが含まれる", () => {
      const combinableCoupon: CouponLike = {
        ...PERCENTAGE_COUPON,
        canCombineWithDurationDiscount: true,
      };
      const result = calculateReservationPrice({
        ...BASE_PARAMS,
        hourlyPrice: 1000,
        hours: 5,
        durationRules: BASE_DURATION_RULES,
        durationDiscountEnabled: true,
        coupon: combinableCoupon,
        combinationMode: "both",
      });
      expect(result.warnings).toContain(
        "長時間割引とクーポン割引が両方適用されています",
      );
    });

    test("both + showWarning=false では警告なし", () => {
      const combinableCoupon: CouponLike = {
        ...PERCENTAGE_COUPON,
        canCombineWithDurationDiscount: true,
      };
      const result = calculateReservationPrice({
        ...BASE_PARAMS,
        hourlyPrice: 1000,
        hours: 5,
        durationRules: BASE_DURATION_RULES,
        durationDiscountEnabled: true,
        coupon: combinableCoupon,
        combinationMode: "both",
        showWarning: false,
      });
      expect(result.warnings).toEqual([]);
    });
  });

  describe("durationDiscountOverride（スペース割引によるオーバーライド）", () => {
    test("override=inherit かつ durationDiscountEnabled=true で長時間割引が有効", () => {
      const result = calculateReservationPrice({
        ...BASE_PARAMS,
        hourlyPrice: 1000,
        hours: 5,
        durationRules: BASE_DURATION_RULES,
        durationDiscountEnabled: true,
        spaceDiscount: {
          discountType: "none",
          discountValue: null,
          durationDiscountOverride: "inherit",
        },
      });
      expect(result.durationDiscount).toBeGreaterThan(0);
    });

    test("override=inherit かつ durationDiscountEnabled=false で長時間割引が無効", () => {
      const result = calculateReservationPrice({
        ...BASE_PARAMS,
        hourlyPrice: 1000,
        hours: 5,
        durationRules: BASE_DURATION_RULES,
        durationDiscountEnabled: false,
        spaceDiscount: {
          discountType: "none",
          discountValue: null,
          durationDiscountOverride: "inherit",
        },
      });
      expect(result.durationDiscount).toBe(0);
    });

    test("override=enabled の場合は durationDiscountEnabled の値に関わらず長時間割引が有効", () => {
      const result = calculateReservationPrice({
        ...BASE_PARAMS,
        hourlyPrice: 1000,
        hours: 5,
        durationRules: BASE_DURATION_RULES,
        durationDiscountEnabled: false, // グローバルは無効
        spaceDiscount: {
          discountType: "none",
          discountValue: null,
          durationDiscountOverride: "enabled", // スペースで強制有効
        },
      });
      expect(result.durationDiscount).toBeGreaterThan(0);
    });

    test("override=disabled の場合は durationDiscountEnabled=true でも長時間割引が無効", () => {
      const result = calculateReservationPrice({
        ...BASE_PARAMS,
        hourlyPrice: 1000,
        hours: 5,
        durationRules: BASE_DURATION_RULES,
        durationDiscountEnabled: true, // グローバルは有効
        spaceDiscount: {
          discountType: "none",
          discountValue: null,
          durationDiscountOverride: "disabled", // スペースで強制無効
        },
      });
      expect(result.durationDiscount).toBe(0);
    });
  });

  describe("総割引率の計算", () => {
    test("割引なしの場合は totalDiscountRate が 0", () => {
      const result = calculateReservationPrice(BASE_PARAMS);
      expect(result.totalDiscountRate).toBe(0);
    });

    test("20% スペース割引の場合は totalDiscountRate が 20", () => {
      const result = calculateReservationPrice({
        ...BASE_PARAMS,
        hourlyPrice: 1000,
        hours: 5,
        spaceDiscount: {
          discountType: "percentage",
          discountValue: 20,
          durationDiscountOverride: "inherit",
        },
      });
      expect(result.totalDiscountRate).toBe(20);
    });

    test("複数割引の合計率を四捨五入で返す", () => {
      // basePrice = 5000, spaceDiscount = 500 (10%), durationDiscount = 450 (9%)
      // totalDiscount = 950, rate = Math.round(950/5000*100) = Math.round(19) = 19
      const result = calculateReservationPrice({
        ...BASE_PARAMS,
        hourlyPrice: 1000,
        hours: 5,
        durationRules: BASE_DURATION_RULES,
        durationDiscountEnabled: true,
        spaceDiscount: {
          discountType: "percentage",
          discountValue: 10,
          durationDiscountOverride: "inherit",
        },
        combinationMode: "both",
      });
      // spaceDiscount = 500, priceAfterSpace = 4500, durationDiscount = 450
      // totalDiscount = 950, rate = Math.round(950/5000*100) = 19
      expect(result.totalDiscountRate).toBe(19);
    });
  });

  describe("価格が負にならない保護", () => {
    test("割引合計が basePrice を超えても totalPrice は 0 以上", () => {
      const massiveCoupon: CouponLike = {
        id: "coupon-massive",
        code: "MASSIVE",
        name: "99%OFF",
        type: "PERCENTAGE",
        discountValue: 99,
        maxDiscountAmount: null,
        canCombineWithDurationDiscount: true,
      };
      const result = calculateReservationPrice({
        ...BASE_PARAMS,
        hourlyPrice: 1000,
        hours: 5,
        durationRules: BASE_DURATION_RULES,
        durationDiscountEnabled: true,
        coupon: massiveCoupon,
        combinationMode: "both",
        spaceDiscount: {
          discountType: "percentage",
          discountValue: 50,
          durationDiscountOverride: "inherit",
        },
      });
      expect(result.totalPrice).toBeGreaterThanOrEqual(0);
    });
  });

  describe("エッジケース", () => {
    test("hourlyPrice が 0 の場合は全価格が 0", () => {
      const result = calculateReservationPrice({
        ...BASE_PARAMS,
        hourlyPrice: 0,
        hours: 5,
        durationRules: BASE_DURATION_RULES,
        durationDiscountEnabled: true,
        coupon: PERCENTAGE_COUPON,
      });
      expect(result.basePrice).toBe(0);
      expect(result.totalPrice).toBe(0);
    });

    test("spaceDiscount が null の場合はスペース割引なし", () => {
      const result = calculateReservationPrice({
        ...BASE_PARAMS,
        hourlyPrice: 1000,
        hours: 5,
        spaceDiscount: null,
      });
      expect(result.spaceDiscount).toBe(0);
      expect(result.appliedSpaceDiscount).toBeNull();
    });

    test("coupon が null の場合はクーポン割引なし", () => {
      const result = calculateReservationPrice({
        ...BASE_PARAMS,
        hourlyPrice: 1000,
        hours: 5,
        coupon: null,
      });
      expect(result.couponDiscount).toBe(0);
      expect(result.appliedCoupon).toBeNull();
    });

    test("showWarning のデフォルト値は true（省略時も警告が出る）", () => {
      const smallCoupon: CouponLike = {
        id: "coupon-s",
        code: "SMLL",
        name: "小額",
        type: "PERCENTAGE",
        discountValue: 5,
        maxDiscountAmount: null,
        canCombineWithDurationDiscount: true,
      };
      // showWarning を省略
      const { showWarning: _, ...paramsWithoutWarning } = BASE_PARAMS;
      const result = calculateReservationPrice({
        ...paramsWithoutWarning,
        hourlyPrice: 1000,
        hours: 8,
        durationRules: BASE_DURATION_RULES,
        durationDiscountEnabled: true,
        coupon: smallCoupon,
        combinationMode: "best",
      });
      // best モードで両方あれば警告が出るはず（デフォルト showWarning=true）
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});
