import type { ReactElement } from "react";
import { cn } from "@/shared/lib/cn";

interface RefundPolicyNoticeProps {
  readonly lines: readonly string[] | null | undefined;
  readonly className?: string;
  readonly title?: string;
}

export function RefundPolicyNotice({
  lines,
  className,
  title = "返金について",
}: RefundPolicyNoticeProps): ReactElement | null {
  if (!lines || lines.length === 0) {
    return null;
  }

  return (
    <div className={cn(className)}>
      <p className="mb-2 text-xs font-medium text-muted-foreground">{title}</p>
      <ul className="space-y-1 text-xs text-muted-foreground">
        {lines.map((line) => (
          <li key={line}>・{line}</li>
        ))}
      </ul>
    </div>
  );
}
