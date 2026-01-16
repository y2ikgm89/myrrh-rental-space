'use client'

/**
 * インラインタイトルエディター
 *
 * キャンバス上でタイトルを直接編集可能にするコンポーネント
 * contenteditable を使用したシンプルな実装
 */

import { useCallback, useEffect, useRef, type KeyboardEvent, type ChangeEvent } from 'react'
import { tv } from 'tailwind-variants'

const styles = tv({
  slots: {
    wrapper: 'mb-6',
    input: [
      'w-full text-3xl sm:text-4xl font-bold',
      'bg-transparent border-none outline-none',
      'text-foreground placeholder:text-muted-foreground/50',
      'focus:outline-none focus:ring-0',
      'resize-none overflow-hidden',
    ],
  },
})()

export type InlineTitleEditorProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
}

export function InlineTitleEditor({
  value,
  onChange,
  placeholder = 'タイトルを入力...',
  disabled = false,
}: InlineTitleEditorProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // 高さを自動調整
  const adjustHeight = useCallback(() => {
    const textarea = inputRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${textarea.scrollHeight}px`
    }
  }, [])

  // 初期値設定と高さ調整
  useEffect(() => {
    adjustHeight()
  }, [value, adjustHeight])

  // キーボードイベント処理
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enterキーで改行を防ぎ、次の要素にフォーカス
    if (e.key === 'Enter') {
      e.preventDefault()
      // Lexicalエディターにフォーカスを移動（data-lexical-editor属性で特定）
      const editor = document.querySelector('[data-lexical-editor="true"]')
      if (editor instanceof HTMLElement) {
        editor.focus()
      }
    }
  }

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value.replace(/\n/g, '') // 改行を除去
    onChange(newValue)
    adjustHeight()
  }

  return (
    <div className={styles.wrapper()}>
      <textarea
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className={styles.input()}
        aria-label="タイトル"
      />
    </div>
  )
}
