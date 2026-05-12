import type { ReactElement } from "react";
import { Container } from "@/public/components/design-system/container";
import { Stack } from "@/public/components/design-system/stack";
import { LoginHero } from "./_components/login-hero";

export default function LoginLoading(): ReactElement {
  return (
    <>
      <LoginHero />

      <Container variant="narrow">
        <Stack
          gap="lg"
          className="mx-auto max-w-sm pb-[var(--spacing-block)]"
          aria-busy="true"
          aria-label="読み込み中"
        >
          <div className="h-4 animate-pulse rounded bg-muted" />
          <div className="h-12 animate-pulse rounded bg-muted" />
          <div className="h-12 animate-pulse rounded bg-muted" />
        </Stack>
      </Container>
    </>
  );
}
