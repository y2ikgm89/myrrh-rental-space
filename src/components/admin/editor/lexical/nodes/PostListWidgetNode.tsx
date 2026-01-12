/**
 * PostListWidget Node
 *
 * 記事リストウィジェットのカスタムノード
 * DecoratorNodeを使用してReactコンポーネントをレンダリング
 *
 * HTML出力形式:
 * <div data-post-list-widget data-type="recent" data-count="5" data-category-id="xxx">
 *   <!-- プレースホルダーコンテンツ -->
 * </div>
 */

'use client'

import type { ReactElement } from 'react'
import {
  DecoratorNode,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical'
import { Suspense, lazy } from 'react'

// Lazy load the widget component
const PostListWidgetComponent = lazy(() =>
  import('./PostListWidgetComponent').then((m) => ({
    default: m.PostListWidgetComponent,
  }))
)

export type PostListWidgetType = 'recent' | 'popular' | 'category'

export type SerializedPostListWidgetNode = Spread<
  {
    widgetType: PostListWidgetType
    count: number
    categoryId?: string
  },
  SerializedLexicalNode
>

function $convertPostListWidgetElement(
  domNode: HTMLElement
): DOMConversionOutput | null {
  const type = domNode.getAttribute('data-type') as PostListWidgetType
  const count = parseInt(domNode.getAttribute('data-count') || '5', 10)
  const categoryId = domNode.getAttribute('data-category-id') || undefined

  if (type) {
    const node = $createPostListWidgetNode(type, count, categoryId)
    return { node }
  }
  return null
}

export class PostListWidgetNode extends DecoratorNode<ReactElement> {
  __widgetType: PostListWidgetType
  __count: number
  __categoryId?: string

  static getType(): string {
    return 'post-list-widget'
  }

  static clone(node: PostListWidgetNode): PostListWidgetNode {
    return new PostListWidgetNode(
      node.__widgetType,
      node.__count,
      node.__categoryId,
      node.__key
    )
  }

  constructor(
    widgetType: PostListWidgetType = 'recent',
    count: number = 5,
    categoryId?: string,
    key?: NodeKey
  ) {
    super(key)
    this.__widgetType = widgetType
    this.__count = count
    this.__categoryId = categoryId
  }

  static importJSON(
    serializedNode: SerializedPostListWidgetNode
  ): PostListWidgetNode {
    return $createPostListWidgetNode(
      serializedNode.widgetType,
      serializedNode.count,
      serializedNode.categoryId
    )
  }

  exportJSON(): SerializedPostListWidgetNode {
    return {
      type: 'post-list-widget',
      version: 1,
      widgetType: this.__widgetType,
      count: this.__count,
      categoryId: this.__categoryId,
    }
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (domNode: HTMLElement) => {
        if (!domNode.hasAttribute('data-post-list-widget')) {
          return null
        }
        return {
          conversion: $convertPostListWidgetElement,
          priority: 2,
        }
      },
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('div')
    element.setAttribute('data-post-list-widget', '')
    element.setAttribute('data-type', this.__widgetType)
    element.setAttribute('data-count', String(this.__count))
    if (this.__categoryId) {
      element.setAttribute('data-category-id', this.__categoryId)
    }
    // プレースホルダーテキスト（サーバーサイドで置換される）
    element.textContent = `[記事リスト: ${this.__widgetType}, ${this.__count}件]`
    return { element }
  }

  createDOM(): HTMLElement {
    const div = document.createElement('div')
    div.className = 'post-list-widget-wrapper my-4'
    return div
  }

  updateDOM(): false {
    return false
  }

  getWidgetType(): PostListWidgetType {
    return this.__widgetType
  }

  getCount(): number {
    return this.__count
  }

  getCategoryId(): string | undefined {
    return this.__categoryId
  }

  setWidgetType(type: PostListWidgetType): void {
    const writable = this.getWritable()
    writable.__widgetType = type
  }

  setCount(count: number): void {
    const writable = this.getWritable()
    writable.__count = count
  }

  setCategoryId(categoryId: string | undefined): void {
    const writable = this.getWritable()
    writable.__categoryId = categoryId
  }

  decorate(): ReactElement {
    return (
      <Suspense
        fallback={
          <div className="animate-pulse bg-muted rounded-lg h-32 flex items-center justify-center">
            <span className="text-muted-foreground">読み込み中...</span>
          </div>
        }
      >
        <PostListWidgetComponent
          nodeKey={this.__key}
          widgetType={this.__widgetType}
          count={this.__count}
          categoryId={this.__categoryId}
        />
      </Suspense>
    )
  }
}

export function $createPostListWidgetNode(
  widgetType: PostListWidgetType = 'recent',
  count: number = 5,
  categoryId?: string
): PostListWidgetNode {
  return new PostListWidgetNode(widgetType, count, categoryId)
}

export function $isPostListWidgetNode(
  node: LexicalNode | null | undefined
): node is PostListWidgetNode {
  return node instanceof PostListWidgetNode
}
