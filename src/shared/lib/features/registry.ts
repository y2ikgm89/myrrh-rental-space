/**
 * Feature Module Registry — SSoT for site-level feature toggles
 *
 * Sanity / Stripe Capabilities / Shopify shop.features の合成パターン:
 * - registry はメタデータのみ保持（label / requires / publicRoutes / sectionTypes / templates 等）
 * - 実際の ON/OFF 値は `SettingsFeatures.featureModules` JSON column が SSoT
 * - registry に `defaultEnabled` を持たない（DB explicit declarative）
 * - DB key 欠損時は `isFeatureEnabled` が fail-closed（false）
 * - seed.ts / migration が全 module を explicit に設定する契約
 *
 * 新規 module 追加時の 5 点同時更新:
 * 1. `FEATURE_MODULES_LIST` const tuple に id を追加
 * 2. `FEATURE_MODULES` Record にメタデータを追加
 * 3. `prisma/seed.ts` `seedSettings` の `featureModules` に追加
 * 4. 該当 migration（SQL UPDATE で新 key を埋める）
 * 5. `/admin/settings/features` UI で表示
 */

export const FEATURE_MODULES_LIST = [
  "spaces",
  "reservation",
  "events",
  "posts",
  "news",
  "faq",
  "access",
  "contact",
  "reviews",
  "payment",
  "data-retention",
] as const;

export type FeatureModule = (typeof FEATURE_MODULES_LIST)[number];

export interface FeatureModuleDef {
  readonly id: FeatureModule;
  /** 管理画面 UI 表示用ラベル */
  readonly label: string;
  /** 管理画面 UI 表示用説明 */
  readonly description: string;
  /** 依存 module（OFF なら自身も自動 OFF） */
  readonly requires?: readonly FeatureModule[];
  /**
   * 404 ガード対象の公開ルート prefix。配下の page.tsx / route.ts で
   * `await requireFeatureEnabled(<id>)` を呼ぶ (OFF 時に notFound())。
   * nav / sitemap の `isUrlDisabled` もこの prefix を参照する。
   * 実装対象は `public-route-gates.test.ts` が grep gate する。
   */
  readonly publicRoutes: readonly string[];
  /** Page table の slug（管理画面で feature OFF 警告表示用） */
  readonly pageSlugs: readonly string[];
  /** AddSectionDialog から除外する section type */
  readonly sectionTypes: readonly string[];
  /**
   * PAGE_TEMPLATES から除外する template id。
   * feature OFF 時は `getFeatureFilterContext().disabledTemplates` に集約され、
   * page create (`assertPageTemplateEnabled`) で fail-closed される。
   */
  readonly templates: readonly string[];
  /** 早期 return 対象の cron route path */
  readonly cronPaths: readonly string[];
}

export const FEATURE_MODULES: Record<FeatureModule, FeatureModuleDef> = {
  spaces: {
    id: "spaces",
    label: "スペース管理",
    description:
      "レンタルスペースの公開・予約基盤。これを OFF にすると reservation / reviews も自動 OFF",
    publicRoutes: ["/spaces"],
    pageSlugs: ["spaces"],
    sectionTypes: ["space-list", "space-showcase"],
    templates: ["spaces-archive"],
    cronPaths: [],
  },
  reservation: {
    id: "reservation",
    label: "予約フォーム",
    description: "/reservation の予約申込フォーム（スペース管理が必要）",
    requires: ["spaces"],
    publicRoutes: ["/reservation"],
    pageSlugs: ["reservation"],
    sectionTypes: ["reservation-form"],
    templates: ["reservation"],
    // pending-reservation-expire は fail-safe settlement (PENDING 在庫占有防止) のため
    // feature OFF でも実行。cronPaths には載せない (payment receipt-backfill と同型)。
    cronPaths: ["/api/cron/reservation-reminder"],
  },
  events: {
    id: "events",
    label: "イベント",
    description: "/events のイベントカレンダー・申込",
    publicRoutes: ["/events"],
    pageSlugs: ["events"],
    sectionTypes: ["event-calendar"],
    templates: ["events-archive"],
    cronPaths: [
      "/api/cron/event-import",
      "/api/cron/event-reminder",
      "/api/cron/waitlist-expire",
      "/api/cron/unpaid-event-registration-expire",
    ],
  },
  posts: {
    id: "posts",
    label: "ブログ",
    description:
      "/blog のブログ記事一覧・詳細（カテゴリ / タグ別アーカイブ含む）",
    publicRoutes: ["/blog", "/category", "/tag"],
    pageSlugs: ["blog"],
    sectionTypes: ["post-list"],
    templates: ["blog-archive"],
    cronPaths: [
      "/api/cron/blog-scheduled-publish",
      "/api/cron/blog-trash-cleanup",
    ],
  },
  news: {
    id: "news",
    label: "お知らせ",
    description: "/news のお知らせ一覧・詳細",
    publicRoutes: ["/news"],
    pageSlugs: ["news"],
    sectionTypes: ["news-list"],
    templates: ["news-archive"],
    cronPaths: ["/api/cron/news-scheduled-publish"],
  },
  faq: {
    id: "faq",
    label: "FAQ",
    description: "/faq のよくある質問",
    publicRoutes: ["/faq"],
    pageSlugs: ["faq"],
    sectionTypes: ["faq-list"],
    templates: ["faq"],
    cronPaths: ["/api/cron/faq-stale-check", "/api/cron/faq-trash-cleanup"],
  },
  access: {
    id: "access",
    label: "アクセス",
    description: "/access の拠点情報（多拠点対応）",
    publicRoutes: ["/access"],
    pageSlugs: ["access"],
    sectionTypes: ["location-list"],
    templates: ["access"],
    cronPaths: [],
  },
  contact: {
    id: "contact",
    label: "お問い合わせ",
    description: "/contact のお問い合わせフォーム",
    publicRoutes: ["/contact"],
    pageSlugs: ["contact"],
    sectionTypes: ["contact-form"],
    templates: ["contact"],
    cronPaths: [],
  },
  reviews: {
    id: "reviews",
    label: "レビュー",
    description: "スペースレビューの投稿・公開",
    requires: ["spaces"],
    publicRoutes: [],
    pageSlugs: [],
    sectionTypes: [],
    templates: [],
    cronPaths: [],
  },
  payment: {
    id: "payment",
    label: "オンライン決済",
    description:
      "Stripe を使った予約・イベントのオンライン決済と適格請求書 (領収書) 発行。OFF にすると新規 checkout のみ無効化される（既存決済の webhook / 返金 / 領収書 backfill は Stripe credentials があれば継続。credentials は「Stripe 連携」で別途設定）。",
    requires: ["reservation"],
    publicRoutes: [
      "/events/registrations/checkout",
      "/events/registrations/payment-result",
      "/events/waitlist/checkout",
    ],
    pageSlugs: [],
    sectionTypes: [],
    templates: [],
    // receipt-backfill (`/api/cron/receipt-backfill`) は credentials gate（feature OFF でも
    // orphan reconcile 継続）のため cronPaths には載せない。feature-gated cron のみここに列挙する。
    // admin nav badge: command palette `settings-billing` は featureModule: "payment" で
    // payment OFF 時に「非公開」表示（Stripe credentials 設定は admin から継続可）。
    cronPaths: [],
  },
  "data-retention": {
    id: "data-retention",
    label: "データ保持ポリシーの自動適用",
    description:
      "個情法 22 条・GDPR 5(1)(e) 準拠の保持期間強制。保持期間経過後の Session / Verification の DELETE、Reservation.guest 情報の NULL 化、Inquiry の DELETE、INACTIVE Customer の PII 匿名化を毎日実行する。保持月数は Settings.dataRetention JSON が SSoT (0 で該当テーブルを opt-out)。opt-in — 有効化前に月数を業務ルールと合わせて確認すること。",
    publicRoutes: [],
    pageSlugs: [],
    sectionTypes: [],
    templates: [],
    cronPaths: ["/api/cron/data-retention"],
  },
};

/** 型ガード: 任意文字列が FeatureModule か判定 */
const FEATURE_MODULE_SET = new Set<string>(FEATURE_MODULES_LIST);
export function isFeatureModule(value: string): value is FeatureModule {
  return FEATURE_MODULE_SET.has(value);
}

/**
 * Feature Module の「初期値」を構築する。
 *
 * `disabledIds` に含まれない module は ON で初期化する。
 * - seed.ts の新規 install 時の `SettingsFeatures.featureModules` 初期化
 * - 管理画面の「すべて初期値に戻す」ボタン等の reset 用途
 *
 * env var driven override は呼び出し側で解決して `disabledIds` に渡す（このヘルパー
 * 自体は env を読まない pure function — テスト可能性のため）。
 *
 * ## `data-retention` は常に OFF 初期化（デフォルト opt-out）
 *
 * データ保持ポリシー cron は誤設定で本番 PII を消し得るため、seed 時に自動 ON に
 * しない — `disabledIds` に含まれるかどうかに関わらず必ず `false` を返す。
 * 本番運用者が保持月数（Settings.dataRetention JSON）を業務ルールと突き合わせて
 * 検証してから、管理 UI 経由で明示的に ON にする。
 *
 * @example
 * buildInitialFeatureModules()
 * // => { spaces: true, reservation: true, ..., reviews: true, "data-retention": false }
 *
 * buildInitialFeatureModules(["events", "faq"])
 * // => { spaces: true, ..., events: false, faq: false, ..., "data-retention": false }
 */
export function buildInitialFeatureModules(
  disabledIds: readonly string[] = [],
): Record<FeatureModule, boolean> {
  const disabled = new Set<string>(disabledIds);
  // Record の cardinality を全 module で完全網羅（不変条件）
  const spaces = !disabled.has("spaces");
  const reservation = !disabled.has("reservation");
  const events = !disabled.has("events");
  const posts = !disabled.has("posts");
  const news = !disabled.has("news");
  const faq = !disabled.has("faq");
  const access = !disabled.has("access");
  const contact = !disabled.has("contact");
  const reviews = !disabled.has("reviews");
  const payment = !disabled.has("payment");
  // fail-closed by design: never seed data-retention as ON.
  const dataRetention = false;
  return {
    spaces,
    reservation,
    events,
    posts,
    news,
    faq,
    access,
    contact,
    reviews,
    payment,
    "data-retention": dataRetention,
  };
}

/**
 * カンマ区切り env var 文字列を `disabledIds` 配列に正規化する。
 *
 * 形式: `"events,faq"` / `"events, posts , news"`（空白許容）
 * 空文字 / undefined → 空配列。
 */
export function parseDisabledFeatureModulesEnv(
  value: string | undefined,
): readonly string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Feature Module ON/OFF map を依存関係に従って正規化する（write-side SSoT）。
 *
 * `requires` の依存先が OFF の module は、自身も強制的に OFF にする。
 * read 側の `getEnabledFeatures` と同じ fixed-point 解決を persist 前に適用し、
 * DB に矛盾状態（spaces OFF + reservation ON 等）を書き込まない。
 */
export function normalizeFeatureModules(
  modules: Record<string, boolean>,
): Record<FeatureModule, boolean> {
  const enabled = new Set<FeatureModule>();

  for (const id of FEATURE_MODULES_LIST) {
    if (modules[id] === true) {
      enabled.add(id);
    }
  }

  for (let pass = 0; pass < FEATURE_MODULES_LIST.length; pass++) {
    let removed = false;
    for (const id of [...enabled]) {
      const def = FEATURE_MODULES[id];
      if (def.requires?.some((req) => !enabled.has(req))) {
        enabled.delete(id);
        removed = true;
      }
    }
    if (!removed) break;
  }

  const normalized = {} as Record<FeatureModule, boolean>;
  for (const id of FEATURE_MODULES_LIST) {
    normalized[id] = enabled.has(id);
  }
  return normalized;
}

/** Page.slug から feature module を逆引き（一覧ページ SEO gate 用）。 */
export function getFeatureModuleForPageSlug(
  slug: string,
): FeatureModule | null {
  for (const id of FEATURE_MODULES_LIST) {
    if (FEATURE_MODULES[id].pageSlugs.includes(slug)) {
      return id;
    }
  }
  return null;
}
