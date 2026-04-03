import type { Ref, TextareaHTMLAttributes } from "react";

interface TextareaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "className"
> {
  readonly label: string;
  readonly error?: string;
  readonly wrapperClassName?: string;
  readonly ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({
  label,
  error,
  id,
  wrapperClassName = "",
  ref,
  ...props
}: TextareaProps) {
  const textareaId = id ?? label.toLowerCase().replace(/\s+/g, "-");
  const errorId = error ? `${textareaId}-error` : undefined;
  return (
    <div className={wrapperClassName}>
      <label
        htmlFor={textareaId}
        className="mb-2 block text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground"
      >
        {label}
        {props.required ? (
          <span className="ml-1 text-base text-destructive" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      <textarea
        id={textareaId}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        {...props}
        className={`w-full min-h-[120px] border-0 border-b bg-transparent px-0 py-3 text-foreground transition-colors
          placeholder:text-muted-foreground/60 resize-y
          focus-visible:outline-none focus-visible:border-accent
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error ? "border-destructive" : "border-border"}`}
      />
      {error ? (
        <p id={errorId} className="mt-1 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
