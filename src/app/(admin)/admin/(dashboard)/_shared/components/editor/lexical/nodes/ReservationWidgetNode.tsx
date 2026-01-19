/**
 * ReservationWidget Node
 *
 * 予約ウィジェットのカスタムノード
 * DecoratorNodeを使用してReactコンポーネントをレンダリング
 *
 * HTML出力形式:
 * <div data-reservation-widget data-space-id="xxx" data-show-calendar="true">
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
const ReservationWidgetComponent = lazy(() =>
  import('./ReservationWidgetComponent').then((m) => ({
    default: m.ReservationWidgetComponent,
  }))
)

export type SerializedReservationWidgetNode = Spread<
  {
    spaceId?: string
    showCalendar: boolean
    showPricing: boolean
    title?: string
  },
  SerializedLexicalNode
>

function $convertReservationWidgetElement(
  domNode: HTMLElement
): DOMConversionOutput | null {
  const spaceId = domNode.getAttribute('data-space-id') || undefined
  const showCalendar = domNode.getAttribute('data-show-calendar') !== 'false'
  const showPricing = domNode.getAttribute('data-show-pricing') !== 'false'
  const title = domNode.getAttribute('data-title') || undefined

  const node = $createReservationWidgetNode({
    spaceId,
    showCalendar,
    showPricing,
    title,
  })
  return { node }
}

export type ReservationWidgetOptions = {
  spaceId?: string
  showCalendar?: boolean
  showPricing?: boolean
  title?: string
}

export class ReservationWidgetNode extends DecoratorNode<ReactElement> {
  __spaceId?: string
  __showCalendar: boolean
  __showPricing: boolean
  __title?: string

  static getType(): string {
    return 'reservation-widget'
  }

  static clone(node: ReservationWidgetNode): ReservationWidgetNode {
    return new ReservationWidgetNode(
      {
        spaceId: node.__spaceId,
        showCalendar: node.__showCalendar,
        showPricing: node.__showPricing,
        title: node.__title,
      },
      node.__key
    )
  }

  constructor(options: ReservationWidgetOptions = {}, key?: NodeKey) {
    super(key)
    this.__spaceId = options.spaceId
    this.__showCalendar = options.showCalendar ?? true
    this.__showPricing = options.showPricing ?? true
    this.__title = options.title
  }

  static importJSON(
    serializedNode: SerializedReservationWidgetNode
  ): ReservationWidgetNode {
    return $createReservationWidgetNode({
      spaceId: serializedNode.spaceId,
      showCalendar: serializedNode.showCalendar,
      showPricing: serializedNode.showPricing,
      title: serializedNode.title,
    })
  }

  exportJSON(): SerializedReservationWidgetNode {
    return {
      type: 'reservation-widget',
      version: 1,
      spaceId: this.__spaceId,
      showCalendar: this.__showCalendar,
      showPricing: this.__showPricing,
      title: this.__title,
    }
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (domNode: HTMLElement) => {
        if (!domNode.hasAttribute('data-reservation-widget')) {
          return null
        }
        return {
          conversion: $convertReservationWidgetElement,
          priority: 2,
        }
      },
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('div')
    element.setAttribute('data-reservation-widget', '')
    if (this.__spaceId) {
      element.setAttribute('data-space-id', this.__spaceId)
    }
    element.setAttribute('data-show-calendar', String(this.__showCalendar))
    element.setAttribute('data-show-pricing', String(this.__showPricing))
    if (this.__title) {
      element.setAttribute('data-title', this.__title)
    }
    // プレースホルダーテキスト（サーバーサイドで置換される）
    element.textContent = `[予約ウィジェット${this.__spaceId ? `: ${this.__spaceId}` : ''}]`
    return { element }
  }

  createDOM(): HTMLElement {
    const div = document.createElement('div')
    div.className = 'reservation-widget-wrapper my-4'
    return div
  }

  updateDOM(): false {
    return false
  }

  getSpaceId(): string | undefined {
    return this.__spaceId
  }

  getShowCalendar(): boolean {
    return this.__showCalendar
  }

  getShowPricing(): boolean {
    return this.__showPricing
  }

  getTitle(): string | undefined {
    return this.__title
  }

  setSpaceId(spaceId: string | undefined): void {
    const writable = this.getWritable()
    writable.__spaceId = spaceId
  }

  setShowCalendar(showCalendar: boolean): void {
    const writable = this.getWritable()
    writable.__showCalendar = showCalendar
  }

  setShowPricing(showPricing: boolean): void {
    const writable = this.getWritable()
    writable.__showPricing = showPricing
  }

  setTitle(title: string | undefined): void {
    const writable = this.getWritable()
    writable.__title = title
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
        <ReservationWidgetComponent
          nodeKey={this.__key}
          spaceId={this.__spaceId}
          showCalendar={this.__showCalendar}
          showPricing={this.__showPricing}
          title={this.__title}
        />
      </Suspense>
    )
  }
}

export function $createReservationWidgetNode(
  options: ReservationWidgetOptions = {}
): ReservationWidgetNode {
  return new ReservationWidgetNode(options)
}

export function $isReservationWidgetNode(
  node: LexicalNode | null | undefined
): node is ReservationWidgetNode {
  return node instanceof ReservationWidgetNode
}
