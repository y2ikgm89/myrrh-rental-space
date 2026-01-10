/**
 * Section コンポーネント
 *
 * ページ内のセクションをラップするコンポーネント
 */

import { tv, type VariantProps } from 'tailwind-variants'
import type { ReactElement, ReactNode } from 'react'

const sectionVariants = tv({
  base: 'py-16',
  variants: {
    size: {
      sm: 'py-8',
      md: 'py-12',
      lg: 'py-16',
      xl: 'py-24',
    },
  },
  defaultVariants: {
    size: 'lg',
  },
})

interface SectionProps extends VariantProps<typeof sectionVariants> {
  children: ReactNode
  className?: string
}

export function Section({
  children,
  className,
  size,
}: SectionProps): ReactElement {
  return (
    <section className={sectionVariants({ size, className })}>
      {children}
    </section>
  )
}

export { sectionVariants }
