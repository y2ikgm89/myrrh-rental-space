'use client'

/**
 * メディアフィルター
 */

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, Grid, List, Upload } from 'lucide-react'
import { Button, Input } from '@/admin/components/ui'
import { MediaUploadDialog } from './MediaUploadDialog'
import { TYPE_OPTIONS, USAGE_FILTER_OPTIONS } from './constants'

export function MediaFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [isUploadOpen, setIsUploadOpen] = useState(false)

  const currentType = searchParams.get('type') || ''
  const currentUsage = searchParams.get('usage') || ''
  const currentSearch = searchParams.get('search') || ''
  const currentView = searchParams.get('view') || 'grid'
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function updateParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())

    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '') {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    }

    // Reset page when filter changes
    if (!('page' in updates)) {
      params.delete('page')
    }

    startTransition(() => {
      router.push(`/admin/media?${params.toString()}`)
    })
  }

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    searchTimeoutRef.current = setTimeout(() => {
      updateParams({ search: value || null })
    }, 300)
  }

  // アンマウント時にタイムアウトをクリーンアップ
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [])

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        {/* Left: Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="検索..."
              defaultValue={currentSearch}
              onChange={handleSearchChange}
              className="w-48 pl-9"
            />
          </div>

          {/* Type Filter */}
          <select
            value={currentType}
            onChange={(e) => updateParams({ type: e.target.value || null })}
            disabled={isPending}
            className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Usage Filter */}
          <select
            value={currentUsage}
            onChange={(e) => updateParams({ usage: e.target.value || null })}
            disabled={isPending}
            className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {USAGE_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Right: View Toggle & Upload */}
        <div className="flex gap-2 items-center">
          {/* View Toggle */}
          <div className="flex border rounded-md overflow-hidden">
            <button
              type="button"
              onClick={() => updateParams({ view: 'grid' })}
              className={`p-2 ${
                currentView === 'grid'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background hover:bg-muted'
              }`}
              aria-label="グリッド表示"
            >
              <Grid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => updateParams({ view: 'list' })}
              className={`p-2 ${
                currentView === 'list'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background hover:bg-muted'
              }`}
              aria-label="リスト表示"
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          {/* Upload Button */}
          <Button onClick={() => setIsUploadOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            アップロード
          </Button>
        </div>
      </div>

      <MediaUploadDialog
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
      />
    </>
  )
}
