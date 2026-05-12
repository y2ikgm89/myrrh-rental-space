/**
 * Input — Swiss Industrial Admin theme の text input
 *
 * `leadingIcon` / `trailingIcon` で curation icon の adornment を表示できる。
 * 業界標準パターン: Material UI `InputAdornment` / Tailwind UI `input with leading icon` /
 * Stripe Elements の prefix。
 *
 * 業界ベストプラクティス準拠:
 * - icon は `aria-hidden="true"` で SR は label のみ読む（NN/g + WCAG）
 * - icon-only モードは禁止（呼び出し側で必ず `<Label>` or `aria-label` 併記）
 * - 1 アイコンライブラリのみ（Tabler curation 100 個）
 * - icon は `pointer-events-none` で input click を妨げない
 */

import type { ReactNode } from "react";
import { CuratedIcon } from "@/shared/components/icon-curation/CuratedIcon";
import { cn } from "@/shared/lib/cn";

type InputProps = Omit<React.ComponentProps<"input">, "prefix"> & {
  /**
   * 入力欄の左端に表示する icon。curation list (`@/shared/lib/icon-curation`) の識別子。
   * 例: "IconLink" / "IconSearch" / "IconMail"。
   * 設定時、入力 padding は `pl-9` に拡張される。
   */
  readonly leadingIcon?: string;
  /**
   * 入力欄の右端に表示する icon。curation list の識別子。
   * 設定時、入力 padding は `pr-9` に拡張される。
   * バリデーション status（success / error）等の表示に使う。
   */
  readonly trailingIcon?: string;
  /**
   * trailing 領域に任意の ReactNode を入れる場合（clear ボタン等の interactive 要素）。
   * `trailingIcon` と同時指定不可。
   */
  readonly trailingSlot?: ReactNode;
};

const ICON_BASE_CLASS =
  "pointer-events-none absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground";

function Input({
  className,
  type,
  ref,
  leadingIcon,
  trailingIcon,
  trailingSlot,
  ...props
}: InputProps) {
  const hasLeading = leadingIcon !== undefined;
  const hasTrailing = trailingIcon !== undefined || trailingSlot !== undefined;

  const inputElement = (
    <input
      type={type}
      className={cn(
        // Base
        "flex h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-base md:text-sm",
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
        // Icon adornment padding
        hasLeading && "pl-9",
        hasTrailing && "pr-9",
        className,
      )}
      ref={ref}
      {...props}
    />
  );

  // adornment が無ければ従来通り `<input>` 直接 return（後方互換）
  if (!hasLeading && !hasTrailing) return inputElement;

  return (
    <div className="relative">
      {hasLeading ? (
        <CuratedIcon
          name={leadingIcon}
          className={cn(ICON_BASE_CLASS, "left-3")}
        />
      ) : null}
      {inputElement}
      {trailingIcon !== undefined ? (
        <CuratedIcon
          name={trailingIcon}
          className={cn(ICON_BASE_CLASS, "right-3")}
        />
      ) : trailingSlot !== undefined ? (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
          {trailingSlot}
        </div>
      ) : null}
    </div>
  );
}

export { Input };
export type { InputProps };
