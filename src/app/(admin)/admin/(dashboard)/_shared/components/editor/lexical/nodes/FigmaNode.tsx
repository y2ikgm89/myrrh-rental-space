/**
 * Figma Node
 *
 * @description Figma デザインを埋め込む DecoratorNode
 */

'use client'

import type { ReactElement } from 'react'
import type {
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
} from 'lexical'
import { $create, $getState, $setState, createState, DecoratorNode } from 'lexical'
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'

// =============================================================================
// URL 変換
// =============================================================================

export function toFigmaEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (!u.hostname.includes('figma.com')) return null
    const encoded = encodeURIComponent(url)
    return `https://www.figma.com/embed?embed_host=share&url=${encoded}`
  } catch {
    return null
  }
}

// =============================================================================
// State
// =============================================================================

export const figmaEmbedUrlState = createState('embedUrl', {
  parse: (v: unknown): string => (typeof v === 'string' ? v : ''),
})

export const figmaLabelState = createState('label', {
  parse: (v: unknown): string => (typeof v === 'string' ? v : ''),
})

// =============================================================================
// Component
// =============================================================================

function FigmaComponent({
  embedUrl,
  label,
  nodeKey,
}: {
  embedUrl: string
  label: string
  nodeKey: NodeKey
}) {
  const [isSelected, setSelected] = useLexicalNodeSelection(nodeKey)

  return (
    <div
      className={`rounded-lg border border-border overflow-hidden my-2 ${isSelected ? 'ring-2 ring-ring' : ''}`}
      onClick={() => setSelected(true)}
    >
      {label && (
        <p className="text-sm text-muted-foreground px-3 py-1 border-b border-border bg-muted">
          {label}
        </p>
      )}
      <iframe
        src={embedUrl}
        allow="fullscreen"
        loading="lazy"
        title={label || 'Figma デザイン'}
        className="w-full border-none"
        style={{ height: '450px' }}
      />
    </div>
  )
}

// =============================================================================
// Node Class
// =============================================================================

export class FigmaNode extends DecoratorNode<ReactElement> {
  override $config() {
    return this.config('figma', {
      extends: DecoratorNode,
      stateConfigs: [
        { flat: true, stateConfig: figmaEmbedUrlState },
        { flat: true, stateConfig: figmaLabelState },
      ],
    })
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement('div')
    div.setAttribute('data-lexical-figma', 'true')
    return div
  }

  override updateDOM(): false {
    return false
  }

  override exportDOM(): DOMExportOutput {
    const wrapper = document.createElement('div')
    wrapper.setAttribute('data-figma', 'true')
    wrapper.setAttribute('data-figma-label', $getState(this, figmaLabelState))
    const iframe = document.createElement('iframe')
    iframe.setAttribute('src', $getState(this, figmaEmbedUrlState))
    iframe.setAttribute('allow', 'fullscreen')
    iframe.setAttribute('loading', 'lazy')
    iframe.style.width = '100%'
    iframe.style.height = '450px'
    iframe.style.border = 'none'
    wrapper.appendChild(iframe)
    return { element: wrapper }
  }

  override decorate(): ReactElement {
    return (
      <FigmaComponent
        embedUrl={$getState(this, figmaEmbedUrlState)}
        label={$getState(this, figmaLabelState)}
        nodeKey={this.__key}
      />
    )
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * FigmaNode を作成する
 *
 * @param params - Figma 埋め込みのパラメータ
 * @returns FigmaNode インスタンス
 */
export function $createFigmaNode(params: {
  embedUrl: string
  label?: string
}): FigmaNode {
  const node = $create(FigmaNode)
  $setState(node, figmaEmbedUrlState, params.embedUrl)
  $setState(node, figmaLabelState, params.label ?? '')
  return node
}

/**
 * ノードが FigmaNode かどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns FigmaNode の場合 true
 */
export function $isFigmaNode(
  node: LexicalNode | null | undefined,
): node is FigmaNode {
  return node instanceof FigmaNode
}
