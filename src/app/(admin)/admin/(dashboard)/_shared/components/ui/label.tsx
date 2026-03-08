'use client'

import * as LabelPrimitive from '@radix-ui/react-label'

import { cn } from '@/shared/lib/cn'

const labelStyles =
  'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70'

function Label({
  className,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      ref={ref}
      className={cn(labelStyles, className)}
      {...props}
    />
  )
}

export { Label }
