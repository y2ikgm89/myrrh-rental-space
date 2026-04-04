import type { Ref, SelectHTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

interface SelectProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "className"
> {
  readonly label: string;
  readonly error?: string;
  readonly options: readonly {
    readonly value: string;
    readonly label: string;
  }[];
  readonly wrapperClassName?: string;
  readonly ref?: Ref<HTMLSelectElement>;
}

export function Select({
  label,
  error,
  id,
  options,
  wrapperClassName = "",
  ref,
  ...props
}: SelectProps) {
  const selectId = id ?? label.toLowerCase().replace(/\s+/g, "-");
  const errorId = error ? `${selectId}-error` : undefined;
  return (
    <div className={wrapperClassName}>
      <label
        htmlFor={selectId}
        className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground"
      >
        {label}
        {props.required ? (
          <span className="ml-1 text-base text-destructive" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      <select
        id={selectId}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        {...props}
        className={cn(
          "w-full min-h-11 border-0 border-b bg-transparent px-0 py-3 text-foreground transition-colors focus-visible:border-accent disabled:opacity-50 disabled:cursor-not-allowed",
          error ? "border-destructive" : "border-border",
        )}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
