"use client";

import { type ReactElement } from "react";
import { IconBuilding, IconUser } from "@tabler/icons-react";
import { cn } from "@/shared/lib/cn";
import { CustomerType } from "@/shared/lib/validations/enums/prisma-types";
import { useRadioGroupKeyboard } from "@/public/lib/a11y/use-radio-group-keyboard";

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

type Option = (typeof OPTIONS)[number];

export function CustomerTypeToggle({
  value,
  onChange,
  id = "customer-type",
  disabled = false,
}: CustomerTypeToggleProps): ReactElement {
  // WAI-ARIA APG radio group: roving tabindex + 矢印キー + Home/End + selection follows focus
  const { getItemProps } = useRadioGroupKeyboard<
    Option,
    CustomerType,
    HTMLButtonElement
  >({
    items: OPTIONS,
    selected: value,
    onSelect: onChange,
    getKey: (option) => option.value,
    orientation: "horizontal",
    disabled,
  });

  return (
    <fieldset>
      <legend className="mb-2 text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
        ご利用区分
      </legend>
      <div
        role="radiogroup"
        aria-label="ご利用区分"
        className="grid grid-cols-2 gap-3"
      >
        {OPTIONS.map((option, index) => {
          const checked = value === option.value;
          const itemProps = getItemProps(option, index);
          return (
            <button
              key={option.slug}
              id={`${id}-${option.slug}`}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={itemProps.tabIndex}
              ref={itemProps.ref}
              onKeyDown={itemProps.onKeyDown}
              disabled={disabled}
              onClick={() => onChange(option.value)}
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
