import { cn } from "@/shared/lib/cn";

function Input({
  className,
  type,
  ref,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        // Base
        "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1.5 text-base md:text-sm",
        // Shadow & transition
        "shadow-sm transition-all duration-200 ease-out",
        // File input
        "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        // Placeholder
        "placeholder:text-muted-foreground",
        // Focus: Swiss Designらしい明確なフォーカス状態
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1",
        "focus-visible:border-primary focus-visible:shadow-[0_0_0_3px_color-mix(in_oklch,var(--color-primary),transparent_90%)]",
        // Disabled
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted/50",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
}

export { Input };
