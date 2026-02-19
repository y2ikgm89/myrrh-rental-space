'use client'

/**
 * ページ操作メニュー
 *
 * 削除、公開/非公開切り替えなどの操作
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Eye, EyeOff, Trash2, ExternalLink } from 'lucide-react'
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from '@/admin/components/ActionDropdown'
import { DeleteConfirmDialog } from '@/admin/components/DeleteConfirmDialog'
import { deletePage, togglePagePublished } from '@/admin/actions/page'

type PageActionsProps = {
  slug: string
  title: string
  isPublished: boolean
  isSystemPage?: boolean
  isHomepage?: boolean
}

export function PageActions({ slug, title, isPublished, isSystemPage = false, isHomepage = false }: PageActionsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  const handleTogglePublished = () => {
    startTransition(async () => {
      const result = await togglePagePublished(slug)
      if (result.success) {
        toast.success(result.message)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deletePage(slug)
      if (result.success) {
        toast.success(result.message)
        setShowDeleteDialog(false)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  const handlePreview = () => {
    window.open(isHomepage ? '/' : `/${slug}`, '_blank')
  }

  return (
    <>
      <ActionDropdown disabled={isPending}>
        <ActionDropdownItem onClick={handlePreview}>
          <ExternalLink className="h-4 w-4 mr-2" />
          プレビュー
        </ActionDropdownItem>

        {!isHomepage && (
          <>
            <ActionDropdownSeparator />
            <ActionDropdownItem onClick={handleTogglePublished} disabled={isPending}>
              {isPublished ? (
                <>
                  <EyeOff className="h-4 w-4 mr-2" />
                  非公開にする
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  公開する
                </>
              )}
            </ActionDropdownItem>
          </>
        )}

        {!isSystemPage && !isHomepage && (
          <>
            <ActionDropdownSeparator />
            <ActionDropdownItem
              destructive
              onClick={() => setShowDeleteDialog(true)}
              disabled={isPending}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              削除
            </ActionDropdownItem>
          </>
        )}
      </ActionDropdown>

      <DeleteConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        itemName={`${title}（/${slug}）`}
        onConfirm={handleDelete}
        isPending={isPending}
      />
    </>
  )
}
