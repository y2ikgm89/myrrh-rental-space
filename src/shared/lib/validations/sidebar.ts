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

// ---------------------------------------------------------------------------
// Widget schemas
// ---------------------------------------------------------------------------

const builtinWidgetSchema = z.object({
  type: z.enum(BUILTIN_WIDGET_TYPES),
  enabled: z.boolean(),
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

export type BuiltinWidget = z.infer<typeof builtinWidgetSchema>;
export type CustomWidget = z.infer<typeof customWidgetSchema>;
export type SidebarWidget = BuiltinWidget | CustomWidget;

export const sidebarWidgetsSchema = z.array(
  z.union([builtinWidgetSchema, customWidgetSchema]),
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
});

export type SidebarSettings = z.infer<typeof sidebarSettingsSchema>;

// ---------------------------------------------------------------------------
// Defaults & migration helper
// ---------------------------------------------------------------------------

export const DEFAULT_SIDEBAR_WIDGETS: SidebarWidget[] = [
  { type: "search", enabled: true },
  { type: "recent", enabled: true },
  { type: "popular", enabled: true },
  { type: "categories", enabled: true },
  { type: "tags", enabled: true },
];

/**
 * Parse sidebar widgets from DB JSON.
 * Handles: valid array, legacy object format, null/undefined, invalid data.
 * Always returns a valid SidebarWidget[].
 */
export function parseSidebarWidgets(value: unknown): SidebarWidget[] {
  const arrayResult = sidebarWidgetsSchema.safeParse(value);
  if (arrayResult.success) return arrayResult.data;
  return DEFAULT_SIDEBAR_WIDGETS;
}
