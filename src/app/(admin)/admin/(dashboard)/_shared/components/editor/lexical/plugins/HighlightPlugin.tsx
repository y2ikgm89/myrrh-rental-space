/**
 * Highlight Plugin
 *
 * @description テキストハイライト（背景色）機能を提供するプラグイン
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
  SELECTION_CHANGE_COMMAND,
} from 'lexical'
import {
  $getSelectionStyleValueForProperty,
  $patchStyleText,
} from '@lexical/selection'
import { mergeRegister } from '@lexical/utils'
import { Check, ChevronDown, Highlighter, X } from 'lucide-react'
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

type PresetHighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'orange' | 'purple'

export type HighlightColor = PresetHighlightColor | 'none'

type HighlightColorConfig = {
  label: string
  value: string
  preview: string // Tailwind class for preview swatch
}

const PRESET_HIGHLIGHT_COLORS = new Set<PresetHighlightColor>([
  'yellow',
  'green',
  'blue',
  'pink',
  'orange',
  'purple',
])

/**
 * ハイライトカラー設定
 * 背景色は半透明で公開ページでも視認性を確保
 */
export const HIGHLIGHT_COLORS: Record<PresetHighlightColor, HighlightColorConfig> = {
  yellow: {
    label: '黄色',
    value: 'rgba(255, 235, 59, 0.4)',
    preview: 'bg-yellow-300',
  },
  green: {
    label: '緑',
    value: 'rgba(76, 175, 80, 0.4)',
    preview: 'bg-green-400',
  },
  blue: {
    label: '青',
    value: 'rgba(33, 150, 243, 0.4)',
    preview: 'bg-blue-400',
  },
  pink: {
    label: 'ピンク',
    value: 'rgba(233, 30, 99, 0.4)',
    preview: 'bg-pink-400',
  },
  orange: {
    label: 'オレンジ',
    value: 'rgba(255, 152, 0, 0.4)',
    preview: 'bg-orange-400',
  },
  purple: {
    label: '紫',
    value: 'rgba(156, 39, 176, 0.4)',
    preview: 'bg-purple-400',
  },
}

/**
 * 背景色からハイライトカラーを判定
 */
export function getHighlightColorFromStyle(bgColor: string): HighlightColor {
  if (!bgColor || bgColor === 'inherit' || bgColor === 'transparent') {
    return 'none'
  }

  for (const color of PRESET_HIGHLIGHT_COLORS) {
    if (HIGHLIGHT_COLORS[color].value === bgColor) {
      return color
    }
  }

  // 完全一致しない場合（ブラウザが変換した値など）はnoneを返す
  return 'none'
}

/**
 * ハイライト色を適用するユーティリティ関数
 * FloatingToolbarPluginなど外部からも使用可能
 */
export function applyHighlightToSelection(
  editor: import('lexical').LexicalEditor,
  color: HighlightColor
): void {
  editor.update(() => {
    const selection = $getSelection()
    if ($isRangeSelection(selection)) {
      if (color === 'none') {
        $patchStyleText(selection, { 'background-color': null })
      } else {
        $patchStyleText(selection, { 'background-color': HIGHLIGHT_COLORS[color].value })
      }
    }
  })
}

// =============================================================================
// Hook for external usage
// =============================================================================

export function useHighlight() {
  const [editor] = useLexicalComposerContext()
  const [highlightColor, setHighlightColor] = useState<HighlightColor>('none')

  useEffect(() => {
    const updateHighlightState = () => {
      const selection = $getSelection()
      if ($isRangeSelection(selection)) {
        const bgColor = $getSelectionStyleValueForProperty(
          selection,
          'background-color',
          'inherit'
        )
        setHighlightColor(getHighlightColorFromStyle(bgColor))
      }
    }

    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          updateHighlightState()
        })
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateHighlightState()
          return false
        },
        COMMAND_PRIORITY_CRITICAL
      )
    )
  }, [editor])

  const applyHighlight = (color: HighlightColor) => {
    applyHighlightToSelection(editor, color)
  }

  return { highlightColor, applyHighlight, HIGHLIGHT_COLORS }
}

// =============================================================================
// Component
// =============================================================================

export function HighlightPlugin(): React.ReactElement {
  const { highlightColor, applyHighlight } = useHighlight()
  const hasHighlight = highlightColor !== 'none'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={hasHighlight ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 gap-1"
          title="ハイライト"
        >
          <div className="relative">
            <Highlighter className="h-4 w-4" />
            {hasHighlight && (
              <div
                className={`absolute -bottom-0.5 left-0 right-0 h-1 rounded-full ${HIGHLIGHT_COLORS[highlightColor].preview}`}
              />
            )}
          </div>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <HighlightColorMenu
        highlightColor={highlightColor}
        onColorSelect={applyHighlight}
      />
    </DropdownMenu>
  )
}

// =============================================================================
// Shared Color Menu Content
// =============================================================================

type HighlightColorMenuProps = {
  highlightColor: HighlightColor
  onColorSelect: (color: HighlightColor) => void
  compactRemoveLabel?: boolean
}

function HighlightColorMenu({
  highlightColor,
  onColorSelect,
  compactRemoveLabel = false,
}: HighlightColorMenuProps): React.ReactElement {
  const hasHighlight = highlightColor !== 'none'

  return (
    <DropdownMenuContent align="start" className="min-w-[140px]">
      {Array.from(PRESET_HIGHLIGHT_COLORS).map((color) => {
        const config = HIGHLIGHT_COLORS[color]
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
            {highlightColor === color && (
              <Check className="h-4 w-4 text-primary" />
            )}
          </DropdownMenuItem>
        )
      })}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={() => onColorSelect('none')}
        className="flex items-center gap-2"
        disabled={!hasHighlight}
      >
        <X className="h-4 w-4" />
        <span>{compactRemoveLabel ? '解除' : 'ハイライト解除'}</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  )
}

// =============================================================================
// Compact Component (for Floating Toolbar)
// =============================================================================

type HighlightCompactProps = {
  highlightColor: HighlightColor
  onColorSelect: (color: HighlightColor) => void
}

export function HighlightCompact({
  highlightColor,
  onColorSelect,
}: HighlightCompactProps): React.ReactElement {
  const hasHighlight = highlightColor !== 'none'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={hasHighlight ? 'secondary' : 'ghost'}
          size="icon"
          className="h-8 w-8"
          title="ハイライト"
        >
          <div className="relative">
            <Highlighter className="h-4 w-4" />
            {hasHighlight && (
              <div
                className={`absolute -bottom-0.5 left-0 right-0 h-1 rounded-full ${HIGHLIGHT_COLORS[highlightColor].preview}`}
              />
            )}
          </div>
        </Button>
      </DropdownMenuTrigger>
      <HighlightColorMenu
        highlightColor={highlightColor}
        onColorSelect={onColorSelect}
        compactRemoveLabel
      />
    </DropdownMenu>
  )
}
