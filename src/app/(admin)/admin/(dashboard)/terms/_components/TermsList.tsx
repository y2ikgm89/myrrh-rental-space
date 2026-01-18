'use client'

/**
 * 規約一覧コンポーネント
 *
 * 規約のCRUD操作を提供するクライアントコンポーネント
 */

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { tv } from 'tailwind-variants'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/admin/components/ui'
import { deleteTerms, toggleTermsActive } from '@/admin/actions/terms'
import type { TermsWithVersion } from '@/shared/lib/validations/terms'

const styles = tv({
  slots: {
    termCard: 'overflow-hidden',
    termHeader: 'hover:bg-muted/50 transition-colors',
    termTitle: 'flex items-center gap-2',
    actions: 'flex items-center gap-1',
    emptyState: 'py-8 text-center text-muted-foreground',
    versionInfo: 'text-sm text-muted-foreground mt-1',
  },
})()

type TermsListProps = {
  terms: TermsWithVersion[]
}

export function TermsList({ terms }: TermsListProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingTerm, setDeletingTerm] = useState<{ id: string; title: string } | null>(null)

  const handleDelete = (id: string, title: string) => {
    setDeletingTerm({ id, title })
    setDeleteDialogOpen(true)
  }

  const confirmDelete = () => {
    if (!deletingTerm) return

    startTransition(async () => {
      const result = await deleteTerms(deletingTerm.id)

      if (result.success) {
        toast.success(result.message)
        router.refresh()
      } else {
        toast.error(result.error)
      }
      setDeleteDialogOpen(false)
      setDeletingTerm(null)
    })
  }

  const handleToggleActive = (id: string) => {
    startTransition(async () => {
      const result = await toggleTermsActive(id)
      if (result.success) {
        toast.success(result.message)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  if (terms.length === 0) {
    return (
      <Card>
        <CardContent className={styles.emptyState()}>
          <p>利用規約がまだ登録されていません</p>
          <Button asChild className="mt-4">
            <Link href="/admin/terms/new">最初の規約を作成</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="space-y-4">
        {terms.map((term) => (
          <Card key={term.id} className={styles.termCard()}>
            <CardHeader className={styles.termHeader()}>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className={styles.termTitle()}>
                    {term.title}
                    <Badge variant="outline" className="ml-2">
                      {term.type}
                    </Badge>
                    {!term.isActive && (
                      <Badge variant="secondary">無効</Badge>
                    )}
                  </CardTitle>
                  <p className={styles.versionInfo()}>
                    スラッグ: {term.slug}
                    {term.currentVersion && (
                      <> · バージョン {term.currentVersion.version}</>
                    )}
                    {!term.currentVersion && (
                      <span className="text-amber-600 ml-2">
                        (公開済みバージョンなし)
                      </span>
                    )}
                  </p>
                </div>
                <div className={styles.actions()}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleActive(term.id)}
                    disabled={isPending}
                  >
                    {term.isActive ? '無効化' : '有効化'}
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/admin/terms/${term.id}`}>
                      詳細・編集
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => handleDelete(term.id, term.title)}
                    disabled={isPending}
                  >
                    削除
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>規約を削除</DialogTitle>
            <DialogDescription>
              「{deletingTerm?.title}」を削除しますか？
              この規約を使用しているスペースがある場合は削除できません。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isPending}
            >
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={isPending}
            >
              {isPending ? '削除中...' : '削除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
