'use client'

/**
 * タグ入力コンポーネント
 *
 * 機能:
 * - オートコンプリート（既存タグのサジェスト）
 * - インライン作成（新規タグをEnterで即作成）
 * - チップ表示（選択済みタグをバッジで表示）
 * - キーボード操作対応
 */

import { useState, useRef, useEffect } from 'react'
import { X, Plus, Check } from 'lucide-react'
import { Input, Label, Badge } from '@/admin/components/ui'
import { cn } from '@/shared/lib/utils'

// =============================================================================
// Types
// =============================================================================

export type TagOption = {
  id: string
  name: string
  slug: string
  _count?: { posts: number }
}

type TagInputProps = {
  /** 選択中のタグ名リスト */
  value: string[]
  /** タグ変更時のコールバック */
  onChange: (tags: string[]) => void
  /** 既存タグのリスト（サジェスト用） */
  availableTags: TagOption[]
  /** 新規タグ作成時のコールバック（スラッグも含めて作成） */
  onCreateTag?: (name: string) => Promise<TagOption | null>
  /** ラベル */
  label?: string
  /** プレースホルダー */
  placeholder?: string
  /** 無効状態 */
  disabled?: boolean
  /** エラーメッセージ */
  error?: string
  /** よく使うタグの最大表示数 */
  mostUsedLimit?: number
}

// =============================================================================
// Component
// =============================================================================

export function TagInput({
  value,
  onChange,
  availableTags,
  onCreateTag,
  label = 'タグ',
  placeholder = 'タグを入力...',
  disabled = false,
  error,
  mostUsedLimit = 5,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [isCreating, setIsCreating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // フィルタリング済みサジェスト
  const query = inputValue.toLowerCase().trim()
  const filteredSuggestions = query
    ? availableTags
        .filter(
          (tag) =>
            !value.includes(tag.name) &&
            (tag.name.toLowerCase().includes(query) ||
              tag.slug.toLowerCase().includes(query))
        )
        .slice(0, 10)
    : []

  // よく使うタグ（使用回数順、選択済み除外）
  const mostUsedTags = availableTags
    .filter((tag) => !value.includes(tag.name) && (tag._count?.posts ?? 0) > 0)
    .sort((a, b) => (b._count?.posts ?? 0) - (a._count?.posts ?? 0))
    .slice(0, mostUsedLimit)

  // 入力値が新規タグかどうか
  const trimmedInput = inputValue.trim()
  const isNewTag = trimmedInput
    ? !availableTags.some(
        (tag) => tag.name.toLowerCase() === trimmedInput.toLowerCase()
      ) &&
      !value.some((v) => v.toLowerCase() === trimmedInput.toLowerCase())
    : false

  // サジェストリスト（フィルタ結果 + 新規作成オプション）
  const suggestions: Array<{ type: 'existing' | 'create'; tag?: TagOption; name?: string }> = [
    ...filteredSuggestions.map((tag) => ({ type: 'existing' as const, tag })),
    ...(isNewTag && trimmedInput ? [{ type: 'create' as const, name: trimmedInput }] : []),
  ]

  // タグ追加
  const addTag = (tagName: string) => {
    const trimmed = tagName.trim()
    if (!trimmed) return
    if (value.some((v) => v.toLowerCase() === trimmed.toLowerCase())) return

    onChange([...value, trimmed])
    setInputValue('')
    setHighlightedIndex(-1)
    inputRef.current?.focus()
  }

  // 新規タグ作成して追加
  const createAndAddTag = async (name: string) => {
    if (!onCreateTag || isCreating) return

    setIsCreating(true)
    try {
      const newTag = await onCreateTag(name)
      if (newTag) {
        addTag(newTag.name)
      }
    } finally {
      setIsCreating(false)
    }
  }

  // タグ削除
  const removeTag = (tagName: string) => {
    onChange(value.filter((v) => v !== tagName))
    inputRef.current?.focus()
  }

  // キーボード操作
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (suggestions.length > 0) {
          setIsOpen(true)
          setHighlightedIndex((prev) =>
            prev < suggestions.length - 1 ? prev + 1 : 0
          )
        }
        break

      case 'ArrowUp':
        e.preventDefault()
        if (suggestions.length > 0) {
          setIsOpen(true)
          setHighlightedIndex((prev) =>
            prev > 0 ? prev - 1 : suggestions.length - 1
          )
        }
        break

      case 'Enter':
        e.preventDefault()
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          const item = suggestions[highlightedIndex]
          if (!item) break
          if (item.type === 'existing' && item.tag) {
            addTag(item.tag.name)
          } else if (item.type === 'create' && item.name) {
            if (onCreateTag) {
              void createAndAddTag(item.name)
            } else {
              addTag(item.name)
            }
          }
        } else if (inputValue.trim()) {
          // 直接入力で追加
          const trimmed = inputValue.trim()
          const existingTag = availableTags.find(
            (t) => t.name.toLowerCase() === trimmed.toLowerCase()
          )
          if (existingTag) {
            addTag(existingTag.name)
          } else if (onCreateTag) {
            void createAndAddTag(trimmed)
          } else {
            addTag(trimmed)
          }
        }
        setIsOpen(false)
        break

      case 'Escape':
        setIsOpen(false)
        setHighlightedIndex(-1)
        break

      case 'Backspace': {
        const lastTag = value[value.length - 1]
        if (!inputValue && lastTag) {
          removeTag(lastTag)
        }
        break
      }
    }
  }

  // 外側クリックでドロップダウンを閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        e.target instanceof Node && !containerRef.current.contains(e.target)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 入力変更時にドロップダウンを開く
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
    setIsOpen(true)
    setHighlightedIndex(-1)
  }

  return (
    <div className="space-y-2" ref={containerRef}>
      {label && <Label>{label}</Label>}

      {/* 選択済みタグ */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tagName) => (
            <Badge
              key={tagName}
              variant="secondary"
              className="gap-1 pr-1"
            >
              {tagName}
              <button
                type="button"
                onClick={() => removeTag(tagName)}
                disabled={disabled}
                className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
                aria-label={`${tagName}を削除`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* 入力フィールド */}
      <div className="relative">
        <Input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          disabled={disabled || isCreating}
          aria-label={label}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          autoComplete="off"
        />

        {/* サジェストドロップダウン */}
        {isOpen && (suggestions.length > 0 || mostUsedTags.length > 0) && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
            <div className="max-h-[200px] overflow-y-auto p-1">
              {/* サジェスト結果 */}
              {suggestions.length > 0 && (
                <div>
                  {inputValue.trim() && (
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                      候補
                    </div>
                  )}
                  {suggestions.map((item, index) => (
                    <button
                      key={item.type === 'existing' ? item.tag?.id : 'create'}
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
                        'hover:bg-accent hover:text-accent-foreground',
                        highlightedIndex === index && 'bg-accent text-accent-foreground'
                      )}
                      onClick={() => {
                        if (item.type === 'existing' && item.tag) {
                          addTag(item.tag.name)
                        } else if (item.type === 'create' && item.name) {
                          if (onCreateTag) {
                            void createAndAddTag(item.name)
                          } else {
                            addTag(item.name)
                          }
                        }
                        setIsOpen(false)
                      }}
                      disabled={isCreating}
                    >
                      {item.type === 'existing' ? (
                        <>
                          <Check className="h-4 w-4 opacity-0" />
                          <span>{item.tag?.name}</span>
                          {item.tag?._count?.posts !== undefined && (
                            <span className="ml-auto text-xs text-muted-foreground">
                              {item.tag._count.posts}件
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          <Plus className="h-4 w-4 text-primary" />
                          <span>
                            「{item.name}」を作成
                          </span>
                        </>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* よく使うタグ（入力がない場合） */}
              {!inputValue.trim() && mostUsedTags.length > 0 && (
                <div>
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                    よく使うタグ
                  </div>
                  {mostUsedTags.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
                        'hover:bg-accent hover:text-accent-foreground'
                      )}
                      onClick={() => {
                        addTag(tag.name)
                        setIsOpen(false)
                      }}
                      disabled={disabled}
                    >
                      <Check className="h-4 w-4 opacity-0" />
                      <span>{tag.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {tag._count?.posts ?? 0}件
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ヘルプテキスト */}
      <p className="text-xs text-muted-foreground">
        タグを入力してEnterで追加。存在しないタグは新規作成されます。
      </p>

      {/* エラー */}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
