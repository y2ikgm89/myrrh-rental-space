/**
 * PricingTable Plugin
 *
 * @description 料金比較表の挿入を提供するプラグイン
 *
 * ダイアログで列数（2〜3）を選択し、PricingTableContainerNode と初期プランを挿入する
 */

'use client'

import { useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $insertNodeToNearestRoot } from '@lexical/utils'
import { $createParagraphNode } from 'lexical'
import {
  $createPricingTableContainerNode,
  $createPricingPlanNode,
  $createPricingFeatureNode,
} from '../nodes/PricingTableNode'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Label,
} from '@/admin/components/ui'
import {
  RadioGroup,
  RadioGroupItem,
} from '@/admin/components/ui/radio-group'

// =============================================================================
// Types
// =============================================================================

type PricingTablePluginProps = {
  isOpen: boolean
  onClose: () => void
}

type ColumnCount = 2 | 3

// =============================================================================
// Constants
// =============================================================================

const COLUMN_OPTIONS: readonly { value: ColumnCount; label: string }[] = [
  { value: 2, label: '2列（2プラン比較）' },
  { value: 3, label: '3列（3プラン比較）' },
]

const INITIAL_PLANS: readonly { name: string; price: string; period: string; featured: boolean }[] = [
  { name: 'ベーシック', price: '¥1,000', period: '月', featured: false },
  { name: 'スタンダード', price: '¥3,000', period: '月', featured: true },
  { name: 'プレミアム', price: '¥5,000', period: '月', featured: false },
]

const INITIAL_FEATURES: readonly { text: string; included: boolean }[][] = [
  [
    { text: '基本機能', included: true },
    { text: '高度な機能', included: false },
    { text: '優先サポート', included: false },
  ],
  [
    { text: '基本機能', included: true },
    { text: '高度な機能', included: true },
    { text: '優先サポート', included: false },
  ],
  [
    { text: '基本機能', included: true },
    { text: '高度な機能', included: true },
    { text: '優先サポート', included: true },
  ],
]

// =============================================================================
// Component
// =============================================================================

export function PricingTablePlugin({ isOpen, onClose }: PricingTablePluginProps) {
  const [editor] = useLexicalComposerContext()
  const [columns, setColumns] = useState<ColumnCount>(3)

  const handleInsert = () => {
    editor.update(() => {
      const container = $createPricingTableContainerNode()

      for (let i = 0; i < columns; i++) {
        const planInfo = INITIAL_PLANS[i]
        if (!planInfo) continue

        const plan = $createPricingPlanNode({
          name: planInfo.name,
          price: planInfo.price,
          period: planInfo.period,
          featured: planInfo.featured,
        })

        const features = INITIAL_FEATURES[i] ?? []
        for (const featureInfo of features) {
          const feature = $createPricingFeatureNode({ included: featureInfo.included })
          const paragraph = $createParagraphNode()
          feature.append(paragraph)
          plan.append(feature)
        }

        container.append(plan)
      }

      $insertNodeToNearestRoot(container)
    })
    setColumns(3)
    onClose()
  }

  const handleClose = () => {
    setColumns(3)
    onClose()
  }

  const handleColumnChange = (value: string) => {
    const num = Number(value)
    if (num === 2 || num === 3) {
      setColumns(num)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>料金比較表を挿入</DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="space-y-3">
            <Label className="text-sm font-medium block">列数（プラン数）</Label>
            <RadioGroup
              value={String(columns)}
              onValueChange={handleColumnChange}
              className="flex flex-col gap-2"
            >
              {COLUMN_OPTIONS.map((option) => (
                <div key={option.value} className="flex items-center space-x-2">
                  <RadioGroupItem
                    value={String(option.value)}
                    id={`pricing-columns-${option.value}`}
                  />
                  <Label
                    htmlFor={`pricing-columns-${option.value}`}
                    className="font-normal cursor-pointer"
                  >
                    {option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            キャンセル
          </Button>
          <Button type="button" onClick={handleInsert}>
            挿入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
