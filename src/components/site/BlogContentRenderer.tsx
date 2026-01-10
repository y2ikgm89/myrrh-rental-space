/**
 * BlogContentRenderer
 *
 * ブログ本文のHTMLをレンダリングし、PostListWidgetを動的に置換するServer Component
 */

import DOMPurify from 'isomorphic-dompurify'
import { z } from 'zod'
import { PostListWidgetRenderer } from './PostListWidgetRenderer'

interface BlogContentRendererProps {
  html: string
  /** 現在の記事のカテゴリID（関連記事用） */
  categoryId?: string | null
  /** 現在の記事のID（関連記事から除外用） */
  currentPostId?: string
  className?: string
}

// ウィジェットの正規表現パターン（ReDoS対策: 属性順序を固定、バックトラック削減）
const WIDGET_REGEX = /<div\s+data-post-list-widget(?:\s+[^>]*)?>[\s\S]*?<\/div>/gi

// DOMPurify設定（iframe許可、信頼できるドメインのみ）
const TRUSTED_IFRAME_HOSTS = [
  'www.youtube.com',
  'youtube.com',
  'www.youtube-nocookie.com',
  'player.vimeo.com',
  'challenges.cloudflare.com',
]

// Zodスキーマでウィジェットデータを検証
const widgetDataSchema = z.object({
  type: z.enum(['recent', 'popular', 'related']).default('recent'),
  count: z.number().int().min(1).max(20).default(5),
  categoryId: z.string().uuid().nullable().optional(),
  title: z.string().max(100).nullable().optional(),
})

type WidgetData = z.infer<typeof widgetDataSchema>

/**
 * HTMLからウィジェット情報を抽出（Zodバリデーション付き）
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
    // バリデーション失敗時はデフォルト値を使用
    return { type: 'recent', count: 5, categoryId: null, title: null }
  }

  return parsed.data
}

/**
 * HTMLコンテンツをパーツに分割
 */
function splitContentIntoParts(
  html: string
): Array<{ type: 'html'; content: string } | { type: 'widget'; data: WidgetData }> {
  const parts: Array<{ type: 'html'; content: string } | { type: 'widget'; data: WidgetData }> = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  // グローバルフラグ付き正規表現のlastIndexをリセット
  const regex = new RegExp(WIDGET_REGEX.source, 'gis')

  while ((match = regex.exec(html)) !== null) {
    // ウィジェット前のHTML
    if (match.index > lastIndex) {
      parts.push({
        type: 'html',
        content: html.slice(lastIndex, match.index),
      })
    }

    // ウィジェット
    parts.push({
      type: 'widget',
      data: parseWidgetAttributes(match[0]),
    })

    lastIndex = regex.lastIndex
  }

  // 残りのHTML
  if (lastIndex < html.length) {
    parts.push({
      type: 'html',
      content: html.slice(lastIndex),
    })
  }

  return parts
}

/**
 * DOMPurifyフック: iframeのsrcを検証
 */
function setupDOMPurifyHooks() {
  DOMPurify.addHook('uponSanitizeElement', (node) => {
    // Element型かどうかを確認
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
          // 無効なURLは削除
          element.remove()
        }
      }
    }
  })
}

// フックを初期化
setupDOMPurifyHooks()

const DOMPURIFY_CONFIG = {
  ADD_TAGS: ['iframe'] as string[],
  ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'src', 'width', 'height', 'title'] as string[],
}

export async function BlogContentRenderer({
  html,
  categoryId,
  currentPostId,
  className,
}: BlogContentRendererProps) {
  // コンテンツをパーツに分割
  const parts = splitContentIntoParts(html)

  // パーツが無い場合は空を返す
  if (parts.length === 0) {
    return null
  }

  // ウィジェットが含まれていない場合は従来通りのレンダリング
  const hasWidgets = parts.some((part) => part.type === 'widget')
  if (!hasWidgets) {
    const cleanHtml = DOMPurify.sanitize(html, DOMPURIFY_CONFIG)

    return (
      <div
        className={className}
        dangerouslySetInnerHTML={{ __html: cleanHtml }}
      />
    )
  }

  // ウィジェットを含む場合はパーツごとにレンダリング
  return (
    <div className={className}>
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

        // ウィジェットの場合
        const widgetData = part.data
        // 関連記事の場合、コンテキストのcategoryIdを優先
        const effectiveCategoryId =
          widgetData.type === 'related'
            ? widgetData.categoryId || categoryId
            : widgetData.categoryId

        return (
          <PostListWidgetRenderer
            key={`widget-${index}`}
            type={widgetData.type}
            count={widgetData.count}
            categoryId={effectiveCategoryId}
            title={widgetData.title}
            excludePostId={widgetData.type === 'related' ? currentPostId : undefined}
          />
        )
      })}
    </div>
  )
}
