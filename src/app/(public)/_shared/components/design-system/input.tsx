import type { InputHTMLAttributes, Ref } from "react";
import { CuratedIcon } from "@/shared/components/icon-curation/CuratedIcon";
import { cn } from "@/shared/lib/cn";

/**
 * Public Input — Editorial Magazine theme（border-bottom only）の text input
 *
 * `leadingIcon` / `trailingIcon` で curation icon の adornment を表示できる。
 * 業界標準: Material UI `InputAdornment` / Stripe Elements / Notion form input。
 *
 * 業界ベストプラクティス準拠:
 * - icon は `aria-hidden="true"` 自動（NN/g + WCAG — SR は label のみ読む）
 * - icon-only モード禁止（label prop が常に必須）
 * - 1 アイコンライブラリのみ（Tabler curation 100 個、`@/shared/components/icon-curation`）
 * - icon は `pointer-events-none` で input click を妨げない
 *
 * admin Input (`@/admin/components/ui/input`) と同 API を提供（API 統一）。
 */
interface InputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "className"
> {
  readonly label: string;
  readonly error?: string;
  readonly wrapperClassName?: string;
  readonly ref?: Ref<HTMLInputElement>;
  /**
   * 入力欄の左端に表示する icon。curation list (`@/shared/lib/icon-curation`) の識別子。
   * 例: "IconLink"（URL）/ "IconMail"（メール）/ "IconPhone"（電話）。
   */
  readonly leadingIcon?: string;
  /**
   * 入力欄の右端に表示する icon。curation list の識別子。
   * バリデーション status（success / error）等の表示に使う。
   */
  readonly trailingIcon?: string;
}

const ICON_BASE_CLASS =
  "pointer-events-none absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground";

export function Input({
  label,
  error,
  id,
  wrapperClassName = "",
  ref,
  leadingIcon,
  trailingIcon,
  ...props
}: InputProps) {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, "-");
  const errorId = error ? `${inputId}-error` : undefined;
  const hasLeading = leadingIcon !== undefined;
  const hasTrailing = trailingIcon !== undefined;
  return (
    <div className={wrapperClassName}>
      <label
        htmlFor={inputId}
        className="mb-2 block text-xs font-medium uppercase tracking-eyebrow text-muted-foreground"
      >
        {label}
        {props.required ? (
          <span className="ml-1 text-base text-destructive" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      <div className="relative">
        {hasLeading ? (
          <CuratedIcon
            name={leadingIcon}
            className={cn(ICON_BASE_CLASS, "left-0")}
          />
        ) : null}
        <input
          id={inputId}
          ref={ref}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          {...props}
          className={cn(
            "w-full min-h-11 border-0 border-b bg-transparent py-3 text-foreground transition-colors placeholder:text-muted-foreground/60 focus-visible:border-accent disabled:opacity-50 disabled:cursor-not-allowed",
            // Border-bottom theme は左右 padding 0 が canonical だが、icon 配置時のみ pl-7 / pr-7
            hasLeading ? "pl-7" : "px-0",
            hasTrailing && "pr-7",
            error ? "border-destructive" : "border-border",
          )}
        />
        {hasTrailing ? (
          <CuratedIcon
            name={trailingIcon}
            className={cn(ICON_BASE_CLASS, "right-0")}
          />
        ) : null}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
