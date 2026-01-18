/**
 * SectionTitle コンポーネント
 *
 * セクションのタイトルを表示するコンポーネント
 */

import { tv, type VariantProps } from 'tailwind-variants'
import type { ReactElement } from 'react'

const sectionTitleVariants = tv({
  slots: {
    wrapper: 'mb-8',
    title: 'text-2xl font-bold text-gray-900 md:text-3xl',
    subtitle: 'mt-2 text-gray-600',
  },
  variants: {
    align: {
      left: {
        wrapper: 'text-left',
      },
      center: {
        wrapper: 'text-center',
      },
      right: {
        wrapper: 'text-right',
      },
    },
  },
  defaultVariants: {
    align: 'left',
  },
})

interface SectionTitleProps extends VariantProps<typeof sectionTitleVariants> {
  title: string
  subtitle?: string
  className?: string
}

export function SectionTitle({
  title,
  subtitle,
  align,
  className,
}: SectionTitleProps): ReactElement {
  const { wrapper, title: titleClass, subtitle: subtitleClass } = sectionTitleVariants({ align })

  return (
    <div className={wrapper({ className })}>
      <h2 className={titleClass()}>{title}</h2>
      {subtitle && <p className={subtitleClass()}>{subtitle}</p>}
    </div>
  )
}

export { sectionTitleVariants }
