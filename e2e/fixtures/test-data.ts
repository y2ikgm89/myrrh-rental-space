/**
 * E2E テスト用 静的フィクスチャ
 *
 * 動的に一意な値が必要な test data（email / phone / slug 等）は
 * `factories.ts` を使う。本ファイルは並列実行で衝突しない静的
 * データ（seed 由来の管理者アカウント、ルート URL）のみを置く。
 *
 * 規約 SSoT: `.claude/rules/test-quality/e2e.md`
 */

/** Seed 由来の管理者アカウント（factories.ts の `adminCredentials` が wrap する） */
export const testUsers = {
  admin: {
    email: "admin@example.com",
    name: "Test Admin",
    role: "ADMIN",
  },
} as const;

/** ページ URL 定数（routing の SSoT） */
export const urls = {
  // 公開ページ
  home: "/",
  spaces: "/spaces",
  reservation: "/reservation",
  blog: "/blog",
  news: "/news",
  contact: "/contact",
  events: "/events",
  faq: "/faq",
  // 顧客認証 + マイページ
  customerLogin: "/login",
  mypage: "/mypage",
  mypageReservations: "/mypage/reservations",
  mypageInquiries: "/mypage/inquiries",
  mypageProfile: "/mypage/settings",
  // 管理者認証
  login: "/admin/login",
  // 管理画面
  adminDashboard: "/admin",
  adminSpaces: "/admin/spaces",
  adminReservations: "/admin/reservations",
  adminBlog: "/admin/blog",
  adminNews: "/admin/news",
  adminEvents: "/admin/events",
  adminUsers: "/admin/users",
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
