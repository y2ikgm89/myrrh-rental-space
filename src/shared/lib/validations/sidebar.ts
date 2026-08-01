import { z } from "zod";
import { optionalSafePublicHrefSchema } from "@/shared/lib/url/safe-href";

// ---------------------------------------------------------------------------
// Widget types
// ---------------------------------------------------------------------------

export const BUILTIN_WIDGET_TYPES = [
  "search",
  "recent",
  "popular",
  "categories",
  "tags",
] as const;

export type BuiltinWidgetType = (typeof BUILTIN_WIDGET_TYPES)[number];

export const POST_LIST_LAYOUTS = ["compact", "stacked"] as const;
export type PostListLayout = (typeof POST_LIST_LAYOUTS)[number];

// ---------------------------------------------------------------------------
// Widget schemas（discriminated union）
// ---------------------------------------------------------------------------

// layout / ranking 設定を持たないビルトイン widget
const simpleBuiltinWidgetSchema = z.object({
  type: z.enum(["search", "categories", "tags"] as const),
  enabled: z.boolean(),
});

// 新着記事 widget — layout 設定のみ
const recentWidgetSchema = z.object({
  type: z.literal("recent"),
  enabled: z.boolean(),
  layout: z.enum(POST_LIST_LAYOUTS).default("compact"),
});

// 人気記事 widget（type key `popular` は互換維持）— layout + ランキング表示設定。
// 並び順は viewCount 降順 → 公開日降順（queries.ts）。
const popularWidgetSchema = z.object({
  type: z.literal("popular"),
  enabled: z.boolean(),
  layout: z.enum(POST_LIST_LAYOUTS).default("compact"),
  showRanking: z.boolean().default(true),
});

export const customWidgetSchema = z.object({
  type: z.literal("custom"),
  enabled: z.boolean(),
  id: z.string().min(1),
  title: z.string().min(1, { error: "タイトルは必須です" }).max(100),
  description: z.string().max(500).optional(),
  linkUrl: optionalSafePublicHrefSchema,
  linkLabel: z.string().max(100).optional(),
});

/**
 * カスタムウィジェットの編集フォームが扱う項目。
 *
 * `type` / `enabled` / `id` は widget の identity 側の関心で、フォームには出ない。
 * 検証規則を書き写さずに `pick` するのは、両者が食い違うと「保存はできるが
 * 一覧で弾かれる」ような噛み合わなさが生まれるため。
 */
export const customWidgetFormSchema = customWidgetSchema.pick({
  title: true,
  description: true,
  linkUrl: true,
  linkLabel: true,
});

export type CustomWidgetFormValues = z.output<typeof customWidgetFormSchema>;

export type SimpleBuiltinWidget = z.infer<typeof simpleBuiltinWidgetSchema>;
export type RecentWidget = z.infer<typeof recentWidgetSchema>;
export type PopularWidget = z.infer<typeof popularWidgetSchema>;
export type CustomWidget = z.infer<typeof customWidgetSchema>;
export type SidebarWidget =
  SimpleBuiltinWidget | RecentWidget | PopularWidget | CustomWidget;

// 各 widget の identity（builtin: type / custom: id）は React key の stable ID として
// 機能するため、重複を禁止する。BlogSidebar / SidebarSection の getWidgetKey と一致。
export const sidebarWidgetsSchema = z
  .array(
    z.union([
      simpleBuiltinWidgetSchema,
      recentWidgetSchema,
      popularWidgetSchema,
      customWidgetSchema,
    ]),
  )
  .refine(
    (widgets) => {
      const keys = widgets.map((w) =>
        w.type === "custom" ? `custom:${w.id}` : `builtin:${w.type}`,
      );
      return new Set(keys).size === keys.length;
    },
    { error: "同じウィジェットを複数登録することはできません" },
  );

export type SidebarWidgets = z.infer<typeof sidebarWidgetsSchema>;

// ---------------------------------------------------------------------------
// Settings schema
// ---------------------------------------------------------------------------

export const sidebarSettingsSchema = z.object({
  sidebarEnabled: z.boolean(),
  sidebarWidgets: sidebarWidgetsSchema,
  sidebarRecentCount: z.number().int().min(1).max(20),
  sidebarPopularCount: z.number().int().min(1).max(20),
  /** 公開記事詳細ページに目次サイドバーを表示するグローバルトグル（h2 数 >= 2 の記事のみ有効） */
  sidebarTocEnabled: z.boolean(),
  expectedUpdatedAt: z.iso
    .datetime({
      error: "更新バージョンが不正です。ページを再読み込みしてください",
    })
    .or(z.date()),
});

export type SidebarSettings = z.infer<typeof sidebarSettingsSchema>;

// ---------------------------------------------------------------------------
// Defaults & migration helper
// ---------------------------------------------------------------------------

export const DEFAULT_SIDEBAR_WIDGETS: SidebarWidget[] = [
  { type: "search", enabled: true },
  { type: "recent", enabled: true, layout: "compact" },
  { type: "popular", enabled: true, layout: "compact", showRanking: true },
  { type: "categories", enabled: true },
  { type: "tags", enabled: true },
];

export type TryParseSidebarWidgetsResult =
  { success: true; data: SidebarWidget[] } | { success: false };

/**
 * Strict parse for admin paths — no silent fallback.
 */
export function tryParseSidebarWidgets(
  value: unknown,
): TryParseSidebarWidgetsResult {
  const result = sidebarWidgetsSchema.safeParse(value);
  if (result.success) return { success: true, data: result.data };
  return { success: false };
}

/**
 * Parse sidebar widgets from DB JSON.
 * Handles: valid array, null/undefined, invalid data.
 * Always returns a valid SidebarWidget[].
 */
export function parseSidebarWidgets(value: unknown): SidebarWidget[] {
  const result = tryParseSidebarWidgets(value);
  if (result.success) return result.data;
  return DEFAULT_SIDEBAR_WIDGETS;
}
