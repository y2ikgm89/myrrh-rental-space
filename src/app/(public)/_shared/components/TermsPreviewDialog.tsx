'use client'

/**
 * TermsPreviewDialog
 *
 * 規約プレビューダイアログコンポーネント
 * - シンプルな表示のみ（スクロール検知なし）
 * - 閉じるボタンのみ（同意ボタンなし）
 * - サイト全体の利用規約・プライバシーポリシーの閲覧用
 *
 * @see TermsAgreementDialog - スペース固有規約用（スクロール検知あり）
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/public/components/ui/Dialog'
import { Button } from '@/public/components/ui/Button'
import { SanitizedHtml } from '@/public/components/SanitizedHtml'
import { cn } from '@/shared/lib/utils'
import { PROSE_CLASSES } from '@/shared/lib/styles/prose'

// =============================================================================
// Types
// =============================================================================

interface TermsPreviewDialogProps {
  /** ダイアログの開閉状態 */
  open: boolean
  /** 開閉状態の変更ハンドラ */
  onOpenChange: (open: boolean) => void
  /** ダイアログのタイトル */
  title: string
  /** 表示するHTMLコンテンツ */
  content: string
  /** ローディング状態 */
  loading?: boolean
}

// =============================================================================
// Component
// =============================================================================

export function TermsPreviewDialog({
  open,
  onOpenChange,
  title,
  content,
  loading = false,
}: TermsPreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl"
        aria-describedby="terms-preview-content"
      >
        <DialogHeader>
          <DialogTitle className="text-xl">{title}</DialogTitle>
        </DialogHeader>

        {/* スクロール可能なコンテンツエリア */}
        <div
          className={cn(
            'relative overflow-y-auto',
            'max-h-[60vh] min-h-[200px]',
            'rounded-md border border-gray-200 bg-gray-50 p-4',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'
          )}
          tabIndex={0}
          role="region"
          aria-label={title}
          id="terms-preview-content"
        >
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : (
            <SanitizedHtml
              html={content}
              className={cn(PROSE_CLASSES, 'prose-sm')}
            />
          )}
        </div>

        {/* フッターボタン */}
        <DialogFooter>
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
          >
            閉じる
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
