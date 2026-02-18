/**
 * Collapsible Container Node
 *
 * @description 折りたたみグループの親コンテナを表すElementNode
 * 子ノード: CollapsibleItemNode (1〜10個)
 *
 * スタイルは lexical-content.css の [data-collapsible-container] セレクターで管理
 */

'use client'

import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
} from 'lexical'
import { $create, $getState, $getStateChange, $setState, createState, ElementNode, $isElementNode, $createParagraphNode } from 'lexical'
import { createEnumGuard } from '../config/type-guards'
import { $isCollapsibleItemNode } from './CollapsibleItemNode'

// =============================================================================
// Types
// =============================================================================

export type CollapsibleStyle = 'default' | 'minimal' | 'card' | 'filled'

export const COLLAPSIBLE_STYLES: readonly CollapsibleStyle[] = ['default', 'minimal', 'card', 'filled'] as const

export type CollapsibleRadius = 'none' | 'sm' | 'md' | 'lg'

export const COLLAPSIBLE_RADII: readonly CollapsibleRadius[] = ['none', 'sm', 'md', 'lg'] as const

export type CollapsibleTitleColor = 'default' | 'primary' | 'muted' | 'info' | 'warning' | 'success' | 'error' | 'custom'

export const COLLAPSIBLE_TITLE_COLORS: readonly CollapsibleTitleColor[] = [
  'default', 'primary', 'muted', 'info', 'warning', 'success', 'error', 'custom',
] as const

// =============================================================================
// Type Guards
// =============================================================================

export const isCollapsibleStyle = createEnumGuard<CollapsibleStyle>(COLLAPSIBLE_STYLES)
export const isCollapsibleRadius = createEnumGuard<CollapsibleRadius>(COLLAPSIBLE_RADII)
export const isCollapsibleTitleColor = createEnumGuard<CollapsibleTitleColor>(COLLAPSIBLE_TITLE_COLORS)

// =============================================================================
// State
// =============================================================================

export const collapsibleStyleState = createState('collapsibleStyle', {
  parse: (v: unknown): CollapsibleStyle =>
    typeof v === 'string' && isCollapsibleStyle(v) ? v : 'default',
})

export const borderRadiusState = createState('borderRadius', {
  parse: (v: unknown): CollapsibleRadius =>
    typeof v === 'string' && isCollapsibleRadius(v) ? v : 'md',
})

export const titleColorState = createState('titleColor', {
  parse: (v: unknown): CollapsibleTitleColor =>
    typeof v === 'string' && isCollapsibleTitleColor(v) ? v : 'default',
})

export const titleCustomColorState = createState('titleCustomColor', {
  parse: (v: unknown): string =>
    typeof v === 'string' && /^#[\da-f]{6}$/i.test(v) ? v : '#3b82f6',
})

export const titleCustomLightState = createState('titleCustomLight', {
  parse: (v: unknown): boolean =>
    typeof v === 'boolean' ? v : false,
})

// =============================================================================
// DOM Conversion
// =============================================================================

function $convertCollapsibleContainerElement(element: HTMLElement): null | DOMConversionOutput {
  const rawStyle = element.getAttribute('data-collapsible-style')
  const style = rawStyle && isCollapsibleStyle(rawStyle) ? rawStyle : 'default'
  const rawRadius = element.getAttribute('data-collapsible-radius')
  const radius = rawRadius && isCollapsibleRadius(rawRadius) ? rawRadius : 'md'

  const rawTitleColor = element.getAttribute('data-collapsible-title-color')
  const titleColor = rawTitleColor && isCollapsibleTitleColor(rawTitleColor) ? rawTitleColor : 'default'

  let titleCustomColor = '#3b82f6'
  let titleCustomLight = false
  if (titleColor === 'custom') {
    const inlineStyle = element.getAttribute('style') ?? ''
    const bgMatch = /--collapsible-title-bg:\s*(#[\da-f]{6})/i.exec(inlineStyle)
    if (bgMatch?.[1]) titleCustomColor = bgMatch[1]
    titleCustomLight = /--collapsible-title-fg:.*var\(--color-foreground/.test(inlineStyle)
  }

  const node = $createCollapsibleContainerNode(style, radius, titleColor, titleCustomColor, titleCustomLight)
  return { node }
}

// =============================================================================
// DOM Helpers
// =============================================================================

function applyTitleColorToDOM(
  element: HTMLElement,
  titleColor: CollapsibleTitleColor,
  customColor: string,
  customLight: boolean,
): void {
  if (titleColor === 'default') {
    element.removeAttribute('data-collapsible-title-color')
    element.style.removeProperty('--collapsible-title-bg')
    element.style.removeProperty('--collapsible-title-fg')
  } else {
    element.setAttribute('data-collapsible-title-color', titleColor)
    if (titleColor === 'custom') {
      element.style.setProperty('--collapsible-title-bg', customColor)
      element.style.setProperty(
        '--collapsible-title-fg',
        customLight ? 'var(--color-foreground, #000)' : 'var(--color-primary-foreground, #fff)',
      )
    } else {
      element.style.removeProperty('--collapsible-title-bg')
      element.style.removeProperty('--collapsible-title-fg')
    }
  }
}

// =============================================================================
// Node Class
// =============================================================================

export class CollapsibleContainerNode extends ElementNode {
  override $config() {
    return this.config('collapsible-container', {
      extends: ElementNode,
      stateConfigs: [
        { flat: true, stateConfig: collapsibleStyleState },
        { flat: true, stateConfig: borderRadiusState },
        { flat: true, stateConfig: titleColorState },
        { flat: true, stateConfig: titleCustomColorState },
        { flat: true, stateConfig: titleCustomLightState },
      ],
    })
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      div: (element: HTMLElement) => {
        if (element.hasAttribute('data-collapsible-container')) {
          return {
            conversion: $convertCollapsibleContainerElement,
            priority: 1,
          }
        }
        return null
      },
    }
  }

  override exportDOM(): DOMExportOutput {
    const style = $getState(this, collapsibleStyleState)
    const radius = $getState(this, borderRadiusState)
    const titleColor = $getState(this, titleColorState)
    const customColor = $getState(this, titleCustomColorState)
    const customLight = $getState(this, titleCustomLightState)
    const element = document.createElement('div')
    element.setAttribute('data-collapsible-container', 'true')
    element.setAttribute('data-collapsible-style', style)
    element.setAttribute('data-collapsible-radius', radius)
    applyTitleColorToDOM(element, titleColor, customColor, customLight)
    return { element }
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const style = $getState(this, collapsibleStyleState)
    const radius = $getState(this, borderRadiusState)
    const titleColor = $getState(this, titleColorState)
    const customColor = $getState(this, titleCustomColorState)
    const customLight = $getState(this, titleCustomLightState)
    const element = document.createElement('div')
    element.setAttribute('data-collapsible-container', 'true')
    element.setAttribute('data-collapsible-style', style)
    element.setAttribute('data-collapsible-radius', radius)
    applyTitleColorToDOM(element, titleColor, customColor, customLight)
    return element
  }

  override updateDOM(prevNode: CollapsibleContainerNode, dom: HTMLElement): boolean {
    const styleChange = $getStateChange(this, prevNode, collapsibleStyleState)
    if (styleChange) {
      const [newStyle] = styleChange
      dom.setAttribute('data-collapsible-style', newStyle)
    }
    const radiusChange = $getStateChange(this, prevNode, borderRadiusState)
    if (radiusChange) {
      const [newRadius] = radiusChange
      dom.setAttribute('data-collapsible-radius', newRadius)
    }
    const titleColorChange = $getStateChange(this, prevNode, titleColorState)
    const customColorChange = $getStateChange(this, prevNode, titleCustomColorState)
    const customLightChange = $getStateChange(this, prevNode, titleCustomLightState)
    if (titleColorChange || customColorChange || customLightChange) {
      applyTitleColorToDOM(
        dom,
        $getState(this, titleColorState),
        $getState(this, titleCustomColorState),
        $getState(this, titleCustomLightState),
      )
    }
    return false
  }

  override isShadowRoot(): boolean {
    return true
  }

  override canBeEmpty(): boolean {
    return false
  }

  override canInsertTextBefore(): false {
    return false
  }

  override canInsertTextAfter(): false {
    return false
  }

  override collapseAtStart(): boolean {
    const children = this.getChildren()
    const paragraph = $createParagraphNode()

    // 3-tier: Container → Item → Title/Content
    // Flatten first item's first child's children into a paragraph
    for (const child of children) {
      if ($isCollapsibleItemNode(child)) {
        const itemChildren = child.getChildren()
        for (const itemChild of itemChildren) {
          if ($isElementNode(itemChild)) {
            const grandchildren = itemChild.getChildren()
            for (const grandchild of grandchildren) {
              paragraph.append(grandchild)
            }
          }
        }
        break // Only first item
      }
    }

    this.replace(paragraph)
    return true
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

export function $createCollapsibleContainerNode(
  style: CollapsibleStyle = 'default',
  radius: CollapsibleRadius = 'md',
  titleColor: CollapsibleTitleColor = 'default',
  titleCustomColor = '#3b82f6',
  titleCustomLight = false,
): CollapsibleContainerNode {
  const node = $create(CollapsibleContainerNode)
  $setState(node, collapsibleStyleState, style)
  $setState(node, borderRadiusState, radius)
  $setState(node, titleColorState, titleColor)
  $setState(node, titleCustomColorState, titleCustomColor)
  $setState(node, titleCustomLightState, titleCustomLight)
  return node
}

export function $isCollapsibleContainerNode(
  node: LexicalNode | null | undefined
): node is CollapsibleContainerNode {
  return node instanceof CollapsibleContainerNode
}
