'use client'

import { cn } from '@/shared/lib/utils'

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  onCheckedChange?: (checked: boolean) => void
  ref?: React.Ref<HTMLInputElement>
}

function Checkbox({
  className,
  onCheckedChange,
  onChange,
  ref,
  ...props
}: CheckboxProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(e)
    onCheckedChange?.(e.target.checked)
  }

  return (
    <input
      type="checkbox"
      className={cn(
        'h-4 w-4 shrink-0 cursor-pointer rounded border border-primary',
        'ring-offset-background transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'accent-primary',
        className
      )}
      ref={ref}
      onChange={handleChange}
      {...props}
    />
  )
}

export { Checkbox }
