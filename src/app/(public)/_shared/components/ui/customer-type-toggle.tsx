"use client";

import { useRef, type ReactElement } from "react";
import { IconBuilding, IconUser } from "@tabler/icons-react";
import { cn } from "@/shared/lib/cn";
import { CustomerType } from "@/shared/lib/validations/enums/prisma-types";

interface CustomerTypeToggleProps {
  readonly value: CustomerType;
  readonly onChange: (value: CustomerType) => void;
  readonly id?: string;
  readonly disabled?: boolean;
}

const OPTIONS = [
  {
    value: CustomerType.PERSONAL,
    label: "個人",
    Icon: IconUser,
    slug: "personal",
  },
  {
    value: CustomerType.CORPORATE,
    label: "法人・団体",
    Icon: IconBuilding,
    slug: "corporate",
  },
] as const;

export function CustomerTypeToggle({
  value,
  onChange,
  id = "customer-type",
  disabled = false,
}: CustomerTypeToggleProps): ReactElement {
  const groupRef = useRef<HTMLDivElement>(null);

  // WAI-ARIA radiogroup パターン: グループ内は単一 tab ストップ（roving tabindex）、
  // 矢印キーで選択を移動しフォーカスも追従させる（selection follows focus）。
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      nextIndex = (index + 1) % OPTIONS.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      nextIndex = (index - 1 + OPTIONS.length) % OPTIONS.length;
    }
    if (nextIndex === null) return;
    e.preventDefault();
    const next = OPTIONS[nextIndex];
    if (!next) return;
    onChange(next.value);
    const radios =
      groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    radios?.[nextIndex]?.focus();
  };

  return (
    <fieldset>
      <legend className="mb-2 text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
        ご利用区分
      </legend>
      <div
        ref={groupRef}
        role="radiogroup"
        aria-label="ご利用区分"
        className="grid grid-cols-2 gap-3"
      >
        {OPTIONS.map((option, index) => {
          const checked = value === option.value;
          return (
            <button
              key={option.slug}
              id={`${id}-${option.slug}`}
              type="button"
              role="radio"
              aria-checked={checked}
              // 選択中のみ tab ストップに含める（roving tabindex）
              tabIndex={checked ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className={cn(
                "flex min-h-11 items-center justify-center gap-2 border px-4 py-2.5 text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50",
                checked
                  ? "border-accent bg-accent/5 text-foreground"
                  : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              )}
            >
              <option.Icon className="h-4 w-4" />
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
