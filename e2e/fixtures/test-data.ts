/**
 * E2E テスト用 静的フィクスチャ
 *
 * 動的に一意な値が必要な test data（email / phone / slug 等）は
 * `factories.ts` を使う。本ファイルは並列実行で衝突しない静的
 * データ（seed 由来の管理者メールアドレス、ルート URL）のみを置く。
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

/** Mypage inquiry detail path（seed-driven inquiry id 用） */
export function mypageInquiryDetailPath(inquiryId: string): string {
  return `/mypage/inquiries/${inquiryId}`;
}

/**
 * Inquiry seed contract used by customer/admin E2E specs.
 *
 * `prisma/seed.ts` の `seedDevCustomerAndReservations` /
 * `seedInquiryOperationalFixtures` と同期すること。
 */
export const inquiryFixtures = {
  devCustomerNewSubject: "[E2E] dev customer の新規お問い合わせ",
  devCustomerResolvedSubject: "[E2E] dev customer の解決済お問い合わせ",
  devCustomerResolvedStaffReply:
    "ご返信ありがとうございました。引き続きよろしくお願いします。",
  devCustomerResolvedCustomerReply:
    "追加で確認したい点があります。解決済みの件ですが、領収書の再発行は可能でしょうか？",
  /** `inquiry-reply.spec.ts` がフォーム送信で追加する返信 marker */
  e2eCustomerReplyMarker: "[E2E] inquiry-reply.spec.ts からの追加返信",
  generalResolvedStaffReplySubject: "予約変更",
  generalInProgressAssigneeSubject: "料金プラン",
  tagInProgress: "対応中",
  tagHighPriority: "優先度高",
} as const;

/** Event seed contract used by public/admin/customer E2E specs. */
export const eventFixtures = {
  singleOccurrenceSlug: "yoga-mindfulness-workshop",
  timedEntrySlug: "photography-workshop",
  /** capacity=1、1 CONFIRMED + 2 WAITLISTED + 1 WAITLISTED_OFFERED 固定の waitlist fixture */
  waitlistTestSlug: "waitlist-test",
} as const;

/** EventCategory seed contract used by public/admin E2E specs. */
export const eventCategoryFixtures = {
  workshopName: "ワークショップ",
  marketName: "マルシェ・展示",
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
  /**
   * 時刻依存 fixture（`scripts/e2e/create-passcode-reveal-fixture.ts`）が
   * **専有する**非公開スペース。上の 2 つと同じ「spec ごとにスペースを分けて
   * 相互破壊を防ぐ」規約の適用で、こちらは時間軸の衝突を防ぐ。
   *
   * このスペースは seed のデモ予約（`DEMO_RESERVATION_SPACE_SLUGS`）の対象外なので、
   * 実行時刻がどこであっても `[now-1h, now+1h]` が必ず空いている。以前は
   * 「空いている公開スペースを探す」実装で、デモ当日予約が全スペースを塞ぐ
   * 時間帯（実測 16:00〜18:00 UTC）に fixture 生成ごと落ちていた
   * （CI run 30708064822）。
   *
   * 非公開なので `/spaces` に出ず、`e2e/visual/public-pages.spec.ts` の
   * `spaces-list.png` にも影響しない。seed 側は `seedDev()` からのみ作るため
   * 本番には入らない。slug の一致は
   * `__tests__/unit/architecture/e2e-fixture-space-ownership.test.ts` が機械強制する。
   */
  passcodeRevealSpaceSlug: "e2e-passcode-fixture",
  /**
   * ゲスト予約系 fixture（claim / status hub / 領収書）が**専有する**非公開スペース。
   *
   * これらは固定または乱択の日時に予約を作る。共有の `coworking-space` に作って
   * いたため、同じ枠を要求する 2 回目の実行が EXCLUDE 制約
   * `reservations_no_active_time_overlap_excl` に弾かれていた。claim fixture は
   * spec 本体から呼ばれ CI は `retries: 2` なので、**1 度落ちると 3 attempt すべてが
   * fixture 生成エラーで落ち続け、本来の失敗理由が見えなくなる**。
   *
   * 解錠番号 fixture とは別スペースにする（1 fixture 1 スペース。相乗りさせると
   * 同じ衝突が別の組み合わせで復活する）。slug の一致と
   * `DEMO_RESERVATION_SPACE_SLUGS` からの除外は
   * `__tests__/unit/architecture/e2e-fixture-space-ownership.test.ts` が機械強制する。
   */
  guestReservationSpaceSlug: "e2e-guest-reservation-fixture",
  /**
   * 定期予約の 3 択キャンセル spec（`create-recurring-reservation.spec.ts`）が
   * **専有する**非公開スペース。
   *
   * この spec は series を丸ごとキャンセルするため fixture を破壊的に消費する。
   * 以前は fixture script が実行のたびに Location / Space / Customer ごと新規作成して
   * いたが、後始末が無いので行が際限なく溜まっていた。専有スペースの中身だけを
   * 毎回 purge → 再作成する形にして有界にした。
   */
  recurringSeriesSpaceSlug: "e2e-recurring-series-fixture",
  /**
   * series bulk-cancel の返金ポリシー spec（E2E-01）が**専有する**非公開スペース。
   *
   * `recurringSeriesSpaceSlug` と分ける。両 spec は同じ `chromium-admin` project で
   * 並走しうるので、相乗りさせると purge が相手の fixture ごと消す。
   */
  seriesRefundSpaceSlug: "e2e-series-refund-fixture",
} as const;

/** Review seed contract used by public/customer review E2E specs. */
export const reviewFixtures = {
  publicReviewSpaceSlug: spaceFixtures.publicReservableSpaceSlug,
} as const;

/**
 * SpaceRatePlan seed contract used by rate-plan preview E2E specs.
 * `prisma/seed.ts`（`seedSpaceRatePlans`）が全 Space に対して同名で作成する
 * 週末 / 祝日料金プラン。weekendPlanName は daysOfWeek に FRIDAY/SATURDAY/SUNDAY
 * を含み holidayMode: "ANY" のため、平日と比べて金曜も含めた検証に使える。
 */
export const ratePlanFixtures = {
  weekendPlanName: "週末料金",
  holidayPlanName: "祝日料金",
} as const;

// ReservationSeries の行そのものは seed しない。series を消費する spec は fixture を
// 破壊的にキャンセルするため、共有 seed 行では retry・再実行ができない。seed が
// 用意するのは上の 2 つの専有スペースだけで、series と instance は
// `e2e/helpers/reservation-series-fixture.ts` が実行のたびに purge → 再作成する。
