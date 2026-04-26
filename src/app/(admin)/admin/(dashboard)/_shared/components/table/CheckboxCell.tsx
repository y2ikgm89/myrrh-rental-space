"use client";

import type { ChangeEvent } from "react";
import { cn } from "@/shared/lib/cn";

type CheckboxCellProps = {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly indeterminate?: boolean;
  readonly className?: string;
  readonly "aria-label": string;
};

/**
 * 管理画面 table 用 44px ヒットエリア checkbox（ADR 0022）。
 * WCAG 2.5.5 Enhanced (AAA) 準拠。
 */
export function CheckboxCell({
  checked,
  onChange,
  disabled,
  indeterminate,
  className,
  "aria-label": ariaLabel,
}: CheckboxCellProps) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.checked);
  };

  return (
    <label
      className={cn(
        "inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={handleChange}
        disabled={disabled}
        ref={(el) => {
          if (el) el.indeterminate = indeterminate ?? false;
        }}
        aria-label={ariaLabel}
        className="h-4 w-4 cursor-pointer rounded border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />
    </label>
  );
}
