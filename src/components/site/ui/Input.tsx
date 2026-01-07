import { tv, type VariantProps } from 'tailwind-variants'
import { cn } from '@/lib/utils'

const inputVariants = tv({
  base: 'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
  variants: {
    size: {
      sm: 'h-9',
      md: 'h-10',
      lg: 'h-11',
    },
  },
  defaultVariants: {
    size: 'md',
  },
})

type InputProps = React.ComponentPropsWithoutRef<'input'> &
  VariantProps<typeof inputVariants>

export function Input({ className, size, ...props }: InputProps) {
  return <input className={cn(inputVariants({ size }), className)} {...props} />
}

export { inputVariants }
