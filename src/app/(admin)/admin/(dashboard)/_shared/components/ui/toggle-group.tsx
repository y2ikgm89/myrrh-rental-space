"use client";

import type { ComponentPropsWithRef } from "react";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { cn } from "@/shared/lib/cn";

function ToggleGroup({
  className,
  ref,
  ...props
}: ComponentPropsWithRef<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1 rounded-md bg-muted p-1",
        className,
      )}
      {...props}
    />
  );
}

function ToggleGroupItem({
  className,
  ref,
  ...props
}: ComponentPropsWithRef<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-medium transition-all",
        "text-muted-foreground hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        "data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
