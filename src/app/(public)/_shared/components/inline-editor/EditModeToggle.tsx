'use client'

/**
 * 編集モード切替ボタン
 *
 * 管理者ユーザーのみに表示されるフローティングボタン
 * クリックで編集モードをトグル
 */

import { useTransition } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Pencil, X, Loader2, Save, Check } from 'lucide-react'
import { tv } from 'tailwind-variants'
import type { ReactElement } from 'react'

// =============================================================================
// Styles
// =============================================================================

const styles = tv({
  slots: {
    container: 'fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3',
    button: [
      'flex items-center gap-2 px-4 py-3 rounded-full',
      'font-medium shadow-lg transition-all duration-200',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    ],
    editButton: [
      'bg-primary text-primary-foreground',
      'hover:bg-primary/90 hover:shadow-xl hover:scale-105',
    ],
    cancelButton: [
      'bg-muted text-muted-foreground',
      'hover:bg-muted/80',
    ],
    saveButton: [
      'bg-success text-success-foreground',
      'hover:bg-success/90',
    ],
    savingButton: [
      'bg-success/70 text-success-foreground cursor-not-allowed',
    ],
    savedButton: [
      'bg-success text-success-foreground',
    ],
    iconWrapper: 'shrink-0',
    label: 'text-sm whitespace-nowrap',
    savingIndicator: 'animate-spin',
  },
})()

// =============================================================================
// Types
// =============================================================================

export type EditModeToggleProps = {
  /** 現在編集モードかどうか */
  isEditMode: boolean
  /** 保存中かどうか */
  isSaving?: boolean
  /** 保存完了したかどうか */
  isSaved?: boolean
  /** 保存ハンドラー */
  onSave?: () => Promise<void>
}

// =============================================================================
// Component
// =============================================================================

export function EditModeToggle({
  isEditMode,
  isSaving = false,
  isSaved = false,
  onSave,
}: EditModeToggleProps): ReactElement {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const handleToggleEditMode = () => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString())

      if (isEditMode) {
        // 編集モードを終了
        params.delete('edit')
      } else {
        // 編集モードを開始
        params.set('edit', 'true')
      }

      const queryString = params.toString()
      router.push(`${pathname}${queryString ? `?${queryString}` : ''}`)
    })
  }

  const handleSave = async () => {
    if (onSave) {
      await onSave()
    }
  }

  if (!isEditMode) {
    // 編集開始ボタン
    return (
      <div className={styles.container()}>
        <button
          type="button"
          onClick={handleToggleEditMode}
          disabled={isPending}
          className={`${styles.button()} ${styles.editButton()}`}
          aria-label="このページを編集"
        >
          <span className={styles.iconWrapper()}>
            {isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
            ) : (
              <Pencil className="w-5 h-5" aria-hidden="true" />
            )}
          </span>
          <span className={styles.label()}>編集</span>
        </button>
      </div>
    )
  }

  // 編集モード中のボタン群
  return (
    <div className={styles.container()}>
      {/* 保存ボタン */}
      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving}
        className={`${styles.button()} ${
          isSaved
            ? styles.savedButton()
            : isSaving
              ? styles.savingButton()
              : styles.saveButton()
        }`}
        aria-label={isSaved ? '保存完了' : isSaving ? '保存中' : '変更を保存'}
      >
        <span className={styles.iconWrapper()}>
          {isSaved ? (
            <Check className="w-5 h-5" aria-hidden="true" />
          ) : isSaving ? (
            <Loader2 className={`w-5 h-5 ${styles.savingIndicator()}`} aria-hidden="true" />
          ) : (
            <Save className="w-5 h-5" aria-hidden="true" />
          )}
        </span>
        <span className={styles.label()}>
          {isSaved ? '保存完了' : isSaving ? '保存中...' : '保存'}
        </span>
      </button>

      {/* 編集終了ボタン */}
      <button
        type="button"
        onClick={handleToggleEditMode}
        disabled={isPending || isSaving}
        className={`${styles.button()} ${styles.cancelButton()}`}
        aria-label="編集を終了"
      >
        <span className={styles.iconWrapper()}>
          {isPending ? (
            <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
          ) : (
            <X className="w-5 h-5" aria-hidden="true" />
          )}
        </span>
        <span className={styles.label()}>閉じる</span>
      </button>
    </div>
  )
}
