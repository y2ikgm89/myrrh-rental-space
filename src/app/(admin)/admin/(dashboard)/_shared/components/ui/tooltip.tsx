'use client'

import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { tv } from 'tailwind-variants'
import { cn } from '@/shared/lib/cn'
import { Z_INDEX } from '@/admin/lib/styles/z-index'

const tooltipContentVariants = tv({
  base: [
    'overflow-hidden rounded-md border bg-popover px-3 py-1.5',
    'text-sm text-popover-foreground shadow-md',
    'animate-in fade-in-0 zoom-in-95',
    'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
    'data-[side=bottom]:slide-in-from-top-2',
    'data-[side=left]:slide-in-from-right-2',
    'data-[side=right]:slide-in-from-left-2',
    'data-[side=top]:slide-in-from-bottom-2',
  ],
})

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

function TooltipContent({
  className,
  sideOffset = 4,
  ref,
  style,
  ...props
}: React.ComponentPropsWithRef<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(tooltipContentVariants(), className)}
        style={{ zIndex: Z_INDEX.tooltip, ...style }}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
