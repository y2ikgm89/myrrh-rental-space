import { z } from "zod";

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

// 人気記事 widget — layout + ランキング表示設定
const popularWidgetSchema = z.object({
  type: z.literal("popular"),
  enabled: z.boolean(),
  layout: z.enum(POST_LIST_LAYOUTS).default("compact"),
  showRanking: z.boolean().default(true),
});

const customWidgetSchema = z.object({
  type: z.literal("custom"),
  enabled: z.boolean(),
  id: z.string().min(1),
  title: z.string().min(1, { error: "タイトルは必須です" }).max(100),
  description: z.string().max(500).optional(),
  linkUrl: z.string().max(500).optional(),
  linkLabel: z.string().max(100).optional(),
});

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

/**
 * Parse sidebar widgets from DB JSON.
 * Handles: valid array, null/undefined, invalid data.
 * Always returns a valid SidebarWidget[].
 */
export function parseSidebarWidgets(value: unknown): SidebarWidget[] {
  const arrayResult = sidebarWidgetsSchema.safeParse(value);
  if (arrayResult.success) return arrayResult.data;
  return DEFAULT_SIDEBAR_WIDGETS;
}
