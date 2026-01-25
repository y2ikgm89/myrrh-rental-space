/**
 * Component Picker Plugin
 *
 * @description スラッシュコマンドでコンポーネントを挿入するプラグイン
 *
 * "/" を入力するとメニューが表示され、ブロックタイプやメディアを選択できる
 * カテゴリー別にグループ化されたメニュー表示
 */

'use client'

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from '@lexical/react/LexicalTypeaheadMenuPlugin'
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  TextNode,
} from 'lexical'
import { $createHeadingNode, $createQuoteNode } from '@lexical/rich-text'
import { $setBlocksType } from '@lexical/selection'
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  INSERT_CHECK_LIST_COMMAND,
} from '@lexical/list'
import {
  Pilcrow,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  TextQuote,
  List,
  ListOrdered,
  ListChecks,
  Image as ImageIcon,
  Youtube,
  Twitter,
  Table,
  Minus,
  Code,
  Columns,
  CaseLower,
  CaseUpper,
  CaseSensitive,
} from 'lucide-react'
import { INSERT_HORIZONTAL_RULE_COMMAND } from '@lexical/react/LexicalHorizontalRuleNode'
import { $createCodeNode } from '@lexical/code'
import { FORMAT_TEXT_COMMAND, type TextFormatType } from 'lexical'

// =============================================================================
// Types
// =============================================================================

type ComponentPickerPluginProps = {
  onInsertImage?: () => void
  onInsertYouTube?: () => void
  onInsertX?: () => void
  onInsertTable?: () => void
  onInsertLayout?: () => void
}

type CategoryType = 'basic' | 'list' | 'media' | 'layout' | 'format' | 'other'

const CATEGORY_LABELS: Record<CategoryType, string> = {
  basic: '基本ブロック',
  list: 'リスト',
  media: 'メディア',
  layout: 'レイアウト',
  format: 'テキスト変換',
  other: 'その他',
}

// =============================================================================
// Menu Option Class
// =============================================================================

class ComponentPickerOption extends MenuOption {
  title: string
  icon: React.ReactNode
  keywords: string[]
  category: CategoryType
  onSelect: (queryString: string) => void

  constructor(
    title: string,
    options: {
      icon: React.ReactNode
      keywords?: string[]
      category: CategoryType
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
  onInsertImage,
  onInsertYouTube,
  onInsertX,
  onInsertTable,
  onInsertLayout,
}: ComponentPickerPluginProps) {
  const [editor] = useLexicalComposerContext()
  const [queryString, setQueryString] = useState<string | null>(null)

  // トリガー: "/" で発火
  const checkForTriggerMatch = useBasicTypeaheadTriggerMatch('/', {
    minLength: 0,
  })

  // オプション定義（カテゴリー順）
  const options = useMemo(() => {
    const allOptions: ComponentPickerOption[] = [
      // ========== 基本ブロック ==========
      new ComponentPickerOption('本文', {
        icon: <Pilcrow className="h-4 w-4" />,
        keywords: ['paragraph', 'normal', 'honbun', 'text'],
        category: 'basic',
        onSelect: () => {
          editor.update(() => {
            const selection = $getSelection()
            if ($isRangeSelection(selection)) {
              $setBlocksType(selection, () => $createParagraphNode())
            }
          })
        },
      }),
      new ComponentPickerOption('見出し1', {
        icon: <Heading1 className="h-4 w-4" />,
        keywords: ['heading', 'h1', 'midashi', 'title'],
        category: 'basic',
        onSelect: () => {
          editor.update(() => {
            const selection = $getSelection()
            if ($isRangeSelection(selection)) {
              $setBlocksType(selection, () => $createHeadingNode('h1'))
            }
          })
        },
      }),
      new ComponentPickerOption('見出し2', {
        icon: <Heading2 className="h-4 w-4" />,
        keywords: ['heading', 'h2', 'midashi'],
        category: 'basic',
        onSelect: () => {
          editor.update(() => {
            const selection = $getSelection()
            if ($isRangeSelection(selection)) {
              $setBlocksType(selection, () => $createHeadingNode('h2'))
            }
          })
        },
      }),
      new ComponentPickerOption('見出し3', {
        icon: <Heading3 className="h-4 w-4" />,
        keywords: ['heading', 'h3', 'midashi'],
        category: 'basic',
        onSelect: () => {
          editor.update(() => {
            const selection = $getSelection()
            if ($isRangeSelection(selection)) {
              $setBlocksType(selection, () => $createHeadingNode('h3'))
            }
          })
        },
      }),
      new ComponentPickerOption('見出し4', {
        icon: <Heading4 className="h-4 w-4" />,
        keywords: ['heading', 'h4', 'midashi'],
        category: 'basic',
        onSelect: () => {
          editor.update(() => {
            const selection = $getSelection()
            if ($isRangeSelection(selection)) {
              $setBlocksType(selection, () => $createHeadingNode('h4'))
            }
          })
        },
      }),
      new ComponentPickerOption('引用', {
        icon: <TextQuote className="h-4 w-4" />,
        keywords: ['quote', 'blockquote', 'inyou'],
        category: 'basic',
        onSelect: () => {
          editor.update(() => {
            const selection = $getSelection()
            if ($isRangeSelection(selection)) {
              $setBlocksType(selection, () => $createQuoteNode())
            }
          })
        },
      }),
      new ComponentPickerOption('コードブロック', {
        icon: <Code className="h-4 w-4" />,
        keywords: ['code', 'codeblock', 'programming', 'koudo'],
        category: 'basic',
        onSelect: () => {
          editor.update(() => {
            const selection = $getSelection()
            if ($isRangeSelection(selection)) {
              $setBlocksType(selection, () => $createCodeNode())
            }
          })
        },
      }),

      // ========== リスト ==========
      new ComponentPickerOption('箇条書き', {
        icon: <List className="h-4 w-4" />,
        keywords: ['bullet', 'list', 'ul', 'kajogaki'],
        category: 'list',
        onSelect: () => {
          editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
        },
      }),
      new ComponentPickerOption('番号付きリスト', {
        icon: <ListOrdered className="h-4 w-4" />,
        keywords: ['numbered', 'list', 'ol', 'bangou'],
        category: 'list',
        onSelect: () => {
          editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)
        },
      }),
      new ComponentPickerOption('チェックリスト', {
        icon: <ListChecks className="h-4 w-4" />,
        keywords: ['check', 'todo', 'list', 'chekkurisuto', 'task'],
        category: 'list',
        onSelect: () => {
          editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined)
        },
      }),

      // ========== メディア ==========
      ...(onInsertImage
        ? [
            new ComponentPickerOption('画像', {
              icon: <ImageIcon className="h-4 w-4" />,
              keywords: ['image', 'photo', 'picture', 'gazou', 'img'],
              category: 'media' as CategoryType,
              onSelect: () => {
                onInsertImage()
              },
            }),
          ]
        : []),
      ...(onInsertYouTube
        ? [
            new ComponentPickerOption('YouTube', {
              icon: <Youtube className="h-4 w-4" />,
              keywords: ['youtube', 'video', 'embed', 'douga', 'movie'],
              category: 'media' as CategoryType,
              onSelect: () => {
                onInsertYouTube()
              },
            }),
          ]
        : []),
      ...(onInsertX
        ? [
            new ComponentPickerOption('X (Twitter)', {
              icon: <Twitter className="h-4 w-4" />,
              keywords: ['x', 'twitter', 'tweet', 'embed', 'social', 'sns'],
              category: 'media' as CategoryType,
              onSelect: () => {
                onInsertX()
              },
            }),
          ]
        : []),
      ...(onInsertTable
        ? [
            new ComponentPickerOption('テーブル', {
              icon: <Table className="h-4 w-4" />,
              keywords: ['table', 'grid', 'hyou', 'excel'],
              category: 'media' as CategoryType,
              onSelect: () => {
                onInsertTable()
              },
            }),
          ]
        : []),

      // ========== レイアウト ==========
      ...(onInsertLayout
        ? [
            new ComponentPickerOption('カラム', {
              icon: <Columns className="h-4 w-4" />,
              keywords: ['column', 'layout', 'grid', 'karamu', '2column', '3column'],
              category: 'layout' as CategoryType,
              onSelect: () => {
                onInsertLayout()
              },
            }),
          ]
        : []),

      // ========== テキスト変換 ==========
      new ComponentPickerOption('小文字', {
        icon: <CaseLower className="h-4 w-4" />,
        keywords: ['lowercase', 'komoji', 'small', 'lower'],
        category: 'format',
        onSelect: () => {
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'lowercase' as TextFormatType)
        },
      }),
      new ComponentPickerOption('大文字', {
        icon: <CaseUpper className="h-4 w-4" />,
        keywords: ['uppercase', 'oomoji', 'capital', 'upper'],
        category: 'format',
        onSelect: () => {
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'uppercase' as TextFormatType)
        },
      }),
      new ComponentPickerOption('先頭大文字', {
        icon: <CaseSensitive className="h-4 w-4" />,
        keywords: ['capitalize', 'sentou', 'title', 'titlecase'],
        category: 'format',
        onSelect: () => {
          editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'capitalize' as TextFormatType)
        },
      }),

      // ========== その他 ==========
      new ComponentPickerOption('区切り線', {
        icon: <Minus className="h-4 w-4" />,
        keywords: ['divider', 'hr', 'horizontal', 'kugirisenn', 'line'],
        category: 'other',
        onSelect: () => {
          editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)
        },
      }),
    ]

    // フィルタリング
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
  }, [editor, queryString, onInsertImage, onInsertYouTube, onInsertX, onInsertTable, onInsertLayout])

  // カテゴリー別にグループ化
  const groupedOptions = useMemo(() => {
    const groups: { category: CategoryType; options: ComponentPickerOption[] }[] = []
    const categoryOrder: CategoryType[] = ['basic', 'list', 'media', 'layout', 'format', 'other']

    for (const category of categoryOrder) {
      const categoryOptions = options.filter((opt) => opt.category === category)
      if (categoryOptions.length > 0) {
        groups.push({ category, options: categoryOptions })
      }
    }

    return groups
  }, [options])

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
