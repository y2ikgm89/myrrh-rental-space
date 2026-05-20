import type { ReactElement } from "react";
import { IconAlertCircle } from "@tabler/icons-react";
import { cn } from "@/shared/lib/cn";

interface EventStatusNoticeProps {
  readonly variant: "warning" | "muted";
  readonly title: string;
  readonly description: string;
}

/**
 * EventStatusNotice — 申込不可状態（満員 / 締切 / 受付終了）の通知
 *
 * 申込フォームの代わりに表示する。`role="status"` で screen reader へ通知。
 */
export function EventStatusNotice({
  variant,
  title,
  description,
}: EventStatusNoticeProps): ReactElement {
  return (
    <div
      className="flex items-start gap-4 border border-border bg-surface p-6 sm:p-8"
      role="status"
    >
      <IconAlertCircle
        className={cn(
          "mt-0.5 h-6 w-6 shrink-0",
          variant === "warning" ? "text-accent" : "text-muted-foreground",
        )}
        aria-hidden="true"
      />
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
