import { cn } from '@/shared/lib/utils'

type DivProps = React.HTMLAttributes<HTMLDivElement> & {
  ref?: React.Ref<HTMLDivElement>
}

function Card({ className, ref, ...props }: DivProps) {
  return (
    <div
      ref={ref}
      className={cn(
        // Swiss Design: シャープなエッジ、控えめなシャドウ
        'rounded-md border bg-card text-card-foreground',
        'shadow-[0_1px_3px_0_rgb(0_0_0/0.04),0_1px_2px_-1px_rgb(0_0_0/0.03)]',
        'transition-shadow duration-200',
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ref, ...props }: DivProps) {
  return (
    <div
      ref={ref}
      className={cn('flex flex-col space-y-1.5 p-6', className)}
      {...props}
    />
  )
}

function CardTitle({ className, ref, ...props }: DivProps) {
  return (
    <div
      ref={ref}
      className={cn(
        // Swiss Typography: タイトなレタースペーシング
        'text-base font-semibold leading-none tracking-tight',
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ref, ...props }: DivProps) {
  return (
    <div
      ref={ref}
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

function CardContent({ className, ref, ...props }: DivProps) {
  return <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
}

function CardFooter({ className, ref, ...props }: DivProps) {
  return (
    <div
      ref={ref}
      className={cn('flex items-center p-6 pt-0', className)}
      {...props}
    />
  )
}

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
