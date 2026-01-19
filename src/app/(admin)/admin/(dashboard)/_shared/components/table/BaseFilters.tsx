'use client'

/**
 * ベースフィルターコンポーネント
 *
 * 管理画面の一覧ページで共通するフィルターUI
 * - ステータスセレクト
 * - 検索入力（デバウンス付き）
 * - isPending 状態表示
 */

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition, useRef, useEffect, type ReactNode } from 'react'
import { Search } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Input,
} from '@/admin/components/ui'

// =============================================================================
// Types
// =============================================================================

type StatusOption = {
  value: string
  label: string
}

type BaseFiltersProps = {
  /** 現在のパス（例: '/admin/news'） */
  basePath: string
  /** ステータスオプション */
  statusOptions?: StatusOption[]
  /** ステータスパラメータ名（デフォルト: 'status'） */
  statusParamName?: string
  /** 検索プレースホルダー */
  searchPlaceholder?: string
  /** 保持するパラメータ（例: { tab: 'locations' }） */
  preserveParams?: Record<string, string>
  /** 追加フィルター（カテゴリなど） */
  children?: ReactNode
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_STATUS_OPTIONS: StatusOption[] = [
  { value: 'ALL', label: 'すべて' },
  { value: 'PUBLISHED', label: '公開中' },
  { value: 'DRAFT', label: '下書き' },
]

const DEBOUNCE_MS = 300

// =============================================================================
// BaseFilters Component
// =============================================================================

export function BaseFilters({
  basePath,
  statusOptions = DEFAULT_STATUS_OPTIONS,
  statusParamName = 'status',
  searchPlaceholder = 'タイトル、本文で検索...',
  preserveParams,
  children,
}: BaseFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currentStatus = searchParams.get(statusParamName) || 'ALL'
  const currentSearch = searchParams.get('search') || ''

  // アンマウント時にタイムアウトをクリーンアップ
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [])

  function updateParams(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== 'ALL') {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    // ページを1にリセット
    params.delete('page')

    // 保持するパラメータを設定
    if (preserveParams) {
      for (const [paramKey, paramValue] of Object.entries(preserveParams)) {
        params.set(paramKey, paramValue)
      }
    }

    startTransition(() => {
      router.push(`${basePath}?${params.toString()}`)
    })
  }

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value

    // 既存のタイムアウトをクリア
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    // デバウンス処理
    searchTimeoutRef.current = setTimeout(() => {
      updateParams('search', value)
    }, DEBOUNCE_MS)
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      {/* ステータスフィルター（オプションがある場合のみ表示） */}
      {statusOptions.length > 0 && (
        <div className="w-full sm:w-48">
          <Select
            value={currentStatus}
            onValueChange={(value) => updateParams(statusParamName, value)}
            disabled={isPending}
          >
            <SelectTrigger>
              <SelectValue placeholder="ステータス" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* 追加フィルター（カテゴリなど） */}
      {children}

      {/* 検索 */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder={searchPlaceholder}
          defaultValue={currentSearch}
          onChange={handleSearchChange}
          disabled={isPending}
          className="pl-9"
        />
      </div>

      {isPending && (
        <div className="text-sm text-muted-foreground">読み込み中...</div>
      )}
    </div>
  )
}

// =============================================================================
// Re-export types for consumers
// =============================================================================

export type { StatusOption, BaseFiltersProps }
