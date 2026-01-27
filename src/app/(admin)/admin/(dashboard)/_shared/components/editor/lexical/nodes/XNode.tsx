/**
 * X (Twitter) Node
 *
 * @description X（Twitter）投稿を埋め込むDecoratorNode
 */

'use client'

import type { ReactElement } from 'react'
import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical'
import { $applyNodeReplacement, DecoratorNode } from 'lexical'

// =============================================================================
// Types
// =============================================================================

export type SerializedXNode = Spread<
  {
    tweetId: string
    version: 1
  },
  SerializedLexicalNode
>

// =============================================================================
// Validation
// =============================================================================

/**
 * tweetIdが有効かどうかを検証する
 * Twitter Snowflake IDは15-19桁の数字
 */
function isValidTweetId(tweetId: string): boolean {
  return /^\d{15,19}$/.test(tweetId)
}

// =============================================================================
// Component
// =============================================================================

function XComponent({
  tweetId,
  nodeKey,
}: {
  tweetId: string
  nodeKey: NodeKey
}) {
  return (
    <div
      data-lexical-node-key={nodeKey}
      className="relative my-4 mx-auto max-w-xl"
    >
      <iframe
        src={`https://platform.twitter.com/embed/Tweet.html?id=${tweetId}`}
        title="X (Twitter) post"
        className="w-full min-h-[400px] rounded-lg border-0"
        scrolling="no"
      />
    </div>
  )
}

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertXElement(domNode: Node): null | DOMConversionOutput {
  if (domNode instanceof HTMLIFrameElement) {
    const src = domNode.getAttribute('src')
    if (src) {
      // platform.twitter.com/embed/Tweet.html?id=xxx 形式
      const embedMatch = src.match(/platform\.twitter\.com\/embed\/Tweet\.html\?id=(\d+)/)
      if (embedMatch?.[1]) {
        const node = $createXNode({ tweetId: embedMatch[1] })
        return { node }
      }
    }
  }
  return null
}

// =============================================================================
// Node Class
// =============================================================================

export class XNode extends DecoratorNode<ReactElement> {
  __tweetId: string

  static getType(): string {
    return 'x'
  }

  static clone(node: XNode): XNode {
    return new XNode(node.__tweetId, node.__key)
  }

  static importJSON(serializedNode: SerializedXNode): XNode {
    return $createXNode({ tweetId: serializedNode.tweetId })
  }

  static importDOM(): DOMConversionMap | null {
    return {
      iframe: () => ({
        conversion: $convertXElement,
        priority: 1, // YouTubeNode (priority: 0) より高い優先度
      }),
    }
  }

  constructor(tweetId: string, key?: NodeKey) {
    super(key)
    // セキュリティ: tweetIdは数字のみ許可（XSS防止）
    if (!isValidTweetId(tweetId)) {
      throw new Error(`Invalid tweetId: ${tweetId}. Must be 15-19 digits.`)
    }
    this.__tweetId = tweetId
  }

  exportJSON(): SerializedXNode {
    return {
      ...super.exportJSON(),
      type: 'x',
      tweetId: this.__tweetId,
      version: 1,
    }
  }

  exportDOM(): DOMExportOutput {
    const div = document.createElement('div')
    div.className = 'my-4 mx-auto max-w-xl'

    const iframe = document.createElement('iframe')
    iframe.setAttribute('src', `https://platform.twitter.com/embed/Tweet.html?id=${this.__tweetId}`)
    iframe.setAttribute('title', 'X (Twitter) post')
    iframe.setAttribute('scrolling', 'no')
    iframe.className = 'w-full min-h-[400px] rounded-lg border-0'

    div.appendChild(iframe)
    return { element: div }
  }

  createDOM(config: EditorConfig): HTMLElement {
    const div = document.createElement('div')
    const theme = config.theme
    const className = theme.x
    if (className) {
      div.className = className
    }
    return div
  }

  updateDOM(): false {
    return false
  }

  decorate(): ReactElement {
    return <XComponent tweetId={this.__tweetId} nodeKey={this.__key} />
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * XNodeを作成する
 *
 * @param params - Xのパラメータ
 * @returns XNode インスタンス
 */
export function $createXNode({
  tweetId,
}: {
  tweetId: string
}): XNode {
  return $applyNodeReplacement(new XNode(tweetId))
}

/**
 * ノードがXNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns XNodeの場合true
 */
export function $isXNode(
  node: LexicalNode | null | undefined
): node is XNode {
  return node instanceof XNode
}
