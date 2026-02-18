/**
 * Color Swatch Picker
 *
 * @description アクセントカラー選択用の10色スウォッチグリッド
 * 全インスペクタパネルで共有
 */

'use client'

import { Label } from '@/admin/components/ui'
import { ACCENT_COLORS, ACCENT_COLOR_SWATCHES, type AccentColor } from '../config/accent-colors'

type ColorSwatchPickerProps = {
  value: AccentColor
  onChange: (color: AccentColor) => void
  label?: string
}

const COLOR_NAMES: Record<AccentColor, string> = {
  default: 'デフォルト',
  blue:    'ブルー',
  teal:    'ティール',
  green:   'グリーン',
  yellow:  'イエロー',
  orange:  'オレンジ',
  red:     'レッド',
  pink:    'ピンク',
  purple:  'パープル',
  slate:   'スレート',
}

export function ColorSwatchPicker({ value, onChange, label = 'アクセントカラー' }: ColorSwatchPickerProps) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="grid grid-cols-5 gap-1.5">
        {ACCENT_COLORS.map((color) => {
          const isSelected = value === color
          const swatchColor = ACCENT_COLOR_SWATCHES[color]
          return (
            <button
              key={color}
              type="button"
              title={COLOR_NAMES[color]}
              onClick={() => onChange(color)}
              className={[
                'h-6 w-full rounded transition-shadow',
                isSelected
                  ? 'ring-2 ring-ring ring-offset-1'
                  : 'hover:ring-1 hover:ring-border',
              ].join(' ')}
              style={{ backgroundColor: swatchColor }}
              aria-label={COLOR_NAMES[color]}
              aria-pressed={isSelected}
            />
          )
        })}
      </div>
    </div>
  )
}
