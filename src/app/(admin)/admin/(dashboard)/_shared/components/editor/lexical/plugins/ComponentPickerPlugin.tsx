/**
 * Component Picker Plugin
 *
 * @description スラッシュコマンドでコンポーネントを挿入するプラグイン
 *
 * "/" を入力するとメニューが表示され、ブロックタイプやメディアを選択できる
 * カテゴリー別にグループ化されたメニュー表示
 */

'use client'

import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from '@lexical/react/LexicalTypeaheadMenuPlugin'
import { TextNode } from 'lexical'
import {
  getPickerInsertItems,
  executeInsertItem,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type InsertCategory,
} from '../config/insert-items'
import type { DialogId } from '../dialogs/dialog-types'

// =============================================================================
// Types
// =============================================================================

type ComponentPickerPluginProps = {
  openDialog?: (id: DialogId) => void
}

// =============================================================================
// Menu Option Class
// =============================================================================

class ComponentPickerOption extends MenuOption {
  title: string
  icon: ReactNode
  keywords: string[]
  category: InsertCategory
  onSelect: (queryString: string) => void

  constructor(
    title: string,
    options: {
      icon: ReactNode
      keywords?: string[]
      category: InsertCategory
      onSelect: (queryString: string) => void
    }
  ) {
    super(title)
    this.title = title
    this.icon = options.icon
    this.keywords = options.keywords ?? []
    this.category = options.category
    this.onSelect = options.onSelect
  }
}

// =============================================================================
// Menu Item Component
// =============================================================================

function ComponentPickerMenuItem({
  index,
  isSelected,
  onClick,
  onMouseEnter,
  option,
}: {
  index: number
  isSelected: boolean
  onClick: () => void
  onMouseEnter: () => void
  option: ComponentPickerOption
}) {
  return (
    <li
      key={option.key}
      tabIndex={-1}
      role="option"
      aria-selected={isSelected}
      id={`typeahead-item-${index}`}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
      }`}
    >
      <span className="flex h-5 w-5 items-center justify-center text-muted-foreground">
        {option.icon}
      </span>
      <span className="text-sm">{option.title}</span>
    </li>
  )
}

// =============================================================================
// Category Header Component
// =============================================================================

function CategoryHeader({ label }: { label: string }) {
  return (
    <li className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide select-none">
      {label}
    </li>
  )
}

// =============================================================================
// Component
// =============================================================================

export function ComponentPickerPlugin({
  openDialog,
}: ComponentPickerPluginProps) {
  const [editor] = useLexicalComposerContext()
  const [queryString, setQueryString] = useState<string | null>(null)

  // トリガー: "/" で発火
  const checkForTriggerMatch = useBasicTypeaheadTriggerMatch('/', {
    minLength: 0,
  })

  // configからオプションを生成
  const configItems = getPickerInsertItems(!!openDialog)
  const allOptions = configItems.map(
    (item) =>
      new ComponentPickerOption(item.label, {
        icon: <item.icon className="h-4 w-4" />,
        keywords: [...item.keywords],
        category: item.category,
        onSelect: () => executeInsertItem(item, editor, openDialog),
      })
  )

  // フィルタリング
  const options = (() => {
    if (queryString === null || queryString === '') {
      return allOptions
    }

    const lowerQuery = queryString.toLowerCase()
    return allOptions.filter((option) => {
      const titleMatch = option.title.toLowerCase().includes(lowerQuery)
      const keywordMatch = option.keywords.some((keyword) =>
        keyword.toLowerCase().includes(lowerQuery)
      )
      return titleMatch || keywordMatch
    })
  })()

  // カテゴリー別にグループ化
  const groupedOptions = (() => {
    const groups: { category: InsertCategory; options: ComponentPickerOption[] }[] = []

    for (const category of CATEGORY_ORDER) {
      const categoryOptions = options.filter((opt) => opt.category === category)
      if (categoryOptions.length > 0) {
        groups.push({ category, options: categoryOptions })
      }
    }

    return groups
  })()

  const onSelectOption = (
    selectedOption: ComponentPickerOption,
    nodeToRemove: TextNode | null,
    closeMenu: () => void,
    matchingString: string
  ) => {
    editor.update(() => {
      if (nodeToRemove) {
        nodeToRemove.remove()
      }
      selectedOption.onSelect(matchingString)
      closeMenu()
    })
  }

  // フラットなオプションリスト（キーボードナビゲーション用）
  const flatOptions = groupedOptions.flatMap((group) => group.options)

  return (
    <LexicalTypeaheadMenuPlugin<ComponentPickerOption>
      onQueryChange={setQueryString}
      onSelectOption={onSelectOption}
      triggerFn={checkForTriggerMatch}
      options={flatOptions}
      menuRenderFn={(
        anchorElementRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }
      ) =>
        anchorElementRef.current && flatOptions.length > 0
          ? createPortal(
              <div className="fixed z-50 min-w-[220px] max-h-[320px] overflow-y-auto rounded-md border bg-popover shadow-md">
                <ul className="py-1" role="listbox">
                  {groupedOptions.map((group) => {
                    // 検索時はカテゴリーヘッダーを非表示
                    const showHeader = !queryString || queryString === ''
                    return (
                      <div key={group.category}>
                        {showHeader && (
                          <CategoryHeader label={CATEGORY_LABELS[group.category]} />
                        )}
                        {group.options.map((option) => {
                          const globalIndex = flatOptions.indexOf(option)
                          return (
                            <ComponentPickerMenuItem
                              key={option.key}
                              index={globalIndex}
                              isSelected={selectedIndex === globalIndex}
                              onClick={() => {
                                setHighlightedIndex(globalIndex)
                                selectOptionAndCleanUp(option)
                              }}
                              onMouseEnter={() => {
                                setHighlightedIndex(globalIndex)
                              }}
                              option={option}
                            />
                          )
                        })}
                      </div>
                    )
                  })}
                </ul>
              </div>,
              anchorElementRef.current
            )
          : null
      }
    />
  )
}
