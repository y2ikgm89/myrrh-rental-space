/**
 * ContentRenderer
 *
 * 汎用HTMLコンテンツレンダラー（Server Component）
 * PostListWidgetの動的置換とDOMPurifyによるサニタイズを提供
 */

import DOMPurify from 'isomorphic-dompurify'
import { z } from 'zod'
import { cn } from '@/lib/utils'
import { PostListWidgetRenderer } from './PostListWidgetRenderer'

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

// 信頼できるiframeホスト
const TRUSTED_IFRAME_HOSTS = [
  'www.youtube.com',
  'youtube.com',
  'www.youtube-nocookie.com',
  'player.vimeo.com',
  'challenges.cloudflare.com',
]

// Prose スタイルクラス
const PROSE_CLASSES = cn(
  'prose prose-sm sm:prose-base lg:prose-lg max-w-none',
  'prose-headings:font-bold prose-headings:tracking-tight',
  'prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl',
  'prose-p:leading-relaxed prose-p:text-muted-foreground',
  'prose-a:text-primary prose-a:underline prose-a:underline-offset-4',
  'prose-blockquote:border-l-4 prose-blockquote:border-muted-foreground/30',
  'prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-muted-foreground',
  'prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5',
  'prose-code:before:content-none prose-code:after:content-none',
  'prose-pre:bg-muted prose-pre:rounded-lg prose-pre:p-4',
  'prose-img:rounded-lg prose-img:shadow-md',
  'prose-hr:border-border',
  'prose-strong:font-semibold',
  'prose-ul:list-disc prose-ol:list-decimal',
  'prose-li:text-muted-foreground',
  'prose-table:border-collapse prose-table:w-full',
  'prose-th:border prose-th:p-2 prose-th:bg-muted prose-th:font-bold prose-th:text-left',
  'prose-td:border prose-td:p-2'
)

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
// DOMPurify Configuration
// =============================================================================

// DOMPurifyフック: iframeのsrcを検証
function setupDOMPurifyHooks() {
  // 既存のフックをクリア
  DOMPurify.removeAllHooks()

  DOMPurify.addHook('uponSanitizeElement', (node) => {
    if (node.nodeType !== 1) return
    const element = node as Element
    if (element.tagName === 'IFRAME') {
      const src = element.getAttribute('src')
      if (src) {
        try {
          const url = new URL(src)
          if (!TRUSTED_IFRAME_HOSTS.includes(url.host)) {
            element.remove()
          }
        } catch {
          element.remove()
        }
      }
    }
  })
}

setupDOMPurifyHooks()

const DOMPURIFY_CONFIG = {
  ADD_TAGS: ['iframe'] as string[],
  ADD_ATTR: [
    'allow',
    'allowfullscreen',
    'frameborder',
    'scrolling',
    'src',
    'width',
    'height',
    'title',
    'loading',
    'target',
    'rel',
  ] as string[],
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
    const cleanHtml = DOMPurify.sanitize(html, DOMPURIFY_CONFIG)

    return (
      <div
        className={cn(PROSE_CLASSES, className)}
        dangerouslySetInnerHTML={{ __html: cleanHtml }}
      />
    )
  }

  // ウィジェットを含む場合はパーツごとにレンダリング
  return (
    <div className={cn(PROSE_CLASSES, className)}>
      {parts.map((part, index) => {
        if (part.type === 'html') {
          const cleanHtml = DOMPurify.sanitize(part.content, DOMPURIFY_CONFIG)

          return (
            <div
              key={`html-${index}`}
              dangerouslySetInnerHTML={{ __html: cleanHtml }}
            />
          )
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
