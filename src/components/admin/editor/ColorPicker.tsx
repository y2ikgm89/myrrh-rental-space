'use client'

/**
 * ColorPicker コンポーネント
 *
 * 文字色・背景色を選択するためのポップオーバー
 */

import { useState, useRef, useEffect } from 'react'
import type { Editor } from '@tiptap/react'
import { cn } from '@/lib/utils'

// プリセット色
const PRESET_COLORS = [
  // 基本色
  { name: '黒', value: '#000000' },
  { name: '白', value: '#ffffff' },
  { name: 'グレー', value: '#6b7280' },
  // 赤系
  { name: '赤', value: '#ef4444' },
  { name: 'ピンク', value: '#ec4899' },
  // オレンジ・黄系
  { name: 'オレンジ', value: '#f97316' },
  { name: '黄', value: '#eab308' },
  // 緑系
  { name: '緑', value: '#22c55e' },
  { name: 'ティール', value: '#14b8a6' },
  // 青系
  { name: '青', value: '#3b82f6' },
  { name: 'インディゴ', value: '#6366f1' },
  // 紫系
  { name: '紫', value: '#a855f7' },
]

interface ColorPickerProps {
  editor: Editor
  /** 'textColor' または 'highlight' */
  type: 'textColor' | 'highlight'
  /** ボタンのアイコン */
  icon: React.ReactNode
  /** ボタンのタイトル */
  title: string
}

export function ColorPicker({ editor, type, icon, title }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [customColor, setCustomColor] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  // 現在の色を取得
  const currentColor =
    type === 'textColor'
      ? editor.getAttributes('textStyle').color
      : editor.getAttributes('highlight').color

  // 外側クリックで閉じる
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 色を適用
  const applyColor = (color: string) => {
    if (type === 'textColor') {
      editor.chain().focus().setColor(color).run()
    } else {
      editor.chain().focus().toggleHighlight({ color }).run()
    }
    setIsOpen(false)
  }

  // 色をクリア
  const clearColor = () => {
    if (type === 'textColor') {
      editor.chain().focus().unsetColor().run()
    } else {
      editor.chain().focus().unsetHighlight().run()
    }
    setIsOpen(false)
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title={title}
        className={cn(
          'inline-flex h-8 w-8 items-center justify-center rounded text-sm font-medium transition-colors',
          'hover:bg-muted hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          currentColor && 'ring-1 ring-inset ring-border'
        )}
      >
        <div className="relative">
          {icon}
          {/* 現在の色インジケーター */}
          <div
            className="absolute -bottom-0.5 left-0.5 right-0.5 h-0.5 rounded-full"
            style={{ backgroundColor: currentColor || 'transparent' }}
          />
        </div>
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-lg border bg-background p-2 shadow-lg">
          {/* プリセット色グリッド */}
          <div className="grid grid-cols-6 gap-1 mb-2">
            {PRESET_COLORS.map((color) => (
              <button
                key={color.value}
                type="button"
                onClick={() => applyColor(color.value)}
                title={color.name}
                className={cn(
                  'h-6 w-6 rounded border border-border transition-transform hover:scale-110',
                  currentColor === color.value && 'ring-2 ring-ring ring-offset-1'
                )}
                style={{ backgroundColor: color.value }}
              />
            ))}
          </div>

          {/* カスタム色入力 */}
          <div className="flex items-center gap-1 mb-2">
            <input
              type="text"
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
              placeholder="#000000"
              className="h-7 flex-1 rounded border bg-background px-2 text-xs"
            />
            <button
              type="button"
              onClick={() => {
                if (customColor && /^#[0-9A-Fa-f]{6}$/.test(customColor)) {
                  applyColor(customColor)
                  setCustomColor('')
                }
              }}
              className="h-7 rounded bg-primary px-2 text-xs text-primary-foreground hover:bg-primary/90"
            >
              適用
            </button>
          </div>

          {/* クリアボタン */}
          <button
            type="button"
            onClick={clearColor}
            className="w-full rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            色をクリア
          </button>
        </div>
      )}
    </div>
  )
}
