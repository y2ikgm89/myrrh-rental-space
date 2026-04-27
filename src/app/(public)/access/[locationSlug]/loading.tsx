import type { ReactElement } from "react";
import { Container } from "@/public/components/design-system/container";

export default function LocationDetailLoading(): ReactElement {
  return (
    <Container>
      <div className="space-y-8 py-20" aria-busy="true" aria-live="polite">
        <div className="h-8 w-1/3 animate-pulse bg-muted" />
        <div className="aspect-[3/2] animate-pulse bg-muted" />
        <div className="space-y-4">
          <div className="h-4 w-2/3 animate-pulse bg-muted" />
          <div className="h-4 w-1/2 animate-pulse bg-muted" />
        </div>
      </div>
    </Container>
  );
}
