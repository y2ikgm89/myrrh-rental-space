import { tv } from 'tailwind-variants'
import { cn } from '@/lib/utils'

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

export function Card({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return <div className={cn(root(), className)} {...props} />
}

export function CardHeader({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return <div className={cn(header(), className)} {...props} />
}

export function CardTitle({ className, ...props }: React.ComponentPropsWithoutRef<'h3'>) {
  return <h3 className={cn(title(), className)} {...props} />
}

export function CardDescription({ className, ...props }: React.ComponentPropsWithoutRef<'p'>) {
  return <p className={cn(description(), className)} {...props} />
}

export function CardContent({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return <div className={cn(content(), className)} {...props} />
}

export function CardFooter({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return <div className={cn(footer(), className)} {...props} />
}
