/**
 * E2E テスト用 静的フィクスチャ
 *
 * 動的に一意な値が必要な test data（email / phone / slug 等）は
 * `factories.ts` を使う。本ファイルは並列実行で衝突しない静的
 * データ（seed 由来の管理者メールアドレス、ルート URL）のみを置く。
 *
 * 規約 SSoT: `.claude/rules/test-quality/e2e.md`
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
} as const;

/** Public space seed contract used by reservation/review E2E specs. */
export const spaceFixtures = {
  publicReservableSpaceSlug: "coworking-space",
} as const;

/** Review seed contract used by public/customer review E2E specs. */
export const reviewFixtures = {
  publicReviewSpaceSlug: spaceFixtures.publicReservableSpaceSlug,
} as const;
