/**
 * Color Swatch Picker
 *
 * @description アクセントカラー選択用の10色スウォッチグリッド
 * 全インスペクタパネルで共有
 */

'use client'

import { Label } from '@/admin/components/ui'
import {
  ACCENT_COLORS,
  ACCENT_COLOR_LABELS,
  ACCENT_COLOR_SWATCHES,
  type AccentColor,
} from '../config/accent-colors'

type ColorSwatchPickerProps = {
  value: AccentColor
  onChange: (color: AccentColor) => void
  label?: string
}

export function ColorSwatchPicker({ value, onChange, label = 'アクセントカラー' }: ColorSwatchPickerProps) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="grid grid-cols-5 gap-1.5">
        {ACCENT_COLORS.map((color) => {
          const isSelected = value === color
          return (
            <button
              key={color}
              type="button"
              title={ACCENT_COLOR_LABELS[color]}
              onClick={() => onChange(color)}
              className={[
                'h-6 w-full rounded transition-shadow',
                isSelected
                  ? 'ring-2 ring-ring ring-offset-1'
                  : 'hover:ring-1 hover:ring-border',
              ].join(' ')}
              style={{ backgroundColor: ACCENT_COLOR_SWATCHES[color] }}
              aria-label={ACCENT_COLOR_LABELS[color]}
              aria-pressed={isSelected}
            />
          )
        })}
      </div>
    </div>
  )
}
