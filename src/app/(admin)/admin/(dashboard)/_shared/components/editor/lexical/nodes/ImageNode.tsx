/**
 * Image Node
 *
 * @description 画像を表示するDecoratorNode（リサイズ＋アライメント対応）
 */

'use client'

import { type ReactElement, useRef, useState } from 'react'
import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  NodeKey,
} from 'lexical'
import { $create, $getNodeByKey, $getState, $setState, createState, DecoratorNode } from 'lexical'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useLexicalNodeSelection } from '@lexical/react/useLexicalNodeSelection'
import { createEnumGuard } from '../config/type-guards'

// =============================================================================
// Types
// =============================================================================

export const IMAGE_ALIGNMENTS = ['left', 'center', 'right'] as const
export type ImageAlignment = (typeof IMAGE_ALIGNMENTS)[number]

// =============================================================================
// Type Guards
// =============================================================================

const isImageAlignment = createEnumGuard<ImageAlignment>(IMAGE_ALIGNMENTS)

// =============================================================================
// Alignment Utils
// =============================================================================

const ALIGNMENT_CLASSES: Record<ImageAlignment, string> = {
  left: 'justify-start',
  center: 'justify-center',
  right: 'justify-end',
}

// =============================================================================
// State
// =============================================================================

export const srcState = createState('src', {
  parse: (v: unknown): string => typeof v === 'string' ? v : '',
})

export const altState = createState('alt', {
  parse: (v: unknown): string => typeof v === 'string' ? v : '',
})

export const widthState = createState('width', {
  parse: (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined,
})

export const heightState = createState('height', {
  parse: (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined,
})

export const alignmentState = createState('alignment', {
  parse: (v: unknown): ImageAlignment =>
    typeof v === 'string' && isImageAlignment(v) ? v : 'center',
})
export const captionState = createState('caption', {
  parse: (v: unknown): string => typeof v === 'string' ? v : '',
})


// =============================================================================
// Component
// =============================================================================

function ImageComponent({
  src,
  alt,
  width,
  height,
  alignment = 'center',
  caption,
  nodeKey,
}: {
  src: string
  alt: string
  width?: number
  height?: number
  alignment?: ImageAlignment
  caption?: string
  nodeKey: NodeKey
}) {
  const [editor] = useLexicalComposerContext()
  const [isSelected] = useLexicalNodeSelection(nodeKey)
  const [isResizing, setIsResizing] = useState(false)
  const imageRef = useRef<HTMLImageElement>(null)
  const startRef = useRef<{ x: number; width: number }>({ x: 0, width: 0 })

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const img = imageRef.current
    if (!img) return

    setIsResizing(true)
    startRef.current = { x: e.clientX, width: img.offsetWidth }

    const handleResizeMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startRef.current.x
      const newWidth = Math.max(50, startRef.current.width + delta)
      if (img) {
        img.style.width = `${newWidth}px`
      }
    }

    const handleResizeEnd = (upEvent: MouseEvent) => {
      document.removeEventListener('mousemove', handleResizeMove)
      document.removeEventListener('mouseup', handleResizeEnd)
      setIsResizing(false)

      const delta = upEvent.clientX - startRef.current.x
      const newWidth = Math.max(50, startRef.current.width + delta)

      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if (node && node instanceof ImageNode) {
          $setState(node, widthState, Math.round(newWidth))
          $setState(node, heightState, undefined)
        }
      })
    }

    document.addEventListener('mousemove', handleResizeMove)
    document.addEventListener('mouseup', handleResizeEnd)
  }

  const alignClass = ALIGNMENT_CLASSES[alignment]

  return (
    <div
      data-lexical-node-key={nodeKey}
      className={`relative my-6 flex ${alignClass}`}
    >
      <div className="relative inline-block">
        <img
          ref={imageRef}
          src={src}
          alt={alt}
          width={width}
          height={height}
          className={`max-w-full h-auto rounded-lg ${isSelected ? 'ring-2 ring-primary' : ''}`}
          draggable={false}
        />
        {isSelected && (
          <div
            className="absolute right-0 bottom-0 h-3 w-3 cursor-se-resize rounded-tl bg-primary"
            onMouseDown={handleResizeStart}
          />
        )}
        {isResizing && (
          <div className="absolute inset-0 bg-primary/10" />
        )}
      </div>
      {caption && (
        <figcaption className="text-sm text-muted-foreground text-center mt-2">
          {caption}
        </figcaption>
      )}
    </div>
  )
}

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertImageElement(element: HTMLElement): null | DOMConversionOutput {
  if (element instanceof HTMLImageElement) {
    const src = element.getAttribute('src')
    if (src) {
      const alt = element.getAttribute('alt') ?? ''
      const width = element.width || undefined
      const height = element.height || undefined
      const node = $createImageNode({ src, alt, width, height })
      return { node }
    }
  }
  return null
}

// =============================================================================
// Node Class
// =============================================================================

export class ImageNode extends DecoratorNode<ReactElement> {
  override $config() {
    return this.config('image', {
      extends: DecoratorNode,
      stateConfigs: [
        { flat: true, stateConfig: srcState },
        { flat: true, stateConfig: altState },
        { flat: true, stateConfig: widthState },
        { flat: true, stateConfig: heightState },
        { flat: true, stateConfig: alignmentState },
        { flat: true, stateConfig: captionState },
      ],
    })
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      img: () => ({
        conversion: $convertImageElement,
        priority: 0,
      }),
    }
  }

  override exportDOM(): DOMExportOutput {
    const figure = document.createElement('figure')
    figure.setAttribute('data-image', 'true')
    figure.setAttribute('data-image-alignment', $getState(this, alignmentState))

    const img = document.createElement('img')
    img.setAttribute('src', $getState(this, srcState))
    img.setAttribute('alt', $getState(this, altState))
    const width = $getState(this, widthState)
    const height = $getState(this, heightState)
    if (width) img.setAttribute('width', String(width))
    if (height) img.setAttribute('height', String(height))
    figure.appendChild(img)

    const caption = $getState(this, captionState)
    if (caption) {
      const figcaption = document.createElement('figcaption')
      figcaption.setAttribute('data-image-caption', 'true')
      figcaption.textContent = caption
      figure.appendChild(figcaption)
    }

    return { element: figure }
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement('div')
    div.setAttribute('data-image', 'true')
    return div
  }

  override updateDOM(): false {
    return false
  }

  override decorate(): ReactElement {
    return (
      <ImageComponent
        src={$getState(this, srcState)}
        alt={$getState(this, altState)}
        width={$getState(this, widthState)}
        height={$getState(this, heightState)}
        alignment={$getState(this, alignmentState)}
        caption={$getState(this, captionState)}
        nodeKey={this.__key}
      />
    )
  }

}

// =============================================================================
// Factory Functions
// =============================================================================

export function $createImageNode({
  src,
  alt = '',
  width,
  height,
  alignment = 'center',
  caption = '',
}: {
  src: string
  alt?: string
  width?: number
  height?: number
  alignment?: ImageAlignment
  caption?: string
}): ImageNode {
  const node = $create(ImageNode)
  $setState(node, srcState, src)
  $setState(node, altState, alt)
  if (width !== undefined) $setState(node, widthState, width)
  if (height !== undefined) $setState(node, heightState, height)
  $setState(node, alignmentState, alignment)
  $setState(node, captionState, caption)
  return node
}

export function $isImageNode(
  node: LexicalNode | null | undefined
): node is ImageNode {
  return node instanceof ImageNode
}
