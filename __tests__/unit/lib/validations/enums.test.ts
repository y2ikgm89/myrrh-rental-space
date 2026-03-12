import { describe, test, expect } from "bun:test";
import {
  Role,
  ReservationStatus,
  InquiryStatus,
  CustomerStatus,
  NavigationType,
  SocialPlatform,
  LayoutWidth,
  PostStatus,
  AuditAction,
  MediaType,
  MediaUsage,
  TermsType,
  TermsStatus,
  CouponType,
  ACTIVE_RESERVATION_STATUSES,
  isValidRole,
  isValidReservationStatus,
  isValidInquiryStatus,
  isValidCustomerStatus,
  isValidNavigationType,
  isValidSocialPlatform,
  isValidLayoutWidth,
  isValidPostStatus,
  isValidNewsStatusFilter,
  isValidAuditAction,
  isValidMediaType,
  isValidMediaUsage,
  isValidTermsType,
  isValidTermsStatus,
  isValidCouponType,
  getValidRole,
  getValidReservationStatus,
  getValidInquiryStatus,
  getValidCustomerStatus,
  getValidLayoutWidth,
  getValidPostStatus,
  getValidMediaType,
  getValidMediaUsage,
  parseReservationStatusFilter,
  parseInquiryStatusFilter,
  parseCustomerStatusFilter,
  parsePostStatusFilter,
  parseNewsStatusFilter,
  parseRoleFilter,
  parseAuditActionFilter,
  getRoleFilterOrAll,
  getAuditActionFilterOrAll,
  getReservationStatusFilterOrAll,
} from "@/shared/lib/validations/enums";

describe("ACTIVE_RESERVATION_STATUSES", () => {
  test("PENDING と CONFIRMED を含む", () => {
    expect(ACTIVE_RESERVATION_STATUSES).toContain(ReservationStatus.PENDING);
    expect(ACTIVE_RESERVATION_STATUSES).toContain(ReservationStatus.CONFIRMED);
  });

  test("2つの要素を含む", () => {
    expect(ACTIVE_RESERVATION_STATUSES).toHaveLength(2);
  });
});

describe("isValidRole", () => {
  test("有効なロールの場合 true を返す", () => {
    expect(isValidRole(Role.SUPER_ADMIN)).toBe(true);
    expect(isValidRole(Role.ADMIN)).toBe(true);
    expect(isValidRole(Role.EDITOR)).toBe(true);
    expect(isValidRole(Role.VIEWER)).toBe(true);
    expect(isValidRole(Role.USER)).toBe(true);
  });

  test("無効なロールの場合 false を返す", () => {
    expect(isValidRole("INVALID_ROLE")).toBe(false);
    expect(isValidRole("")).toBe(false);
    expect(isValidRole(null)).toBe(false);
    expect(isValidRole(undefined)).toBe(false);
    expect(isValidRole(123)).toBe(false);
  });
});

describe("isValidReservationStatus", () => {
  test("有効な予約ステータスの場合 true を返す", () => {
    expect(isValidReservationStatus(ReservationStatus.PENDING)).toBe(true);
    expect(isValidReservationStatus(ReservationStatus.CONFIRMED)).toBe(true);
    expect(isValidReservationStatus(ReservationStatus.CANCELLED)).toBe(true);
  });

  test("無効な予約ステータスの場合 false を返す", () => {
    expect(isValidReservationStatus("INVALID")).toBe(false);
    expect(isValidReservationStatus(null)).toBe(false);
  });
});

describe("isValidInquiryStatus", () => {
  test("有効なお問い合わせステータスの場合 true を返す", () => {
    expect(isValidInquiryStatus(InquiryStatus.NEW)).toBe(true);
    expect(isValidInquiryStatus(InquiryStatus.IN_PROGRESS)).toBe(true);
    expect(isValidInquiryStatus(InquiryStatus.RESOLVED)).toBe(true);
    expect(isValidInquiryStatus(InquiryStatus.CLOSED)).toBe(true);
  });

  test("無効なお問い合わせステータスの場合 false を返す", () => {
    expect(isValidInquiryStatus("INVALID")).toBe(false);
  });
});

describe("isValidCustomerStatus", () => {
  test("有効な顧客ステータスの場合 true を返す", () => {
    expect(isValidCustomerStatus(CustomerStatus.NEW)).toBe(true);
    expect(isValidCustomerStatus(CustomerStatus.REGULAR)).toBe(true);
    expect(isValidCustomerStatus(CustomerStatus.VIP)).toBe(true);
    expect(isValidCustomerStatus(CustomerStatus.INACTIVE)).toBe(true);
    expect(isValidCustomerStatus(CustomerStatus.BLACKLIST)).toBe(true);
  });

  test("無効な顧客ステータスの場合 false を返す", () => {
    expect(isValidCustomerStatus("INVALID")).toBe(false);
  });
});

describe("isValidNavigationType", () => {
  test("有効なナビゲーションタイプの場合 true を返す", () => {
    expect(isValidNavigationType(NavigationType.HEADER_DESKTOP)).toBe(true);
    expect(isValidNavigationType(NavigationType.HEADER_MOBILE)).toBe(true);
    expect(isValidNavigationType(NavigationType.FOOTER)).toBe(true);
  });

  test("無効なナビゲーションタイプの場合 false を返す", () => {
    expect(isValidNavigationType("INVALID")).toBe(false);
  });
});

describe("isValidSocialPlatform", () => {
  test("有効なソーシャルプラットフォームの場合 true を返す", () => {
    expect(isValidSocialPlatform(SocialPlatform.INSTAGRAM)).toBe(true);
    expect(isValidSocialPlatform(SocialPlatform.FACEBOOK)).toBe(true);
    expect(isValidSocialPlatform(SocialPlatform.TWITTER)).toBe(true);
    expect(isValidSocialPlatform(SocialPlatform.YOUTUBE)).toBe(true);
    expect(isValidSocialPlatform(SocialPlatform.LINE)).toBe(true);
    expect(isValidSocialPlatform(SocialPlatform.TIKTOK)).toBe(true);
    expect(isValidSocialPlatform(SocialPlatform.OTHER)).toBe(true);
  });

  test("無効なソーシャルプラットフォームの場合 false を返す", () => {
    expect(isValidSocialPlatform("INVALID")).toBe(false);
  });
});

describe("isValidLayoutWidth", () => {
  test("有効なレイアウト幅の場合 true を返す", () => {
    expect(isValidLayoutWidth(LayoutWidth.FULL)).toBe(true);
    expect(isValidLayoutWidth(LayoutWidth.XS)).toBe(true);
    expect(isValidLayoutWidth(LayoutWidth.SM)).toBe(true);
    expect(isValidLayoutWidth(LayoutWidth.MD)).toBe(true);
    expect(isValidLayoutWidth(LayoutWidth.LG)).toBe(true);
    expect(isValidLayoutWidth(LayoutWidth.XL)).toBe(true);
    expect(isValidLayoutWidth(LayoutWidth.CUSTOM)).toBe(true);
  });

  test("無効なレイアウト幅の場合 false を返す", () => {
    expect(isValidLayoutWidth("INVALID")).toBe(false);
  });
});

describe("isValidPostStatus", () => {
  test("有効な投稿ステータスの場合 true を返す", () => {
    expect(isValidPostStatus(PostStatus.DRAFT)).toBe(true);
    expect(isValidPostStatus(PostStatus.PUBLISHED)).toBe(true);
  });

  test("無効な投稿ステータスの場合 false を返す", () => {
    expect(isValidPostStatus("INVALID")).toBe(false);
  });
});

describe("isValidNewsStatusFilter", () => {
  test("有効なニュースステータスフィルターの場合 true を返す", () => {
    expect(isValidNewsStatusFilter("ALL")).toBe(true);
    expect(isValidNewsStatusFilter("PUBLISHED")).toBe(true);
    expect(isValidNewsStatusFilter("DRAFT")).toBe(true);
  });

  test("無効なニュースステータスフィルターの場合 false を返す", () => {
    expect(isValidNewsStatusFilter("INVALID")).toBe(false);
  });
});

describe("isValidAuditAction", () => {
  test("有効な監査アクションの場合 true を返す", () => {
    expect(isValidAuditAction(AuditAction.CREATE)).toBe(true);
    expect(isValidAuditAction(AuditAction.UPDATE)).toBe(true);
    expect(isValidAuditAction(AuditAction.DELETE)).toBe(true);
  });

  test("無効な監査アクションの場合 false を返す", () => {
    expect(isValidAuditAction("INVALID")).toBe(false);
  });
});

describe("isValidMediaType", () => {
  test("有効なメディアタイプの場合 true を返す", () => {
    expect(isValidMediaType(MediaType.IMAGE)).toBe(true);
    expect(isValidMediaType(MediaType.VIDEO)).toBe(true);
    expect(isValidMediaType(MediaType.DOCUMENT)).toBe(true);
  });

  test("無効なメディアタイプの場合 false を返す", () => {
    expect(isValidMediaType("INVALID")).toBe(false);
  });
});

describe("isValidMediaUsage", () => {
  test("有効なメディア用途の場合 true を返す", () => {
    expect(isValidMediaUsage(MediaUsage.POST)).toBe(true);
    expect(isValidMediaUsage(MediaUsage.NEWS)).toBe(true);
    expect(isValidMediaUsage(MediaUsage.PAGE)).toBe(true);
    expect(isValidMediaUsage(MediaUsage.SPACE)).toBe(true);
    expect(isValidMediaUsage(MediaUsage.SITE)).toBe(true);
    expect(isValidMediaUsage(MediaUsage.GENERAL)).toBe(true);
  });

  test("無効なメディア用途の場合 false を返す", () => {
    expect(isValidMediaUsage("INVALID")).toBe(false);
  });
});

describe("isValidTermsType", () => {
  test("有効な規約タイプの場合 true を返す", () => {
    expect(isValidTermsType(TermsType.TERMS_OF_USE)).toBe(true);
    expect(isValidTermsType(TermsType.PRIVACY_POLICY)).toBe(true);
    expect(isValidTermsType(TermsType.CANCELLATION)).toBe(true);
    expect(isValidTermsType(TermsType.PAYMENT)).toBe(true);
    expect(isValidTermsType(TermsType.CUSTOM)).toBe(true);
  });

  test("無効な規約タイプの場合 false を返す", () => {
    expect(isValidTermsType("INVALID")).toBe(false);
  });
});

describe("isValidTermsStatus", () => {
  test("有効な規約ステータスの場合 true を返す", () => {
    expect(isValidTermsStatus(TermsStatus.DRAFT)).toBe(true);
    expect(isValidTermsStatus(TermsStatus.PUBLISHED)).toBe(true);
    expect(isValidTermsStatus(TermsStatus.ARCHIVED)).toBe(true);
  });

  test("無効な規約ステータスの場合 false を返す", () => {
    expect(isValidTermsStatus("INVALID")).toBe(false);
  });
});

describe("isValidCouponType", () => {
  test("有効なクーポンタイプの場合 true を返す", () => {
    expect(isValidCouponType(CouponType.PERCENTAGE)).toBe(true);
    expect(isValidCouponType(CouponType.FIXED_AMOUNT)).toBe(true);
  });

  test("無効なクーポンタイプの場合 false を返す", () => {
    expect(isValidCouponType("INVALID")).toBe(false);
  });
});

describe("getValidRole", () => {
  test("有効なロールの場合そのロールを返す", () => {
    expect(getValidRole(Role.ADMIN, Role.USER)).toBe(Role.ADMIN);
  });

  test("無効なロールの場合フォールバック値を返す", () => {
    expect(getValidRole("INVALID", Role.USER)).toBe(Role.USER);
    expect(getValidRole(null, Role.USER)).toBe(Role.USER);
    expect(getValidRole(undefined, Role.USER)).toBe(Role.USER);
  });
});

describe("getValidReservationStatus", () => {
  test("有効な予約ステータスの場合そのステータスを返す", () => {
    expect(
      getValidReservationStatus(
        ReservationStatus.CONFIRMED,
        ReservationStatus.PENDING,
      ),
    ).toBe(ReservationStatus.CONFIRMED);
  });

  test("無効な予約ステータスの場合フォールバック値を返す", () => {
    expect(
      getValidReservationStatus("INVALID", ReservationStatus.PENDING),
    ).toBe(ReservationStatus.PENDING);
  });
});

describe("parseReservationStatusFilter", () => {
  test("有効なステータスの場合そのステータスを返す", () => {
    expect(parseReservationStatusFilter(ReservationStatus.CONFIRMED)).toBe(
      ReservationStatus.CONFIRMED,
    );
  });

  test("ALL の場合 undefined を返す", () => {
    expect(parseReservationStatusFilter("ALL")).toBeUndefined();
  });

  test("null の場合 undefined を返す", () => {
    expect(parseReservationStatusFilter(null)).toBeUndefined();
  });

  test("無効なステータスの場合 undefined を返す", () => {
    expect(parseReservationStatusFilter("INVALID")).toBeUndefined();
  });
});

describe("parseNewsStatusFilter", () => {
  test("有効なフィルターの場合そのフィルターを返す", () => {
    expect(parseNewsStatusFilter("PUBLISHED")).toBe("PUBLISHED");
    expect(parseNewsStatusFilter("DRAFT")).toBe("DRAFT");
  });

  test("ALL の場合 ALL を返す", () => {
    expect(parseNewsStatusFilter("ALL")).toBe("ALL");
  });

  test("null の場合 ALL を返す", () => {
    expect(parseNewsStatusFilter(null)).toBe("ALL");
  });

  test("無効なフィルターの場合 ALL を返す", () => {
    expect(parseNewsStatusFilter("INVALID")).toBe("ALL");
  });
});

describe("getRoleFilterOrAll", () => {
  test("有効なロールの場合そのロールを返す", () => {
    expect(getRoleFilterOrAll(Role.ADMIN)).toBe(Role.ADMIN);
  });

  test("ALL の場合 ALL を返す", () => {
    expect(getRoleFilterOrAll("ALL")).toBe("ALL");
  });

  test("null の場合 ALL を返す", () => {
    expect(getRoleFilterOrAll(null)).toBe("ALL");
  });

  test("無効なロールの場合 ALL を返す", () => {
    expect(getRoleFilterOrAll("INVALID")).toBe("ALL");
  });
});

describe("getAuditActionFilterOrAll", () => {
  test("有効な監査アクションの場合そのアクションを返す", () => {
    expect(getAuditActionFilterOrAll(AuditAction.CREATE)).toBe(
      AuditAction.CREATE,
    );
  });

  test("ALL の場合 ALL を返す", () => {
    expect(getAuditActionFilterOrAll("ALL")).toBe("ALL");
  });

  test("無効な監査アクションの場合 ALL を返す", () => {
    expect(getAuditActionFilterOrAll("INVALID")).toBe("ALL");
  });
});

describe("getReservationStatusFilterOrAll", () => {
  test("有効な予約ステータスの場合そのステータスを返す", () => {
    expect(getReservationStatusFilterOrAll(ReservationStatus.CONFIRMED)).toBe(
      ReservationStatus.CONFIRMED,
    );
  });

  test("ALL の場合 ALL を返す", () => {
    expect(getReservationStatusFilterOrAll("ALL")).toBe("ALL");
  });

  test("無効な予約ステータスの場合 ALL を返す", () => {
    expect(getReservationStatusFilterOrAll("INVALID")).toBe("ALL");
  });
});
