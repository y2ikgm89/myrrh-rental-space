"use client";

import { useRef } from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { tv } from "tailwind-variants";
import { cn } from "@/shared/lib/cn";
import { Z_INDEX, adminZIndexClassName } from "@/admin/lib/styles/z-index";
import { useAdminZIndexImperative } from "@/admin/lib/styles/use-admin-z-index-layer";
import { assignRef } from "@/shared/lib/csp/use-imperative-style";

const tooltipContentVariants = tv({
  base: [
    "overflow-hidden rounded-md border bg-popover px-3 py-1.5",
    "text-sm text-popover-foreground shadow-md",
    "animate-in fade-in-0 zoom-in-95",
    "",
    "data-[side=bottom]:slide-in-from-top-2",
    "data-[side=left]:slide-in-from-right-2",
    "data-[side=right]:slide-in-from-left-2",
    "data-[side=top]:slide-in-from-bottom-2",
  ],
});

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

function TooltipContent({
  className,
  sideOffset = 4,
  ref,
  style,
  ...props
}: React.ComponentPropsWithRef<typeof TooltipPrimitive.Content>) {
  const internalRef = useRef<HTMLDivElement>(null);
  useAdminZIndexImperative(internalRef, Z_INDEX.tooltip, style);

  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={(node) => {
          internalRef.current = node;
          assignRef(ref, node);
        }}
        sideOffset={sideOffset}
        className={cn(
          tooltipContentVariants(),
          adminZIndexClassName(),
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
