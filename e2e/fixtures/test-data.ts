/**
 * E2E テスト用フィクスチャデータ
 */

/** テスト用ユーザー情報 */
export const testUsers = {
  admin: {
    email: "admin@example.com",
    name: "Test Admin",
    role: "ADMIN",
  },
  editor: {
    email: "editor@example.com",
    name: "Test Editor",
    role: "EDITOR",
  },
  viewer: {
    email: "viewer@example.com",
    name: "Test Viewer",
    role: "VIEWER",
  },
} as const;

/** テスト用スペース情報 */
export const testSpaces = {
  roomA: {
    name: "テスト会議室A",
    slug: "test-room-a",
    description: "テスト用の会議室です",
    capacity: 10,
    hourlyPrice: 1000,
    dailyPrice: 8000,
  },
  roomB: {
    name: "テストスタジオB",
    slug: "test-studio-b",
    description: "テスト用のスタジオです",
    capacity: 20,
    hourlyPrice: 2000,
    dailyPrice: 15000,
  },
} as const;

/** テスト用予約情報 */
export const testReservations = {
  valid: {
    customerName: "テスト太郎",
    customerEmail: "test@example.com",
    customerPhone: "090-1234-5678",
    purpose: "テスト予約",
    numberOfPeople: 5,
  },
  invalid: {
    customerName: "", // 必須フィールド空
    customerEmail: "invalid-email", // 不正なメール形式
    customerPhone: "12345", // 不正な電話番号
    purpose: "",
    numberOfPeople: 0,
  },
} as const;

/** テスト用ブログ記事情報 */
export const testBlogPosts = {
  draft: {
    title: "テスト下書き記事",
    slug: "test-draft-post",
    content: "<p>これは下書き記事です。</p>",
    status: "DRAFT",
  },
  published: {
    title: "テスト公開記事",
    slug: "test-published-post",
    content: "<p>これは公開記事です。</p>",
    status: "PUBLISHED",
  },
} as const;

/** テスト用お問い合わせ情報 */
export const testContacts = {
  valid: {
    name: "お問い合わせ太郎",
    email: "contact@example.com",
    phone: "03-1234-5678",
    message: "お問い合わせのテストメッセージです。",
  },
} as const;

/** ページURL定数 */
export const urls = {
  // 公開ページ
  home: "/",
  spaces: "/spaces",
  reservation: "/reservation",
  posts: "/posts",
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
} as const;

/** テストセレクタ */
export const selectors = {
  // 共通
  loadingSpinner: '[data-testid="loading"]',
  errorMessage: '[data-testid="error-message"]',
  successMessage: '[data-testid="success-message"]',
  // フォーム
  submitButton: 'button[type="submit"]',
  // ナビゲーション
  navbar: "nav",
  sidebar: '[data-testid="sidebar"]',
  // テーブル
  dataTable: '[data-testid="data-table"]',
  tableRow: "tr",
} as const;
