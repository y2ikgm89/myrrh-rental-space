import type { ReactElement } from "react";
import { StatusHubShell } from "./status-hub-shell";

export function StatusHubTooManyRequestsView(): ReactElement {
  return (
    <StatusHubShell>
      <div className="border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-base font-medium text-foreground">
          リクエストが多すぎます
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          しばらく時間をおいてから再度お試しください。
        </p>
      </div>
    </StatusHubShell>
  );
}
