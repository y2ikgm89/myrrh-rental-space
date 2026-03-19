import type { Ref, SelectHTMLAttributes } from "react";

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
  return (
    <div className={wrapperClassName}>
      <label
        htmlFor={selectId}
        className="mb-1.5 block text-sm font-medium text-foreground"
      >
        {label}
      </label>
      <select
        id={selectId}
        ref={ref}
        {...props}
        className={`w-full min-h-11 rounded-lg border px-3 py-2 text-foreground bg-background transition-colors
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error ? "border-destructive" : "border-border"}`}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error ? <p className="mt-1 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
