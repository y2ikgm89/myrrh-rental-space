import type { ReactElement } from "react";
import { Container } from "@/public/components/design-system/container";
import { Stack } from "@/public/components/design-system/stack";
import { PageHero } from "@/public/components/layouts/page-hero";

export default function LoginLoading(): ReactElement {
  return (
    <>
      <PageHero variant="minimal" title="ログイン" />

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
