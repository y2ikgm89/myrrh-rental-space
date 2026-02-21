/**
 * PricingTable Node
 *
 * @description 料金比較表を表示するコンポジットノード
 * PricingTableContainerNode + PricingPlanNode + PricingFeatureNode の3ノード構成
 */

'use client'

import type { EditorConfig } from 'lexical'
import { $create, $getState, $getStateChange, $setState, createState, ElementNode } from 'lexical'

// =============================================================================
// PricingPlanNode States
// =============================================================================

export const planNameState = createState('name', {
  parse: (v: unknown): string => (typeof v === 'string' ? v : ''),
})

export const planPriceState = createState('price', {
  parse: (v: unknown): string => (typeof v === 'string' ? v : ''),
})

export const planPeriodState = createState('period', {
  parse: (v: unknown): string => (typeof v === 'string' ? v : ''),
})

export const planFeaturedState = createState('featured', {
  parse: (v: unknown): boolean => v === true,
})

export const planColorState = createState('color', {
  parse: (v: unknown): string => (typeof v === 'string' ? v : 'default'),
})

// =============================================================================
// PricingFeatureNode States
// =============================================================================

export const featureIncludedState = createState('included', {
  parse: (v: unknown): boolean => v !== false,
})

// =============================================================================
// PricingTableContainerNode
// =============================================================================

export class PricingTableContainerNode extends ElementNode {
  override $config() {
    return this.config('pricing-table-container', {
      extends: ElementNode,
    })
  }

  override isShadowRoot(): boolean {
    return true
  }

  override canBeEmpty(): boolean {
    return false
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement('div')
    div.setAttribute('data-pricing', 'true')
    return div
  }

  override updateDOM(): boolean {
    return false
  }

  override exportDOM() {
    const div = document.createElement('div')
    div.setAttribute('data-pricing', 'true')
    div.setAttribute('data-pricing-columns', String(this.getChildren().length))
    return { element: div }
  }

  override canInsertTextBefore(): boolean {
    return false
  }

  override canInsertTextAfter(): boolean {
    return false
  }
}

// =============================================================================
// PricingPlanNode
// =============================================================================

export class PricingPlanNode extends ElementNode {
  override $config() {
    return this.config('pricing-plan', {
      extends: ElementNode,
      stateConfigs: [
        { flat: true, stateConfig: planNameState },
        { flat: true, stateConfig: planPriceState },
        { flat: true, stateConfig: planPeriodState },
        { flat: true, stateConfig: planFeaturedState },
        { flat: true, stateConfig: planColorState },
      ],
    })
  }

  override isShadowRoot(): boolean {
    return true
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement('div')
    div.setAttribute('data-pricing-plan', 'true')
    div.setAttribute('data-featured', String($getState(this, planFeaturedState)))
    div.setAttribute('data-color', $getState(this, planColorState))
    return div
  }

  override updateDOM(prevNode: PricingPlanNode, dom: HTMLElement): boolean {
    const featuredChange = $getStateChange(this, prevNode, planFeaturedState)
    if (featuredChange) {
      const [newFeatured] = featuredChange
      dom.setAttribute('data-featured', String(newFeatured))
    }
    const colorChange = $getStateChange(this, prevNode, planColorState)
    if (colorChange) {
      const [newColor] = colorChange
      dom.setAttribute('data-color', newColor)
    }
    return false
  }

  override exportDOM() {
    const div = document.createElement('div')
    div.setAttribute('data-pricing-plan', 'true')
    div.setAttribute('data-featured', String($getState(this, planFeaturedState)))
    div.setAttribute('data-color', $getState(this, planColorState))
    return { element: div }
  }

  override canInsertTextBefore(): boolean {
    return false
  }

  override canInsertTextAfter(): boolean {
    return false
  }
}

// =============================================================================
// PricingFeatureNode
// =============================================================================

export class PricingFeatureNode extends ElementNode {
  override $config() {
    return this.config('pricing-feature', {
      extends: ElementNode,
      stateConfigs: [{ flat: true, stateConfig: featureIncludedState }],
    })
  }

  override isShadowRoot(): boolean {
    return true
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const div = document.createElement('div')
    div.setAttribute('data-pricing-feature', 'true')
    div.setAttribute('data-included', String($getState(this, featureIncludedState)))
    return div
  }

  override updateDOM(prevNode: PricingFeatureNode, dom: HTMLElement): boolean {
    const includedChange = $getStateChange(this, prevNode, featureIncludedState)
    if (includedChange) {
      const [newIncluded] = includedChange
      dom.setAttribute('data-included', String(newIncluded))
    }
    return false
  }

  override exportDOM() {
    const li = document.createElement('li')
    li.setAttribute('data-pricing-feature', 'true')
    li.setAttribute('data-included', String($getState(this, featureIncludedState)))
    return { element: li }
  }

  override canInsertTextBefore(): boolean {
    return false
  }

  override canInsertTextAfter(): boolean {
    return false
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

export function $createPricingTableContainerNode(): PricingTableContainerNode {
  return $create(PricingTableContainerNode)
}

export function $createPricingPlanNode(params: {
  name?: string
  price?: string
  period?: string
  featured?: boolean
  color?: string
} = {}): PricingPlanNode {
  const node = $create(PricingPlanNode)
  $setState(node, planNameState, params.name ?? '')
  $setState(node, planPriceState, params.price ?? '')
  $setState(node, planPeriodState, params.period ?? '月')
  $setState(node, planFeaturedState, params.featured ?? false)
  $setState(node, planColorState, params.color ?? 'default')
  return node
}

export function $createPricingFeatureNode(params: {
  included?: boolean
} = {}): PricingFeatureNode {
  const node = $create(PricingFeatureNode)
  $setState(node, featureIncludedState, params.included ?? true)
  return node
}

export function $isPricingTableContainerNode(node: unknown): node is PricingTableContainerNode {
  return node instanceof PricingTableContainerNode
}

export function $isPricingPlanNode(node: unknown): node is PricingPlanNode {
  return node instanceof PricingPlanNode
}

export function $isPricingFeatureNode(node: unknown): node is PricingFeatureNode {
  return node instanceof PricingFeatureNode
}
