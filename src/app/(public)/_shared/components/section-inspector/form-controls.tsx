'use client'

/**
 * Section Inspector Form Controls
 *
 * インスペクターパネル用のフォームコンポーネント
 * 公開ページ専用（admin UIコンポーネントに依存しない）
 */

import { forwardRef, type ComponentPropsWithoutRef } from 'react'
import { cn } from '@/shared/lib/utils'

// =============================================================================
// Label
// =============================================================================

type LabelProps = ComponentPropsWithoutRef<'label'>

export function Label({ className, ...props }: LabelProps) {
  return (
    <label
      className={cn(
        'text-xs font-medium text-foreground',
        className
      )}
      {...props}
    />
  )
}

// =============================================================================
// Input
// =============================================================================

type InputProps = ComponentPropsWithoutRef<'input'>

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm',
          'shadow-sm transition-colors',
          'placeholder:text-muted-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

// =============================================================================
// Textarea
// =============================================================================

type TextareaProps = ComponentPropsWithoutRef<'textarea'>

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
          'shadow-sm transition-colors',
          'placeholder:text-muted-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = 'Textarea'

// =============================================================================
// Switch
// =============================================================================

type SwitchProps = {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  id?: string
  className?: string
}

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  id,
  className,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      id={id}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent',
        'shadow-sm transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-input',
        className
      )}
    >
      <span
        className={cn(
          'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0'
        )}
      />
    </button>
  )
}

// =============================================================================
// Number Input
// =============================================================================

type NumberInputProps = Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'onChange'> & {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  ({ className, value, onChange, min, max, ...props }, ref) => {
    return (
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const newValue = parseInt(e.target.value, 10)
          if (!Number.isNaN(newValue)) {
            onChange(newValue)
          }
        }}
        className={cn(
          'flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-sm',
          'shadow-sm transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
NumberInput.displayName = 'NumberInput'

// =============================================================================
// Save Button
// =============================================================================

type SaveButtonProps = {
  isPending: boolean
  onClick: () => void
  className?: string
}

export function SaveButton({ isPending, onClick, className }: SaveButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      className={cn(
        'w-full px-4 py-2 text-sm font-medium rounded-md',
        'bg-primary text-primary-foreground',
        'hover:bg-primary/90 transition-colors',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className
      )}
    >
      {isPending ? '保存中...' : '保存'}
    </button>
  )
}
