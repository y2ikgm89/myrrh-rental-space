/**
 * E2E テスト用 静的フィクスチャ
 *
 * 動的に一意な値が必要な test data（email / phone / slug 等）は
 * `factories.ts` を使う。本ファイルは並列実行で衝突しない静的
 * データ（seed 由来の管理者メールアドレス、ルート URL）のみを置く。
 *
 * 規約 SSoT: `.claude/rules/testing-e2e.md`
 */

/** IAP ローカルテスト用の管理者メールアドレス */
export const testUsers = {
  admin: {
    email: "superadmin@example.com",
    name: "Test Super Admin",
    role: "SUPER_ADMIN",
  },
} as const;

/** ページ URL 定数（routing の SSoT） */
export const urls = {
  // 公開ページ
  home: "/",
  about: "/about",
  access: "/access",
  spaces: "/spaces",
  reservation: "/reservation",
  blog: "/blog",
  news: "/news",
  contact: "/contact",
  events: "/events",
  faq: "/faq",
  terms: "/terms",
  // 顧客認証 + マイページ
  customerLogin: "/login",
  mypage: "/mypage",
  mypageReservations: "/mypage",
  mypageEvents: "/mypage/events",
  mypageInquiries: "/mypage/inquiries",
  mypageProfile: "/mypage/settings",
  // 管理画面
  adminDashboard: "/admin",
  adminNotifications: "/admin/notifications",
  adminSpaces: "/admin/spaces",
  adminSpaceLocations: "/admin/spaces?tab=locations",
  adminSpaceCategories: "/admin/spaces?tab=categories",
  adminSpaceReviews: "/admin/spaces?tab=reviews",
  adminReservations: "/admin/reservations",
  adminPosts: "/admin/posts",
  adminNews: "/admin/news",
  adminEvents: "/admin/events",
  adminCustomers: "/admin/customers",
  adminInquiries: "/admin/inquiries",
  adminCoupons: "/admin/coupons",
  adminStaff: "/admin/staff",
  adminAuditLogs: "/admin/audit-logs",
  adminSettings: "/admin/settings",
  adminPages: "/admin/pages",
  adminMedia: "/admin/media",
  adminFaq: "/admin/faq",
  adminTerms: "/admin/terms",
  adminTermsTrash: "/admin/terms/trash",
  adminTermsAgreements: "/admin/terms/agreements",
} as const;

/** Event seed contract used by public/admin/customer E2E specs. */
export const eventFixtures = {
  singleOccurrenceSlug: "yoga-mindfulness-workshop",
  timedEntrySlug: "photography-workshop",
  /** capacity=1、1 CONFIRMED + 2 WAITLISTED + 1 WAITLISTED_OFFERED 固定の waitlist fixture */
  waitlistTestSlug: "waitlist-test",
} as const;

/** Public space seed contract used by reservation/review E2E specs. */
export const spaceFixtures = {
  publicReservableSpaceSlug: "coworking-space",
  /**
   * 管理画面の料金プラン CRUD E2E（`space-rate-plan-crud.spec.ts`）専用ターゲット。
   *
   * `publicReservableSpaceSlug`（coworking-space）は
   * `e2e/smoke/rate-plan-preview.smoke.spec.ts` が `"use cache"` の
   * `cacheTag(CACHE_TAGS.SPACE_RATE_PLANS(spaceId))` を読む対象。このタグは
   * spaceId（DB 行の UUID）キーのため（`src/shared/lib/constants/cache.ts`）、
   * CRUD spec の create/update/delete（`invalidateSpaceRatePlansCache` → `updateTag`）
   * が別 Space を対象にする限り構造的に別タグになり競合しない。かつて両 spec が
   * 同一 coworking-space を対象にしていたため、CI `workers: 2` の並列実行下で
   * smoke の価格アサーションが 15〜30 秒超まで遅延する flake が発生していた
   * （Task 16 follow-up fix で解消）。この slug を smoke spec 側の price assertion
   * 対象に**しない**こと（`seedSpaceRatePlans` は全 Space 共通で週末/祝日料金プランを
   * 作成するため、CRUD spec の健全性チェックはこの Space でも成立する）。
   */
  adminRatePlanCrudTargetSlug: "seminar-room",
} as const;

/** Review seed contract used by public/customer review E2E specs. */
export const reviewFixtures = {
  publicReviewSpaceSlug: spaceFixtures.publicReservableSpaceSlug,
} as const;

/**
 * SpaceRatePlan seed contract used by rate-plan preview E2E specs.
 * `prisma/seed.ts`（`seedSpaceRatePlans`）が全 Space に対して同名で作成する
 * 週末 / 祝日料金プラン。weekendPlanName は daysOfWeek に FRIDAY/SATURDAY/SUNDAY
 * を含み holidayMode: "any" のため、平日と比べて金曜も含めた検証に使える。
 */
export const ratePlanFixtures = {
  weekendPlanName: "週末料金",
  holidayPlanName: "祝日料金",
} as const;

/**
 * ReservationSeries seed contract used by admin recurring reservation E2E specs.
 *
 * `prisma/seed.ts` の `seedRecurringReservationSeriesFixture` が dev customer +
 * 既存 space に対して WEEKLY BYDAY=TU COUNT=3 の series を 1 件と 3 instance を
 * seed する。以下の値を変更したら seed 側も同時更新すること (memory 契約:
 * seed と e2e/fixtures の二重定義結合)。
 */
export const seriesFixtures = {
  /** notes に付く prefix。instance の findFirst 検索 key として使う。 */
  markerNotesPrefix: "[E2E] recurring series (Phase B.2.1 Task B)",
  /** RRULE (WEEKLY BYDAY=TU COUNT=3)。 */
  rrule: "FREQ=WEEKLY;BYDAY=TU;COUNT=3",
  /** dtstart (固定 UTC、2027-05-04 は火曜)。 */
  dtstartIso: "2027-05-04T14:00:00.000Z",
  /** instance 総数。 */
  instanceCount: 3,
} as const;
