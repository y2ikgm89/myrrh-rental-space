/**
 * Feature Module Registry — SSoT for site-level feature toggles
 *
 * Sanity / Stripe Capabilities / Shopify shop.features の合成パターン:
 * - registry はメタデータのみ保持（label / requires / publicRoutes / sectionTypes / templates 等）
 * - 実際の ON/OFF 値は `Settings.featureModules` JSON column が SSoT
 * - registry に `defaultEnabled` を持たない（DB explicit declarative）
 * - DB key 欠損時は `isFeatureEnabled` が fail-closed（false）
 * - seed.ts / migration が全 module を explicit に設定する契約
 *
 * 新規 module 追加時の 5 点同時更新:
 * 1. `FEATURE_MODULES_LIST` const tuple に id を追加
 * 2. `FEATURE_MODULES` Record にメタデータを追加
 * 3. `prisma/seed.ts` `seedSettings` の `featureModules` に追加
 * 4. 該当 migration（SQL UPDATE で新 key を埋める）
 * 5. Phase 5 の `/admin/settings/features` UI で表示
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
  /** 404 ガード対象の公開ルート（次フェーズで `requireFeatureEnabled` を配線） */
  readonly publicRoutes: readonly string[];
  /** Page table の slug（管理画面で feature OFF 警告表示用） */
  readonly pageSlugs: readonly string[];
  /** AddSectionDialog から除外する section type */
  readonly sectionTypes: readonly string[];
  /** PAGE_TEMPLATES から除外する template id */
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
    cronPaths: ["/api/cron/event-reminder"],
  },
  posts: {
    id: "posts",
    label: "ブログ",
    description: "/posts のブログ記事一覧・詳細",
    publicRoutes: ["/posts"],
    pageSlugs: ["posts"],
    sectionTypes: ["post-list"],
    templates: ["blog-archive"],
    cronPaths: [],
  },
  news: {
    id: "news",
    label: "お知らせ",
    description: "/news のお知らせ一覧・詳細",
    publicRoutes: ["/news"],
    pageSlugs: ["news"],
    sectionTypes: ["news-list"],
    templates: ["news-archive"],
    cronPaths: [],
  },
  faq: {
    id: "faq",
    label: "FAQ",
    description: "/faq のよくある質問",
    publicRoutes: ["/faq"],
    pageSlugs: ["faq"],
    sectionTypes: ["faq-list"],
    templates: ["faq"],
    cronPaths: ["/api/cron/faq-stale-check"],
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
    description:
      "スペースレビューの投稿・公開（旧 Settings.reviewsEnabledGlobal を吸収）",
    requires: ["spaces"],
    publicRoutes: [],
    pageSlugs: [],
    sectionTypes: [],
    templates: [],
    cronPaths: [],
  },
};

/** 型ガード: 任意文字列が FeatureModule か判定 */
const FEATURE_MODULE_SET = new Set<string>(FEATURE_MODULES_LIST);
export function isFeatureModule(value: string): value is FeatureModule {
  return FEATURE_MODULE_SET.has(value);
}
