"use client";

import type { ReactElement } from "react";
import { IconBuilding, IconUser } from "@tabler/icons-react";
import { cn } from "@/shared/lib/cn";
import { CustomerType } from "@/shared/lib/validations/enums/prisma-types";

interface CustomerTypeToggleProps {
  readonly value: CustomerType;
  readonly onChange: (value: CustomerType) => void;
  readonly id?: string;
  readonly disabled?: boolean;
}

export function CustomerTypeToggle({
  value,
  onChange,
  id = "customer-type",
  disabled = false,
}: CustomerTypeToggleProps): ReactElement {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        ご利用区分
      </legend>
      <div
        role="radiogroup"
        aria-label="ご利用区分"
        className="grid grid-cols-2 gap-3"
      >
        <button
          id={`${id}-personal`}
          type="button"
          role="radio"
          aria-checked={value === CustomerType.PERSONAL}
          disabled={disabled}
          onClick={() => onChange(CustomerType.PERSONAL)}
          className={cn(
            "flex items-center justify-center gap-2 border px-4 py-2.5 text-sm transition-colors duration-200 disabled:pointer-events-none disabled:opacity-50",
            value === CustomerType.PERSONAL
              ? "border-accent bg-accent/5 text-foreground"
              : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
          )}
        >
          <IconUser className="h-4 w-4" />
          個人
        </button>
        <button
          id={`${id}-corporate`}
          type="button"
          role="radio"
          aria-checked={value === CustomerType.CORPORATE}
          disabled={disabled}
          onClick={() => onChange(CustomerType.CORPORATE)}
          className={cn(
            "flex items-center justify-center gap-2 border px-4 py-2.5 text-sm transition-colors duration-200 disabled:pointer-events-none disabled:opacity-50",
            value === CustomerType.CORPORATE
              ? "border-accent bg-accent/5 text-foreground"
              : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
          )}
        >
          <IconBuilding className="h-4 w-4" />
          法人・団体
        </button>
      </div>
    </fieldset>
  );
}
