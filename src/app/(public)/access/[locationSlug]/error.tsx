"use client";

import type { ReactElement } from "react";
import { useEffect } from "react";
import { getErrorMessage } from "@/shared/lib/errors";
import { Container } from "@/public/components/design-system/container";
import { Button } from "@/public/components/design-system/button";

interface LocationDetailErrorProps {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}

export default function LocationDetailError({
  error,
  reset,
}: LocationDetailErrorProps): ReactElement {
  useEffect(() => {
    console.error("[/access/[locationSlug]]", getErrorMessage(error));
  }, [error]);

  return (
    <Container>
      <div className="py-20 text-center">
        <h1 className="text-h2">拠点情報を取得できませんでした</h1>
        <p className="mt-4 text-muted-foreground">
          時間をおいて再度お試しください。
        </p>
        <div className="mt-8">
          <Button onClick={reset} variant="editorial">
            再試行
          </Button>
        </div>
      </div>
    </Container>
  );
}
