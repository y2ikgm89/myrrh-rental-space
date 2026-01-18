'use client'

/**
 * 規約バージョン作成・編集フォーム
 */

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'
import { Button, Label } from '@/admin/components/ui'
import { EDITOR_PROSE_CLASSES } from '@/shared/lib/styles/prose'

const LexicalEditor = dynamic(
  () => import('@/admin/components/editor/lexical/LexicalEditor').then((mod) => ({ default: mod.LexicalEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[400px] flex items-center justify-center border rounded-lg bg-muted/50">
        <div className="animate-pulse text-muted-foreground">エディタを読み込み中...</div>
      </div>
    ),
  }
)
import {
  createTermsVersion,
  updateTermsVersion,
} from '@/admin/actions/terms'
import type { TermsVersionDetail } from '@/shared/lib/validations/terms'

interface TermsVersionFormProps {
  termsId: string
  version?: TermsVersionDetail | null
  onSuccess?: () => void
  onCancel?: () => void
}

export function TermsVersionForm({
  termsId,
  version,
  onSuccess,
  onCancel,
}: TermsVersionFormProps) {
  const [isPending, startTransition] = useTransition()
  const [content, setContent] = useState(version?.content ?? '')

  const isEditing = !!version

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!content.trim()) {
      toast.error('規約内容を入力してください')
      return
    }

    startTransition(async () => {
      const result = isEditing
        ? await updateTermsVersion(version.id, { content })
        : await createTermsVersion({ termsId, content })

      if (result.success) {
        toast.success(result.message)
        onSuccess?.()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>規約内容 *</Label>
        <div className="min-h-[400px]">
          <LexicalEditor
            content={content}
            onChange={setContent}
            placeholder="規約の内容を入力してください..."
            className={EDITOR_PROSE_CLASSES}
            minHeight="400px"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          リッチテキストエディタを使用して規約内容を作成できます。
          見出し、リスト、表などの書式を使用できます。
        </p>
      </div>

      <div className="flex gap-2 justify-end pt-4">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isPending}
          >
            キャンセル
          </Button>
        )}
        <Button type="submit" disabled={isPending}>
          {isPending
            ? '保存中...'
            : isEditing
              ? 'バージョンを更新'
              : 'バージョンを作成'}
        </Button>
      </div>
    </form>
  )
}
