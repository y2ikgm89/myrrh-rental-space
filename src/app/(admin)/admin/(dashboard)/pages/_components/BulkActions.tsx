'use client'

/**
 * ページ一括操作バー
 *
 * テーブル選択時にフローティング表示
 */

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Eye, EyeOff, Trash2, X, Loader2 } from 'lucide-react'
import { Button } from '@/admin/components/ui'
import { bulkTogglePagePublished, bulkDeletePages } from '@/admin/actions/page'

interface BulkActionsProps {
  selectedSlugs: string[]
  onClear: () => void
}

export function BulkActions({ selectedSlugs, onClear }: BulkActionsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  if (selectedSlugs.length === 0) return null

  const handleBulkPublish = (publish: boolean) => {
    startTransition(async () => {
      const result = await bulkTogglePagePublished(selectedSlugs, publish)
      if (result.success) {
        toast.success(result.message)
        onClear()
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  const handleBulkDelete = () => {
    startTransition(async () => {
      const result = await bulkDeletePages(selectedSlugs)
      if (result.success) {
        toast.success(result.message)
        onClear()
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-lg">
        <span className="text-sm font-medium">
          {selectedSlugs.length}件選択中
        </span>

        <div className="h-4 w-px bg-border" />

        <Button
          variant="outline"
          size="sm"
          onClick={() => handleBulkPublish(true)}
          disabled={isPending}
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
          一括公開
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => handleBulkPublish(false)}
          disabled={isPending}
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
          一括非公開
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleBulkDelete}
          disabled={isPending}
          className="text-destructive hover:text-destructive"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
          一括削除
        </Button>

        <div className="h-4 w-px bg-border" />

        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={isPending}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
