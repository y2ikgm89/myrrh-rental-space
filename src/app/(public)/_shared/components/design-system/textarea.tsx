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
  return (
    <div className={wrapperClassName}>
      <label
        htmlFor={textareaId}
        className="mb-1.5 block text-sm font-medium text-foreground"
      >
        {label}
      </label>
      <textarea
        id={textareaId}
        ref={ref}
        {...props}
        className={`w-full min-h-[120px] rounded-lg border px-3 py-2 text-foreground bg-background transition-colors
          placeholder:text-muted-foreground resize-y
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error ? "border-destructive" : "border-border"}`}
      />
      {error ? <p className="mt-1 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
