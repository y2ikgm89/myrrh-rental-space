/**
 * Button Node
 *
 * @description ボタン/CTAを表示するDecoratorNode
 * variant: primary/secondary/outline
 * size: sm/md/lg
 * alignment: left/center/right
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
} from 'lexical'
import { $applyNodeReplacement, DecoratorNode } from 'lexical'

// =============================================================================
// Types
// =============================================================================

export type ButtonVariant = 'primary' | 'secondary' | 'outline'
export type ButtonSize = 'sm' | 'md' | 'lg'
export type ButtonAlignment = 'left' | 'center' | 'right'

export const BUTTON_VARIANTS: readonly ButtonVariant[] = ['primary', 'secondary', 'outline'] as const
export const BUTTON_SIZES: readonly ButtonSize[] = ['sm', 'md', 'lg'] as const
export const BUTTON_ALIGNMENTS: readonly ButtonAlignment[] = ['left', 'center', 'right'] as const

export interface SerializedButtonNode extends SerializedLexicalNode {
  text: string
  href: string
  variant: ButtonVariant
  size: ButtonSize
  alignment: ButtonAlignment
  openInNewTab: boolean
}

// =============================================================================
// Type Guards (Set-based pattern for type safety)
// =============================================================================

const BUTTON_VARIANT_SET = new Set<string>(BUTTON_VARIANTS)
const BUTTON_SIZE_SET = new Set<string>(BUTTON_SIZES)
const BUTTON_ALIGNMENT_SET = new Set<string>(BUTTON_ALIGNMENTS)

export function isButtonVariant(value: string): value is ButtonVariant {
  return BUTTON_VARIANT_SET.has(value)
}

export function isButtonSize(value: string): value is ButtonSize {
  return BUTTON_SIZE_SET.has(value)
}

export function isButtonAlignment(value: string): value is ButtonAlignment {
  return BUTTON_ALIGNMENT_SET.has(value)
}

// =============================================================================
// Constants
// =============================================================================

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
}

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
}

const ALIGNMENT_STYLES: Record<ButtonAlignment, string> = {
  left: 'justify-start',
  center: 'justify-center',
  right: 'justify-end',
}

const BUTTON_BASE_CLASS = 'inline-flex items-center font-medium rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

// =============================================================================
// Component
// =============================================================================

function ButtonComponent({
  text,
  href,
  variant,
  size,
  alignment,
  openInNewTab,
  nodeKey,
}: {
  text: string
  href: string
  variant: ButtonVariant
  size: ButtonSize
  alignment: ButtonAlignment
  openInNewTab: boolean
  nodeKey: NodeKey
}) {
  return (
    <div
      data-lexical-node-key={nodeKey}
      data-button-alignment={alignment}
      className={`my-4 flex ${ALIGNMENT_STYLES[alignment]}`}
    >
      <a
        href={href}
        target={openInNewTab ? '_blank' : undefined}
        rel={openInNewTab ? 'noopener noreferrer' : undefined}
        className={`${BUTTON_BASE_CLASS} ${VARIANT_STYLES[variant]} ${SIZE_STYLES[size]}`}
        draggable={false}
        onClick={(e) => e.preventDefault()} // エディタ内ではナビゲーション無効
      >
        {text}
      </a>
    </div>
  )
}

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertButtonElement(domNode: Node): null | DOMConversionOutput {
  const element = domNode as HTMLElement
  const link = element.querySelector('a')
  if (!link) return null

  const text = link.textContent ?? 'ボタン'
  const href = link.getAttribute('href') ?? '#'
  const variantAttr = element.getAttribute('data-button-variant')
  const sizeAttr = element.getAttribute('data-button-size')
  const alignmentAttr = element.getAttribute('data-button-alignment')
  const openInNewTab = link.getAttribute('target') === '_blank'

  const variant = variantAttr && isButtonVariant(variantAttr) ? variantAttr : 'primary'
  const size = sizeAttr && isButtonSize(sizeAttr) ? sizeAttr : 'md'
  const alignment = alignmentAttr && isButtonAlignment(alignmentAttr) ? alignmentAttr : 'center'

  const node = $createButtonNode({ text, href, variant, size, alignment, openInNewTab })
  return { node }
}

// =============================================================================
// Node Class
// =============================================================================

export class ButtonNode extends DecoratorNode<ReactElement> {
  __text: string
  __href: string
  __variant: ButtonVariant
  __size: ButtonSize
  __alignment: ButtonAlignment
  __openInNewTab: boolean

  static getType(): string {
    return 'button'
  }

  static clone(node: ButtonNode): ButtonNode {
    return new ButtonNode(
      node.__text,
      node.__href,
      node.__variant,
      node.__size,
      node.__alignment,
      node.__openInNewTab,
      node.__key
    )
  }

  static importJSON(serializedNode: SerializedButtonNode): ButtonNode {
    return $createButtonNode({
      text: serializedNode.text,
      href: serializedNode.href,
      variant: serializedNode.variant,
      size: serializedNode.size,
      alignment: serializedNode.alignment,
      openInNewTab: serializedNode.openInNewTab,
    }).updateFromJSON(serializedNode)
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (domNode: Node) => {
        const element = domNode as HTMLElement
        if (element.hasAttribute('data-button-alignment')) {
          return {
            conversion: $convertButtonElement,
            priority: 1,
          }
        }
        return null
      },
    }
  }

  constructor(
    text: string,
    href: string,
    variant: ButtonVariant = 'primary',
    size: ButtonSize = 'md',
    alignment: ButtonAlignment = 'center',
    openInNewTab: boolean = false,
    key?: NodeKey
  ) {
    super(key)
    this.__text = text
    this.__href = href
    this.__variant = variant
    this.__size = size
    this.__alignment = alignment
    this.__openInNewTab = openInNewTab
  }

  exportJSON(): SerializedButtonNode {
    return {
      ...super.exportJSON(),
      text: this.__text,
      href: this.__href,
      variant: this.__variant,
      size: this.__size,
      alignment: this.__alignment,
      openInNewTab: this.__openInNewTab,
    }
  }

  exportDOM(): DOMExportOutput {
    const wrapper = document.createElement('div')
    wrapper.setAttribute('data-button-alignment', this.__alignment)
    wrapper.setAttribute('data-button-variant', this.__variant)
    wrapper.setAttribute('data-button-size', this.__size)
    wrapper.className = `my-4 flex ${ALIGNMENT_STYLES[this.__alignment]}`

    const link = document.createElement('a')
    link.href = this.__href
    link.textContent = this.__text
    link.className = `${BUTTON_BASE_CLASS} ${VARIANT_STYLES[this.__variant]} ${SIZE_STYLES[this.__size]}`

    if (this.__openInNewTab) {
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
    }

    wrapper.appendChild(link)
    return { element: wrapper }
  }

  createDOM(config: EditorConfig): HTMLElement {
    const div = document.createElement('div')
    const theme = config.theme
    const className = theme.button
    if (className) {
      div.className = className
    }
    return div
  }

  updateDOM(): false {
    return false
  }

  decorate(): ReactElement {
    return (
      <ButtonComponent
        text={this.__text}
        href={this.__href}
        variant={this.__variant}
        size={this.__size}
        alignment={this.__alignment}
        openInNewTab={this.__openInNewTab}
        nodeKey={this.__key}
      />
    )
  }

  // Getters
  getText(): string {
    return this.getLatest().__text
  }

  getHref(): string {
    return this.getLatest().__href
  }

  getVariant(): ButtonVariant {
    return this.getLatest().__variant
  }

  getSize(): ButtonSize {
    return this.getLatest().__size
  }

  getAlignment(): ButtonAlignment {
    return this.getLatest().__alignment
  }

  getOpenInNewTab(): boolean {
    return this.getLatest().__openInNewTab
  }

  // Setters
  setText(text: string): void {
    const self = this.getWritable()
    self.__text = text
  }

  setHref(href: string): void {
    const self = this.getWritable()
    self.__href = href
  }

  setVariant(variant: ButtonVariant): void {
    const self = this.getWritable()
    self.__variant = variant
  }

  setSize(size: ButtonSize): void {
    const self = this.getWritable()
    self.__size = size
  }

  setAlignment(alignment: ButtonAlignment): void {
    const self = this.getWritable()
    self.__alignment = alignment
  }

  setOpenInNewTab(openInNewTab: boolean): void {
    const self = this.getWritable()
    self.__openInNewTab = openInNewTab
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * ボタンノードを作成する
 *
 * @param params - ボタンのパラメータ
 * @returns ButtonNode インスタンス
 */
export function $createButtonNode({
  text,
  href,
  variant = 'primary',
  size = 'md',
  alignment = 'center',
  openInNewTab = false,
}: {
  text: string
  href: string
  variant?: ButtonVariant
  size?: ButtonSize
  alignment?: ButtonAlignment
  openInNewTab?: boolean
}): ButtonNode {
  return $applyNodeReplacement(
    new ButtonNode(text, href, variant, size, alignment, openInNewTab)
  )
}

/**
 * ノードがButtonNodeかどうかを判定する
 *
 * @param node - 判定対象のノード
 * @returns ButtonNodeの場合true
 */
export function $isButtonNode(
  node: LexicalNode | null | undefined
): node is ButtonNode {
  return node instanceof ButtonNode
}
