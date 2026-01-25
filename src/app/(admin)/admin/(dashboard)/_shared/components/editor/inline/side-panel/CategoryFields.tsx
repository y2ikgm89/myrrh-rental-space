'use client'

/**
 * カテゴリ選択フィールド
 *
 * 機能:
 * - 既存カテゴリからの選択
 * - 新規カテゴリのインライン作成（オプション）
 */

import { useState } from 'react'
import type { FieldValues, Path } from 'react-hook-form'
import { useWatch } from 'react-hook-form'
import { Plus } from 'lucide-react'
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Button,
  Input,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/admin/components/ui'
import { getFieldError, getErrorMessage } from '../types'
import type { FieldComponentProps } from '../content-types/types'
import { generateSlug } from '@/shared/lib/utils'

// =============================================================================
// Constants
// =============================================================================

/**
 * Select.Item は空文字列を value として許可しないため、
 * 「なし」選択用の特別な値を定義
 */
const SELECT_NONE_VALUE = '__none__'

// =============================================================================
// Types
// =============================================================================

export type CategoryOption = {
  id: string
  name: string
  slug?: string
}

type CategoryFieldsProps<T extends FieldValues> = FieldComponentProps<T> & {
  /** フィールド名マッピング */
  fields: {
    categoryId: Path<T>
  }
  /** カテゴリオプション */
  categories: CategoryOption[]
  /** ラベル */
  label?: string
  /** プレースホルダー */
  placeholder?: string
  /** オプション: なしを選択可能にするか */
  allowEmpty?: boolean
  /** なしのラベル */
  emptyLabel?: string
  /** 新規カテゴリ作成時のコールバック（設定すると作成ボタンが表示される） */
  onCreateCategory?: (name: string) => Promise<CategoryOption | null>
}

// =============================================================================
// Component
// =============================================================================

export function CategoryFields<T extends FieldValues>({
  control,
  setValue,
  errors,
  disabled,
  fields,
  categories,
  label = 'カテゴリ',
  placeholder = 'カテゴリを選択',
  allowEmpty = false,
  emptyLabel = 'なし',
  onCreateCategory,
}: CategoryFieldsProps<T>) {
  const rawCategoryId = useWatch({ control, name: fields.categoryId })
  // useWatch の戻り値を安全に文字列として取得
  const categoryId = typeof rawCategoryId === 'string' ? rawCategoryId : ''
  const categoryError = getFieldError(errors, fields.categoryId)

  // 新規作成ダイアログ
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const handleCreateCategory = async () => {
    if (!onCreateCategory || !newCategoryName.trim()) return

    setIsCreating(true)
    setCreateError(null)

    try {
      const newCategory = await onCreateCategory(newCategoryName.trim())
      if (newCategory) {
        // react-hook-form のジェネリック型制約により型パラメータが必要
        setValue(fields.categoryId, newCategory.id as T[Path<T>], { shouldDirty: true })
        setIsDialogOpen(false)
        setNewCategoryName('')
      }
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : 'カテゴリの作成に失敗しました'
      )
    } finally {
      setIsCreating(false)
    }
  }

  const handleDialogClose = () => {
    setIsDialogOpen(false)
    setNewCategoryName('')
    setCreateError(null)
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={fields.categoryId}>{label}</Label>

      <div className="flex gap-2">
        <Select
          value={categoryId || (allowEmpty ? SELECT_NONE_VALUE : '')}
          onValueChange={(value) => {
            const newValue = value === SELECT_NONE_VALUE ? '' : value
            // react-hook-form のジェネリック型制約により型パラメータが必要
            setValue(fields.categoryId, newValue as T[Path<T>], { shouldDirty: true })
          }}
          disabled={disabled}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {allowEmpty && <SelectItem value={SELECT_NONE_VALUE}>{emptyLabel}</SelectItem>}
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 新規作成ボタン */}
        {onCreateCategory && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setIsDialogOpen(true)}
            disabled={disabled}
            aria-label="新規カテゴリを作成"
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>

      {categoryError && (
        <p className="text-sm text-destructive">{getErrorMessage(categoryError)}</p>
      )}

      {/* 新規作成ダイアログ */}
      <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>新規カテゴリを作成</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-category-name">カテゴリ名</Label>
              <Input
                id="new-category-name"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="カテゴリ名を入力"
                disabled={isCreating}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newCategoryName.trim()) {
                    e.preventDefault()
                    void handleCreateCategory()
                  }
                }}
              />
              {newCategoryName.trim() && (
                <p className="text-xs text-muted-foreground">
                  スラッグ: {generateSlug(newCategoryName, 'category')}
                </p>
              )}
            </div>

            {createError && (
              <p className="text-sm text-destructive">{createError}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleDialogClose}
              disabled={isCreating}
            >
              キャンセル
            </Button>
            <Button
              type="button"
              onClick={handleCreateCategory}
              disabled={isCreating || !newCategoryName.trim()}
            >
              {isCreating ? '作成中...' : '作成'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
