/**
 * ContentRenderer
 *
 * 汎用HTMLコンテンツレンダラー（Server Component）
 * PostListWidgetの動的置換とDOMPurifyによるサニタイズを提供
 */

import { z } from 'zod'
import { cn } from '@/lib/utils'
import { PROSE_CLASSES } from '@/lib/styles/prose'
import { PostListWidgetRenderer } from './PostListWidgetRenderer'
import { SanitizedHtml } from './SanitizedHtml'

// =============================================================================
// Types
// =============================================================================

type ContentRendererProps = {
  /** HTMLコンテンツ */
  html: string
  /** 追加のCSSクラス */
  className?: string
  /** PostListWidgetのコンテキスト（オプション） */
  widgetContext?: {
    /** 現在のカテゴリID（関連記事用） */
    categoryId?: string | null
    /** 除外する記事ID */
    excludePostId?: string
  }
}

// =============================================================================
// Constants
// =============================================================================

// ウィジェットの正規表現パターン
const WIDGET_REGEX = /<div\s+data-post-list-widget(?:\s+[^>]*)?>[\s\S]*?<\/div>/gi

// =============================================================================
// Validation Schemas
// =============================================================================

// PostListWidgetRendererでサポートされている型
type SupportedWidgetType = 'recent' | 'popular' | 'related'

const widgetDataSchema = z.object({
  // category は related にマッピングされる
  type: z.enum(['recent', 'popular', 'related', 'category']).default('recent'),
  count: z.number().int().min(1).max(20).default(5),
  categoryId: z.string().uuid().nullable().optional(),
  title: z.string().max(100).nullable().optional(),
})

type WidgetData = z.infer<typeof widgetDataSchema>

/**
 * ウィジェットタイプをサポートされる型にマッピング
 */
function mapWidgetType(type: WidgetData['type']): SupportedWidgetType {
  // category は categoryId付きの related として扱う
  if (type === 'category') {
    return 'related'
  }
  return type
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * HTMLからウィジェット属性を抽出
 */
function parseWidgetAttributes(match: string): WidgetData {
  const typeMatch = match.match(/data-type="([^"]*)"/)
  const countMatch = match.match(/data-count="([^"]*)"/)
  const categoryIdMatch = match.match(/data-category-id="([^"]*)"/)
  const titleMatch = match.match(/data-title="([^"]*)"/)

  const rawCount = parseInt(countMatch?.[1] || '5', 10)

  const parsed = widgetDataSchema.safeParse({
    type: typeMatch?.[1] || 'recent',
    count: Number.isNaN(rawCount) ? 5 : rawCount,
    categoryId: categoryIdMatch?.[1] || null,
    title: titleMatch?.[1] || null,
  })

  if (!parsed.success) {
    return { type: 'recent', count: 5, categoryId: null, title: null }
  }

  return parsed.data
}

type ContentPart =
  | { type: 'html'; content: string }
  | { type: 'widget'; data: WidgetData }

/**
 * HTMLコンテンツをパーツに分割
 */
function splitContentIntoParts(html: string): ContentPart[] {
  const parts: ContentPart[] = []
  let lastIndex = 0

  const regex = new RegExp(WIDGET_REGEX.source, 'gis')
  let match: RegExpExecArray | null

  while ((match = regex.exec(html)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'html',
        content: html.slice(lastIndex, match.index),
      })
    }

    parts.push({
      type: 'widget',
      data: parseWidgetAttributes(match[0]),
    })

    lastIndex = regex.lastIndex
  }

  if (lastIndex < html.length) {
    parts.push({
      type: 'html',
      content: html.slice(lastIndex),
    })
  }

  return parts
}

// =============================================================================
// Main Component
// =============================================================================

export async function ContentRenderer({
  html,
  className,
  widgetContext,
}: ContentRendererProps) {
  if (!html) {
    return null
  }

  const parts = splitContentIntoParts(html)

  if (parts.length === 0) {
    return null
  }

  // ウィジェットが含まれていない場合
  const hasWidgets = parts.some((part) => part.type === 'widget')
  if (!hasWidgets) {
    return <SanitizedHtml html={html} className={cn(PROSE_CLASSES, className)} />
  }

  // ウィジェットを含む場合はパーツごとにレンダリング
  return (
    <div className={cn(PROSE_CLASSES, className)}>
      {parts.map((part, index) => {
        if (part.type === 'html') {
          return <SanitizedHtml key={`html-${index}`} html={part.content} />
        }

        // ウィジェット
        const widgetData = part.data
        const mappedType = mapWidgetType(widgetData.type)
        const effectiveCategoryId =
          mappedType === 'related'
            ? widgetData.categoryId || widgetContext?.categoryId
            : widgetData.categoryId

        return (
          <PostListWidgetRenderer
            key={`widget-${index}`}
            type={mappedType}
            count={widgetData.count}
            categoryId={effectiveCategoryId}
            title={widgetData.title}
            excludePostId={
              mappedType === 'related'
                ? widgetContext?.excludePostId
                : undefined
            }
          />
        )
      })}
    </div>
  )
}
