import type { InputHTMLAttributes, Ref } from "react";

interface InputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "className"
> {
  readonly label: string;
  readonly error?: string;
  readonly wrapperClassName?: string;
  readonly ref?: Ref<HTMLInputElement>;
}

export function Input({
  label,
  error,
  id,
  wrapperClassName = "",
  ref,
  ...props
}: InputProps) {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, "-");
  const errorId = error ? `${inputId}-error` : undefined;
  return (
    <div className={wrapperClassName}>
      <label
        htmlFor={inputId}
        className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground"
      >
        {label}
        {props.required ? (
          <span className="ml-1 text-base text-destructive" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      <input
        id={inputId}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        {...props}
        className={`w-full min-h-11 border-0 border-b bg-transparent px-0 py-3 text-foreground transition-colors
          placeholder:text-muted-foreground/60
          focus-visible:border-accent
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error ? "border-destructive" : "border-border"}`}
      />
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
