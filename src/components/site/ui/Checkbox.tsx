'use client'

import { cn } from '@/lib/utils'
import type { InputHTMLAttributes, ChangeEvent, Ref } from 'react'

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  onCheckedChange?: (checked: boolean) => void
  ref?: Ref<HTMLInputElement>
}

/**
 * Checkbox コンポーネント
 *
 * React 19: ref は通常の props として受け取る（forwardRef 不要）
 */
export function Checkbox({
  className,
  onCheckedChange,
  onChange,
  ref,
  ...props
}: CheckboxProps) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange?.(e)
    onCheckedChange?.(e.target.checked)
  }

  return (
    <input
      type="checkbox"
      className={cn(
        'h-4 w-4 shrink-0 rounded border border-primary',
        'ring-offset-background',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'accent-primary cursor-pointer',
        className
      )}
      ref={ref}
      onChange={handleChange}
      {...props}
    />
  )
}
