/**
 * ブログサイドバー設定のバリデーションスキーマ
 */

import { z } from 'zod'

/**
 * サイドバーウィジェット設定
 */
export const sidebarWidgetsSchema = z.object({
  search: z.boolean().default(true), // 検索ウィジェット
  recent: z.boolean().default(true), // 新着記事ウィジェット
  popular: z.boolean().default(true), // 人気記事ウィジェット
  categories: z.boolean().default(true), // カテゴリー一覧ウィジェット
  tags: z.boolean().default(true), // タグクラウドウィジェット
})

export type SidebarWidgets = z.infer<typeof sidebarWidgetsSchema>

/**
 * サイドバー設定（Settings.sidebarWidgets のJSON構造）
 */
export const sidebarSettingsSchema = z.object({
  sidebarEnabled: z.boolean(), // サイドバー全体の有効/無効
  sidebarWidgets: sidebarWidgetsSchema, // ウィジェット個別設定
  sidebarRecentCount: z.number().int().min(1).max(20), // 新着記事の表示件数
  sidebarPopularCount: z.number().int().min(1).max(20), // 人気記事の表示件数
})

export type SidebarSettings = z.infer<typeof sidebarSettingsSchema>
