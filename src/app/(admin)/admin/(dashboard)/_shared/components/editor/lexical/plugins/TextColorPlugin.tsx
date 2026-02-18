/**
 * Text Color Plugin
 *
 * @description テキストの文字色変更機能を提供するプラグイン
 *
 * 公式推奨パターン: $patchStyleText を使用してインラインスタイルを適用
 * @see https://lexical.dev/docs/concepts/selection#patchstyletext
 */

'use client'

import { useEffect, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  mergeRegister,
  SELECTION_CHANGE_COMMAND,
} from 'lexical'
import {
  $getSelectionStyleValueForProperty,
  $patchStyleText,
} from '@lexical/selection'
import { Check, ChevronDown, Type, X } from 'lucide-react'
import { Button } from '@/admin/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/admin/components/ui/dropdown-menu'

// =============================================================================
// Types & Constants
// =============================================================================

export type PresetTextColor =
  | 'black'
  | 'red'
  | 'blue'
  | 'green'
  | 'orange'
  | 'purple'
  | 'pink'
  | 'gray'

export type TextColor = PresetTextColor | 'none' | 'custom'

type TextColorConfig = {
  label: string
  value: string
  preview: string // Tailwind class for preview swatch
}

const PRESET_TEXT_COLORS = new Set<PresetTextColor>([
  'black',
  'red',
  'blue',
  'green',
  'orange',
  'purple',
  'pink',
  'gray',
])

/**
 * テキストカラー設定
 */
export const TEXT_COLORS: Record<PresetTextColor, TextColorConfig> = {
  black: {
    label: '黒',
    value: '#000000',
    preview: 'bg-black',
  },
  red: {
    label: '赤',
    value: '#ef4444',
    preview: 'bg-red-500',
  },
  blue: {
    label: '青',
    value: '#3b82f6',
    preview: 'bg-blue-500',
  },
  green: {
    label: '緑',
    value: '#22c55e',
    preview: 'bg-green-500',
  },
  orange: {
    label: 'オレンジ',
    value: '#f97316',
    preview: 'bg-orange-500',
  },
  purple: {
    label: '紫',
    value: '#a855f7',
    preview: 'bg-purple-500',
  },
  pink: {
    label: 'ピンク',
    value: '#ec4899',
    preview: 'bg-pink-500',
  },
  gray: {
    label: 'グレー',
    value: '#6b7280',
    preview: 'bg-gray-500',
  },
}

/**
 * RGB/RGBA文字列をHEXに変換
 * ブラウザによって rgb() または rgba() 形式で返される場合がある
 */
function rgbToHex(rgbString: string): string | null {
  // rgba? で rgb と rgba 両方に対応、スペースは任意
  const rgbMatch = rgbString.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (!rgbMatch) return null
  const r = Number(rgbMatch[1]).toString(16).padStart(2, '0')
  const g = Number(rgbMatch[2]).toString(16).padStart(2, '0')
  const b = Number(rgbMatch[3]).toString(16).padStart(2, '0')
  return `#${r}${g}${b}`
}

/**
 * CSSカラー値からTextColorを判定
 */
export function getTextColorFromStyle(color: string): TextColor {
  if (!color || color === 'inherit' || color === 'transparent') {
    return 'none'
  }

  // HEX形式に正規化
  const normalizedColor = color.startsWith('rgb') ? rgbToHex(color) : color

  // プリセット色と一致するか確認
  for (const key of PRESET_TEXT_COLORS) {
    if (TEXT_COLORS[key].value.toLowerCase() === normalizedColor?.toLowerCase()) {
      return key
    }
  }

  // 完全一致しない場合はカスタム色
  return 'custom'
}

/**
 * プレビュー用のカラー値を取得
 */
function getPreviewColor(
  textColor: TextColor,
  currentColorValue: string
): string | undefined {
  if (textColor === 'none') return undefined
  if (textColor === 'custom') return currentColorValue
  return TEXT_COLORS[textColor].value
}

/**
 * 文字色を適用するユーティリティ関数
 * FloatingToolbarPluginなど外部からも使用可能
 */
export function applyTextColorToSelection(
  editor: import('lexical').LexicalEditor,
  color: TextColor,
  customValue?: string
): void {
  editor.update(() => {
    const selection = $getSelection()
    if ($isRangeSelection(selection)) {
      if (color === 'none') {
        $patchStyleText(selection, { color: null })
      } else if (color === 'custom' && customValue) {
        $patchStyleText(selection, { color: customValue })
      } else if (color !== 'custom') {
        $patchStyleText(selection, { color: TEXT_COLORS[color].value })
      }
    }
  })
}

// =============================================================================
// Hook for external usage
// =============================================================================

export function useTextColor() {
  const [editor] = useLexicalComposerContext()
  const [textColor, setTextColor] = useState<TextColor>('none')
  const [currentColorValue, setCurrentColorValue] = useState<string>('#000000')

  useEffect(() => {
    const updateTextColorState = () => {
      const selection = $getSelection()
      if ($isRangeSelection(selection)) {
        const color = $getSelectionStyleValueForProperty(
          selection,
          'color',
          'inherit'
        )
        setTextColor(getTextColorFromStyle(color))
        // カスタム色の場合は値を保存
        if (color && color !== 'inherit' && color !== 'transparent') {
          setCurrentColorValue(color)
        }
      }
    }

    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          updateTextColorState()
        })
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateTextColorState()
          return false
        },
        COMMAND_PRIORITY_CRITICAL
      )
    )
  }, [editor])

  const applyTextColor = (color: TextColor, customValue?: string) => {
    applyTextColorToSelection(editor, color, customValue)
  }

  return { textColor, currentColorValue, applyTextColor, TEXT_COLORS }
}

// =============================================================================
// Component
// =============================================================================

export function TextColorPlugin() {
  const { textColor, currentColorValue, applyTextColor } = useTextColor()
  const hasColor = textColor !== 'none'

  const handleCustomColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    applyTextColor('custom', e.target.value)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={hasColor ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 gap-1"
          title="文字色"
        >
          <div className="relative">
            <Type className="h-4 w-4" />
            {hasColor && (
              <div
                className="absolute -bottom-0.5 left-0 right-0 h-1 rounded-full"
                style={{
                  backgroundColor: getPreviewColor(textColor, currentColorValue),
                }}
              />
            )}
          </div>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <TextColorMenu
        textColor={textColor}
        currentColorValue={currentColorValue}
        onColorSelect={applyTextColor}
        onCustomColorChange={handleCustomColorChange}
      />
    </DropdownMenu>
  )
}

// =============================================================================
// Shared Color Menu Content
// =============================================================================

type TextColorMenuProps = {
  textColor: TextColor
  currentColorValue: string
  onColorSelect: (color: TextColor, customValue?: string) => void
  onCustomColorChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  compactRemoveLabel?: boolean
}

function TextColorMenu({
  textColor,
  currentColorValue,
  onColorSelect,
  onCustomColorChange,
  compactRemoveLabel = false,
}: TextColorMenuProps) {
  const hasColor = textColor !== 'none'

  return (
    <DropdownMenuContent align="start" className="min-w-[160px]">
      {Array.from(PRESET_TEXT_COLORS).map((color) => {
        const config = TEXT_COLORS[color]
        return (
          <DropdownMenuItem
            key={color}
            onClick={() => onColorSelect(color)}
            className="flex items-center justify-between gap-2"
          >
            <span className="flex items-center gap-2">
              <span
                className={`h-4 w-4 rounded ${config.preview}`}
                aria-hidden="true"
              />
              <span>{config.label}</span>
            </span>
            {textColor === color && (
              <Check className="h-4 w-4 text-primary" />
            )}
          </DropdownMenuItem>
        )
      })}
      <DropdownMenuSeparator />
      <div className="flex items-center gap-2 px-2 py-1.5">
        <label
          htmlFor="custom-text-color"
          className="flex items-center gap-2 text-sm"
        >
          <input
            type="color"
            id="custom-text-color"
            value={currentColorValue}
            onChange={onCustomColorChange}
            className="h-6 w-6 cursor-pointer rounded border-0 p-0"
          />
          <span>カスタム</span>
        </label>
        {textColor === 'custom' && (
          <Check className="ml-auto h-4 w-4 text-primary" />
        )}
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={() => onColorSelect('none')}
        className="flex items-center gap-2"
        disabled={!hasColor}
      >
        <X className="h-4 w-4" />
        <span>{compactRemoveLabel ? '解除' : '文字色を解除'}</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  )
}

// =============================================================================
// Compact Component (for Floating Toolbar)
// =============================================================================

type TextColorCompactProps = {
  textColor: TextColor
  currentColorValue: string
  onColorSelect: (color: TextColor, customValue?: string) => void
}

export function TextColorCompact({
  textColor,
  currentColorValue,
  onColorSelect,
}: TextColorCompactProps) {
  const hasColor = textColor !== 'none'

  const handleCustomColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onColorSelect('custom', e.target.value)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={hasColor ? 'secondary' : 'ghost'}
          size="icon"
          className="h-8 w-8"
          title="文字色"
        >
          <div className="relative">
            <Type className="h-4 w-4" />
            {hasColor && (
              <div
                className="absolute -bottom-0.5 left-0 right-0 h-1 rounded-full"
                style={{
                  backgroundColor: getPreviewColor(textColor, currentColorValue),
                }}
              />
            )}
          </div>
        </Button>
      </DropdownMenuTrigger>
      <TextColorMenu
        textColor={textColor}
        currentColorValue={currentColorValue}
        onColorSelect={onColorSelect}
        onCustomColorChange={handleCustomColorChange}
        compactRemoveLabel
      />
    </DropdownMenu>
  )
}
