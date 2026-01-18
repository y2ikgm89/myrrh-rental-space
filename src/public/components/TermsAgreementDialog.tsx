'use client'

/**
 * TermsAgreementDialog
 *
 * 規約同意ダイアログコンポーネント
 * - スクロール完了検知によるチェックボックス活性化
 * - アクセシビリティ対応（WCAG 2.1 AA）
 * - キーボードナビゲーション対応
 */

import { useState, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/public/components/ui/Dialog'
import { Button } from '@/public/components/ui/Button'
import { Checkbox } from '@/public/components/ui/Checkbox'
import { SanitizedHtml } from '@/public/components/SanitizedHtml'
import { cn } from '@/shared/lib/utils'
import { PROSE_CLASSES } from '@/shared/lib/styles/prose'
import type { TermsWithVersion } from '@/shared/lib/validations/terms'

// =============================================================================
// Types
// =============================================================================

interface TermsAgreementDialogProps {
  /** ダイアログの開閉状態 */
  open: boolean
  /** 開閉状態の変更ハンドラ */
  onOpenChange: (open: boolean) => void
  /** 表示する規約データ */
  terms: TermsWithVersion
  /** 同意時のコールバック（規約IDとバージョンIDを返す） */
  onAgree: (termsId: string, versionId: string) => void | Promise<void>
  /** キャンセル時のコールバック */
  onDecline?: () => void
  /** ローディング状態 */
  loading?: boolean
}

// =============================================================================
// Constants
// =============================================================================

/** スクロール完了と判定する閾値（px） */
const SCROLL_THRESHOLD = 50

// =============================================================================
// Component
// =============================================================================

export function TermsAgreementDialog({
  open,
  onOpenChange,
  terms,
  onAgree,
  onDecline,
  loading = false,
}: TermsAgreementDialogProps) {
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false)
  const [isAgreed, setIsAgreed] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const checkboxRef = useRef<HTMLInputElement>(null)

  // ダイアログが開かれたときの初期化処理（Radix UIのonOpenAutoFocusで呼び出し）
  const handleDialogOpen = () => {
    setHasScrolledToBottom(false)
    setIsAgreed(false)
    // スクロールコンテナを先頭に戻す
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0
    }
    // コンテンツが短い場合は即座にスクロール完了とみなす
    requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        const container = scrollContainerRef.current
        const isContentShort = container.scrollHeight <= container.clientHeight + SCROLL_THRESHOLD
        if (isContentShort) {
          setHasScrolledToBottom(true)
        }
      }
    })
  }

  // スクロールイベントハンドラ
  const handleScroll = () => {
    if (!scrollContainerRef.current || hasScrolledToBottom) return

    const container = scrollContainerRef.current
    const { scrollTop, scrollHeight, clientHeight } = container
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight

    if (distanceFromBottom <= SCROLL_THRESHOLD) {
      setHasScrolledToBottom(true)
      // スクロール完了時にチェックボックスにフォーカスを移動（アクセシビリティ向上）
      setTimeout(() => {
        checkboxRef.current?.focus()
      }, 100)
    }
  }

  // 同意ボタンクリック
  const handleAgree = async () => {
    if (!terms.currentVersion || !isAgreed) return
    await onAgree(terms.id, terms.currentVersion.id)
  }

  // キャンセルボタンクリック
  const handleDecline = () => {
    onDecline?.()
    onOpenChange(false)
  }

  // 規約のバージョンがない場合はレンダリングしない
  if (!terms.currentVersion) {
    return null
  }

  const canAgree = hasScrolledToBottom && isAgreed && !loading

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl"
        showCloseButton={false}
        aria-describedby="terms-content"
        onOpenAutoFocus={handleDialogOpen}
      >
        <DialogHeader>
          <DialogTitle className="text-xl">{terms.title}</DialogTitle>
          <p className="text-sm text-gray-500">
            以下の内容をお読みいただき、同意の上ご予約ください。
          </p>
        </DialogHeader>

        {/* スクロール可能なコンテンツエリア */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className={cn(
            'relative overflow-y-auto',
            'max-h-[50vh] min-h-[200px]',
            'rounded-md border border-gray-200 bg-gray-50 p-4',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary'
          )}
          tabIndex={0}
          role="region"
          aria-label="規約内容"
          id="terms-content"
        >
          <SanitizedHtml
            html={terms.currentVersion.content}
            className={cn(PROSE_CLASSES, 'prose-sm')}
          />

          {/* スクロールインジケーター */}
          {!hasScrolledToBottom && (
            <div
              className={cn(
                'sticky bottom-0 left-0 right-0',
                'pointer-events-none',
                'bg-gradient-to-t from-gray-50 to-transparent',
                'h-12 flex items-end justify-center pb-2'
              )}
              aria-hidden="true"
            >
              <span className="text-xs text-gray-500 bg-gray-50 px-2 rounded">
                下までスクロールしてください
              </span>
            </div>
          )}
        </div>

        {/* 同意チェックボックス */}
        <div className="flex items-start gap-3 py-2">
          <Checkbox
            ref={checkboxRef}
            id="terms-agreement-checkbox"
            checked={isAgreed}
            onCheckedChange={setIsAgreed}
            disabled={!hasScrolledToBottom || loading}
            aria-describedby={!hasScrolledToBottom ? 'scroll-hint' : undefined}
          />
          <div className="flex flex-col gap-1">
            <label
              htmlFor="terms-agreement-checkbox"
              className={cn(
                'text-sm font-medium cursor-pointer select-none',
                !hasScrolledToBottom && 'text-gray-400'
              )}
            >
              上記の内容に同意します
            </label>
            {!hasScrolledToBottom && (
              <span id="scroll-hint" className="text-xs text-gray-400">
                規約を最後までお読みください
              </span>
            )}
          </div>
        </div>

        {/* フッターボタン */}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleDecline}
            disabled={loading}
          >
            キャンセル
          </Button>
          <Button
            type="button"
            onClick={handleAgree}
            disabled={!canAgree}
            aria-disabled={!canAgree}
          >
            {loading ? '処理中...' : '同意して進む'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
