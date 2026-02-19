import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

type DetailFieldProps = {
  label: string;
  value?: ReactNode;
  className?: string;
};

export function DetailField({ label, value, className }: DetailFieldProps) {
  return (
    <div className={cn("space-y-1", className)}>
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm">
        {value != null && value !== "" ? (
          value
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </dd>
    </div>
  );
}
