import type { ReactElement, ReactNode } from "react";
import { Stack } from "@/public/components/design-system/stack";
import { PageLayout } from "@/public/components/design-system/page-layout";

type StatusHubShellProps = {
  readonly children: ReactNode;
};

export function StatusHubShell({
  children,
}: StatusHubShellProps): ReactElement {
  return (
    <PageLayout variant="form">
      <Stack gap="lg" className="mx-auto max-w-2xl">
        {children}
      </Stack>
    </PageLayout>
  );
}
