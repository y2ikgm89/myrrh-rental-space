'use client'

/**
 * CTAボタン配列エディタ
 *
 * ボタンの追加・削除・並べ替え・各プロパティ編集を提供する共有コンポーネント。
 * 管理画面エディタとインスペクタパネルの両方で使用。
 *
 * CSS変数に依存しないスタイリング（src/shared/ 配置のため）
 */

import { ArrowUp, ArrowDown, Trash2, Plus } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import type {
  CTAButtonItem,
  CTAButtonVariant,
  CTAButtonSize,
} from '@/shared/lib/validations/section-design'
import {
  ctaButtonVariants,
  ctaButtonSizes,
  isValidHexColor,
} from '@/shared/lib/validations/section-design'

// =============================================================================
// 定数
// =============================================================================

const VARIANT_LABELS: Record<CTAButtonVariant, string> = {
  primary: 'プライマリ',
  secondary: 'セカンダリ',
  outline: 'アウトライン',
  ghost: 'ゴースト',
}

const SIZE_LABELS: Record<CTAButtonSize, string> = {
  sm: 'S',
  md: 'M',
  lg: 'L',
}

const DEFAULT_BUTTON: CTAButtonItem = {
  text: '',
  url: '',
  variant: 'primary',
  size: 'lg',
  openInNewTab: false,
}

// =============================================================================
// コンポーネント
// =============================================================================

interface CTAButtonEditorProps {
  buttons: CTAButtonItem[]
  onChange: (buttons: CTAButtonItem[]) => void
  maxButtons?: number
  disabled?: boolean
  /** コンパクト表示（インスペクタパネル用） */
  compact?: boolean
}

export function CTAButtonEditor({
  buttons,
  onChange,
  maxButtons = 5,
  disabled = false,
  compact = false,
}: CTAButtonEditorProps) {
  const updateButton = (index: number, updates: Partial<CTAButtonItem>) => {
    const next = buttons.map((btn, i) =>
      i === index ? { ...btn, ...updates } : btn
    )
    onChange(next)
  }

  const removeButton = (index: number) => {
    onChange(buttons.filter((_, i) => i !== index))
  }

  const moveButton = (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= buttons.length) return
    const next = [...buttons]
    const temp = next[index]
    next[index] = next[target]
    next[target] = temp
    onChange(next)
  }

  const addButton = () => {
    if (buttons.length >= maxButtons) return
    // 2番目以降はsecondaryをデフォルトに
    const variant: CTAButtonVariant = buttons.length === 0 ? 'primary' : 'secondary'
    onChange([...buttons, { ...DEFAULT_BUTTON, variant }])
  }

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {buttons.map((button, index) => (
        <ButtonItemEditor
          key={index}
          button={button}
          index={index}
          total={buttons.length}
          disabled={disabled}
          compact={compact}
          onUpdate={(updates) => updateButton(index, updates)}
          onRemove={() => removeButton(index)}
          onMove={(dir) => moveButton(index, dir)}
        />
      ))}

      {buttons.length < maxButtons && (
        <button
          type="button"
          onClick={addButton}
          disabled={disabled}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-current/20 px-3 py-2 text-sm opacity-70 transition-opacity hover:opacity-100 disabled:pointer-events-none disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
          ボタンを追加
        </button>
      )}
    </div>
  )
}

// =============================================================================
// 個別ボタンエディタ
// =============================================================================

interface ButtonItemEditorProps {
  button: CTAButtonItem
  index: number
  total: number
  disabled: boolean
  compact: boolean
  onUpdate: (updates: Partial<CTAButtonItem>) => void
  onRemove: () => void
  onMove: (direction: 'up' | 'down') => void
}

function ButtonItemEditor({
  button,
  index,
  total,
  disabled,
  compact,
  onUpdate,
  onRemove,
  onMove,
}: ButtonItemEditorProps) {
  const inputClass = compact
    ? 'w-full rounded border border-current/15 bg-transparent px-2 py-1 text-sm outline-none focus:border-current/40'
    : 'w-full rounded-md border border-current/15 bg-transparent px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-current/30'

  const selectClass = compact
    ? 'rounded border border-current/15 bg-transparent px-1.5 py-1 text-xs outline-none'
    : 'rounded-md border border-current/15 bg-transparent px-2 py-1.5 text-sm outline-none'

  const iconBtnClass =
    'inline-flex items-center justify-center rounded p-1 opacity-60 transition-opacity hover:opacity-100 disabled:pointer-events-none disabled:opacity-30'

  return (
    <div className="rounded-md border border-current/10 p-3">
      {/* ヘッダー: 番号 + variant/size + 移動/削除 */}
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-medium opacity-60">#{index + 1}</span>

        <select
          value={button.variant}
          onChange={(e) => {
            const parsed = ctaButtonVariants.find((v) => v === e.target.value)
            if (parsed) onUpdate({ variant: parsed })
          }}
          disabled={disabled}
          className={selectClass}
        >
          {ctaButtonVariants.map((v) => (
            <option key={v} value={v}>
              {VARIANT_LABELS[v]}
            </option>
          ))}
        </select>

        <select
          value={button.size}
          onChange={(e) => {
            const parsed = ctaButtonSizes.find((s) => s === e.target.value)
            if (parsed) onUpdate({ size: parsed })
          }}
          disabled={disabled}
          className={selectClass}
        >
          {ctaButtonSizes.map((s) => (
            <option key={s} value={s}>
              {SIZE_LABELS[s]}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => onMove('up')}
            disabled={disabled || index === 0}
            className={iconBtnClass}
            aria-label="上に移動"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMove('down')}
            disabled={disabled || index === total - 1}
            className={iconBtnClass}
            aria-label="下に移動"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className={iconBtnClass}
            aria-label="削除"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* テキスト & URL */}
      <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
        <div>
          <label className="mb-0.5 block text-xs opacity-60">テキスト</label>
          <input
            type="text"
            value={button.text}
            onChange={(e) => onUpdate({ text: e.target.value })}
            disabled={disabled}
            placeholder="ボタンテキスト"
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-0.5 block text-xs opacity-60">URL</label>
          <input
            type="text"
            value={button.url}
            onChange={(e) => onUpdate({ url: e.target.value })}
            disabled={disabled}
            placeholder="/reservation"
            className={inputClass}
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={button.openInNewTab}
            onChange={(e) => onUpdate({ openInNewTab: e.target.checked })}
            disabled={disabled}
            className="rounded"
          />
          <span className="opacity-70">新しいタブで開く</span>
        </label>

        {/* カスタムカラー（折りたたみ） */}
        <details className="group">
          <summary className="cursor-pointer select-none text-xs opacity-60 transition-opacity hover:opacity-100">
            <span className="ml-0.5">カスタムカラー</span>
            {(button.backgroundColor || button.textColor) && (
              <span className="ml-1.5 inline-flex items-center gap-1">
                {button.backgroundColor && (
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm border border-current/20"
                    style={{ backgroundColor: button.backgroundColor }}
                  />
                )}
                {button.textColor && (
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm border border-current/20"
                    style={{ backgroundColor: button.textColor }}
                  />
                )}
              </span>
            )}
          </summary>
          <div className="mt-1.5 space-y-1.5 rounded border border-current/10 p-2">
            <ColorInput
              label="背景色"
              value={button.backgroundColor ?? ''}
              onChange={(v) => onUpdate({ backgroundColor: v || undefined })}
              disabled={disabled}
              compact={compact}
            />
            <ColorInput
              label="文字色"
              value={button.textColor ?? ''}
              onChange={(v) => onUpdate({ textColor: v || undefined })}
              disabled={disabled}
              compact={compact}
            />
            <p className="text-[10px] opacity-40">
              空欄 = バリアントのデフォルト色
            </p>
          </div>
        </details>
      </div>
    </div>
  )
}

// =============================================================================
// カラー入力
// =============================================================================

interface ColorInputProps {
  label: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
  compact: boolean
}

function ColorInput({ label, value, onChange, disabled, compact }: ColorInputProps) {
  const valid = isValidHexColor(value)

  return (
    <div>
      <label className="mb-0.5 block text-[10px] opacity-50">{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="#000000"
          maxLength={7}
          className={cn(
            compact
              ? 'w-full rounded border bg-transparent px-2 py-0.5 font-mono text-xs outline-none'
              : 'w-full rounded-md border bg-transparent px-2 py-1 font-mono text-xs outline-none',
            valid ? 'border-current/15 focus:border-current/40' : 'border-destructive'
          )}
        />
        {value && valid && (
          <span
            className="inline-block h-5 w-5 shrink-0 rounded border border-current/20"
            style={{ backgroundColor: value }}
          />
        )}
      </div>
    </div>
  )
}
