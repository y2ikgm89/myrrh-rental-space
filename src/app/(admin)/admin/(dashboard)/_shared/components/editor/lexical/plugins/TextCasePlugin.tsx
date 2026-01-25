/**
 * Text Case Plugin
 *
 * @description テキストの大文字/小文字変換機能を提供するプラグイン
 *
 * 対応形式:
 * - lowercase: 全て小文字
 * - uppercase: 全て大文字
 * - capitalize: 先頭大文字
 */

'use client'

import { useEffect, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  type TextFormatType,
} from 'lexical'
import { mergeRegister } from '@lexical/utils'
import {
  CaseLower,
  CaseUpper,
  CaseSensitive,
  ChevronDown,
  Check,
} from 'lucide-react'
import { Button } from '@/admin/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/admin/components/ui/dropdown-menu'

// =============================================================================
// Types & Constants
// =============================================================================

type TextCaseType = 'lowercase' | 'uppercase' | 'capitalize'

type TextCaseConfig = {
  label: string
  icon: React.ComponentType<{ className?: string }>
  format: TextFormatType
}

const TEXT_CASE_CONFIG = {
  lowercase: {
    label: '小文字',
    icon: CaseLower,
    format: 'lowercase' as const,
  },
  uppercase: {
    label: '大文字',
    icon: CaseUpper,
    format: 'uppercase' as const,
  },
  capitalize: {
    label: '先頭大文字',
    icon: CaseSensitive,
    format: 'capitalize' as const,
  },
} satisfies Record<TextCaseType, TextCaseConfig>

const TEXT_CASE_TYPES = new Set<TextCaseType>(['lowercase', 'uppercase', 'capitalize'])

// =============================================================================
// Hook
// =============================================================================

export function useTextCase() {
  const [editor] = useLexicalComposerContext()
  const [activeCase, setActiveCase] = useState<TextCaseType | null>(null)

  useEffect(() => {
    const updateTextCaseState = () => {
      const selection = $getSelection()
      if ($isRangeSelection(selection)) {
        // 各ケースの状態をチェック
        if (selection.hasFormat('lowercase')) {
          setActiveCase('lowercase')
        } else if (selection.hasFormat('uppercase')) {
          setActiveCase('uppercase')
        } else if (selection.hasFormat('capitalize')) {
          setActiveCase('capitalize')
        } else {
          setActiveCase(null)
        }
      }
    }

    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          updateTextCaseState()
        })
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateTextCaseState()
          return false
        },
        COMMAND_PRIORITY_CRITICAL
      )
    )
  }, [editor])

  const applyTextCase = (caseType: TextCaseType) => {
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, TEXT_CASE_CONFIG[caseType].format)
  }

  return { activeCase, applyTextCase }
}

// =============================================================================
// Component
// =============================================================================

export function TextCasePlugin(): React.ReactElement {
  const { activeCase, applyTextCase } = useTextCase()

  // アクティブな状態のアイコンを取得
  const ActiveIcon = activeCase ? TEXT_CASE_CONFIG[activeCase].icon : CaseSensitive

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={activeCase ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 gap-1"
          title="テキスト変換"
        >
          <ActiveIcon className="h-4 w-4" />
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[140px]">
        {Array.from(TEXT_CASE_TYPES).map((caseType) => {
          const { label, icon: Icon } = TEXT_CASE_CONFIG[caseType]
          return (
            <DropdownMenuItem
              key={caseType}
              onClick={() => applyTextCase(caseType)}
              className="flex items-center justify-between gap-2"
            >
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </span>
              {activeCase === caseType && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// =============================================================================
// Utility for external usage (ComponentPickerPlugin)
// =============================================================================

/**
 * テキスト変換を適用するユーティリティ関数
 * ComponentPickerPluginから使用
 */
export function applyTextCaseToSelection(
  editor: import('lexical').LexicalEditor,
  caseType: TextCaseType
): void {
  editor.dispatchCommand(FORMAT_TEXT_COMMAND, TEXT_CASE_CONFIG[caseType].format)
}

export { TEXT_CASE_CONFIG, TEXT_CASE_TYPES, type TextCaseType }
