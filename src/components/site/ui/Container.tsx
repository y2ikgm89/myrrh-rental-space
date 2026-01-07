import { tv, type VariantProps } from 'tailwind-variants'
import { cn } from '@/lib/utils'

const containerVariants = tv({
  base: 'mx-auto w-full px-4 sm:px-6 lg:px-8',
  variants: {
    size: {
      sm: 'max-w-3xl',
      md: 'max-w-5xl',
      lg: 'max-w-7xl',
      full: 'max-w-full',
    },
  },
  defaultVariants: {
    size: 'lg',
  },
})

type ContainerProps = React.ComponentPropsWithoutRef<'div'> &
  VariantProps<typeof containerVariants>

export function Container({ className, size, ...props }: ContainerProps) {
  return <div className={cn(containerVariants({ size }), className)} {...props} />
}

export { containerVariants }
