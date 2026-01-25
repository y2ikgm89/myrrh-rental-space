/**
 * Instagram Node
 *
 * @description Instagram投稿を埋め込むDecoratorNode
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

export type SerializedInstagramNode = Spread<
  {
    postId: string
    version: 1
  },
  SerializedLexicalNode
>

// =============================================================================
// Validation
// =============================================================================

/**
 * postIdが有効かどうかを検証する
 * Instagram shortcodeは英数字とアンダースコア、ハイフンで構成される（通常11文字程度）
 */
function isValidPostId(postId: string): boolean {
  return /^[a-zA-Z0-9_-]{1,50}$/.test(postId)
}

// =============================================================================
// Component
// =============================================================================

function InstagramComponent({
  postId,
  nodeKey,
}: {
  postId: string
  nodeKey: NodeKey
}) {
  return (
    <div
      data-lexical-node-key={nodeKey}
      className="relative my-4 mx-auto max-w-[540px]"
    >
      <iframe
        src={`https://www.instagram.com/p/${postId}/embed`}
        title="Instagram post"
        className="w-full min-h-[500px] rounded-lg border-0"
        scrolling="no"
        allowTransparency
      />
    </div>
  )
}

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertInstagramElement(domNode: Node): null | DOMConversionOutput {
  if (domNode instanceof HTMLDivElement) {
    const postId = domNode.getAttribute('data-instagram-post-id')
    if (postId && isValidPostId(postId)) {
      const node = $createInstagramNode({ postId })
      return { node }
    }
  }

  if (domNode instanceof HTMLIFrameElement) {
    const src = domNode.getAttribute('src')
    if (src) {
      // instagram.com/p/xxx/embed 形式
      const embedMatch = src.match(/instagram\.com\/p\/([a-zA-Z0-9_-]+)\/embed/)
      if (embedMatch?.[1] && isValidPostId(embedMatch[1])) {
        const node = $createInstagramNode({ postId: embedMatch[1] })
        return { node }
      }
    }
  }
  return null
}

// =============================================================================
// Node Class
// =============================================================================

export class InstagramNode extends DecoratorNode<ReactElement> {
  __postId: string

  static getType(): string {
    return 'instagram'
  }

  static clone(node: InstagramNode): InstagramNode {
    return new InstagramNode(node.__postId, node.__key)
  }

  static importJSON(serializedNode: SerializedInstagramNode): InstagramNode {
    return $createInstagramNode({
      postId: serializedNode.postId,
    })
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (domNode: HTMLElement) => {
        if (domNode.hasAttribute('data-instagram-post-id')) {
          return {
            conversion: $convertInstagramElement,
            priority: 2,
          }
        }
        return null
      },
      iframe: () => ({
        conversion: $convertInstagramElement,
        priority: 2, // YouTubeNode (priority: 0), XNode (priority: 1) より高い優先度
      }),
    }
  }

  constructor(postId: string, key?: NodeKey) {
    super(key)
    // セキュリティ: postIdは英数字とアンダースコア、ハイフンのみ許可（XSS防止）
    if (!isValidPostId(postId)) {
      throw new Error(
        `Invalid postId: ${postId}. Must contain only alphanumeric characters, underscores, and hyphens.`
      )
    }
    this.__postId = postId
  }

  exportJSON(): SerializedInstagramNode {
    return {
      ...super.exportJSON(),
      type: 'instagram',
      postId: this.__postId,
      version: 1,
    }
  }

  exportDOM(): DOMExportOutput {
    const div = document.createElement('div')
    div.className = 'my-4 mx-auto max-w-[540px]'
    div.setAttribute('data-instagram-post-id', this.__postId)

    const iframe = document.createElement('iframe')
    iframe.setAttribute('src', `https://www.instagram.com/p/${this.__postId}/embed`)
    iframe.setAttribute('title', 'Instagram post')
    iframe.setAttribute('scrolling', 'no')
    iframe.className = 'w-full min-h-[500px] rounded-lg border-0'

    div.appendChild(iframe)
    return { element: div }
  }

  createDOM(config: EditorConfig): HTMLElement {
    const div = document.createElement('div')
    const theme = config.theme
    const className = theme.instagram
    if (className) {
      div.className = className
    }
    return div
  }

  updateDOM(): false {
    return false
  }

  decorate(): ReactElement {
    return <InstagramComponent postId={this.__postId} nodeKey={this.__key} />
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * InstagramNodeを作成する
 *
 * @param params - Instagramのパラメータ
 * @returns InstagramNode インスタンス
 */
export function $createInstagramNode({
  postId,
}: {
  postId: string
}): InstagramNode {
  return $applyNodeReplacement(new InstagramNode(postId))
}

/**
 * ノードがInstagramNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns InstagramNodeの場合true
 */
export function $isInstagramNode(
  node: LexicalNode | null | undefined
): node is InstagramNode {
  return node instanceof InstagramNode
}
