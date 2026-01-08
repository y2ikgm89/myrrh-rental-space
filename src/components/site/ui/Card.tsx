import { tv } from 'tailwind-variants'
import { cn } from '@/lib/utils'
import type { ComponentPropsWithoutRef, ReactElement } from 'react'

const cardVariants = tv({
  slots: {
    root: 'rounded-lg border bg-card text-card-foreground shadow-sm',
    header: 'flex flex-col space-y-1.5 p-6',
    title: 'text-2xl font-semibold leading-none tracking-tight',
    description: 'text-sm text-muted-foreground',
    content: 'p-6 pt-0',
    footer: 'flex items-center p-6 pt-0',
  },
})

const { root, header, title, description, content, footer } = cardVariants()

export function Card({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>): ReactElement {
  return <div className={cn(root(), className)} {...props} />
}

export function CardHeader({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>): ReactElement {
  return <div className={cn(header(), className)} {...props} />
}

export function CardTitle({
  className,
  ...props
}: ComponentPropsWithoutRef<'h3'>): ReactElement {
  return <h3 className={cn(title(), className)} {...props} />
}

export function CardDescription({
  className,
  ...props
}: ComponentPropsWithoutRef<'p'>): ReactElement {
  return <p className={cn(description(), className)} {...props} />
}

export function CardContent({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>): ReactElement {
  return <div className={cn(content(), className)} {...props} />
}

export function CardFooter({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>): ReactElement {
  return <div className={cn(footer(), className)} {...props} />
}
