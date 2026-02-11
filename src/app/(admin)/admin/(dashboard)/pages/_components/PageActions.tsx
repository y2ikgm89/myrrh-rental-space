'use client'

/**
 * ページ操作メニュー
 *
 * 削除、公開/非公開切り替えなどの操作
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  MoreHorizontal,
  Eye,
  EyeOff,
  Trash2,
  ExternalLink,
  Loader2,
} from 'lucide-react'
import { Button } from '@/admin/components/ui'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/admin/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/admin/components/ui/alert-dialog'
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" disabled={isPending}>
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MoreHorizontal className="h-4 w-4" />
            )}
            <span className="sr-only">メニュー</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handlePreview}>
            <ExternalLink className="h-4 w-4 mr-2" />
            プレビュー
          </DropdownMenuItem>

          {!isHomepage && (
            <>
              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={handleTogglePublished} disabled={isPending}>
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
              </DropdownMenuItem>
            </>
          )}

          {!isSystemPage && !isHomepage && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowDeleteDialog(true)}
                className="text-destructive focus:text-destructive"
                disabled={isPending}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                削除
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ページを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              「{title}」（/{slug}）を削除します。
              <br />
              この操作は後から復元できます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  削除中...
                </>
              ) : (
                '削除する'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
