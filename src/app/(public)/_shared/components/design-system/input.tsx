import type { InputHTMLAttributes } from "react";

interface InputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "className"
> {
  readonly label: string;
  readonly error?: string;
  readonly wrapperClassName?: string;
}

export function Input({
  label,
  error,
  id,
  wrapperClassName = "",
  ...props
}: InputProps) {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className={wrapperClassName}>
      <label
        htmlFor={inputId}
        className="mb-1.5 block text-sm font-medium text-foreground"
      >
        {label}
      </label>
      <input
        id={inputId}
        {...props}
        className={`w-full min-h-11 rounded-lg border px-3 py-2 text-foreground bg-background transition-colors
          placeholder:text-muted-foreground
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error ? "border-destructive" : "border-border"}`}
      />
      {error ? <p className="mt-1 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
