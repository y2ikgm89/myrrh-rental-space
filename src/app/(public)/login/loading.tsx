import type { ReactElement } from "react";
import { Container } from "@/public/components/design-system/container";
import { Stack } from "@/public/components/design-system/stack";
import { Skeleton } from "@/public/components/design-system/skeleton";
import { LoginHero } from "./_components/login-hero";

/**
 * /login ローディング — LoginHero + form fields skeleton
 *
 * LoginHero は静的 SC のため real component を render し、
 * フォーム部のみ Skeleton 化する。
 */
export default function LoginLoading(): ReactElement {
  return (
    <>
      <LoginHero />

      <Container variant="narrow">
        <Stack
          gap="lg"
          className="mx-auto max-w-sm pb-[var(--spacing-region)]"
          aria-busy="true"
          aria-label="読み込み中"
        >
          {/* Email field */}
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" variant="text" />
            <Skeleton className="h-11 w-full" />
          </div>
          {/* Password field */}
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" variant="text" />
            <Skeleton className="h-11 w-full" />
          </div>
          {/* Submit button */}
          <Skeleton className="h-12 w-full" />
          {/* Social login buttons */}
          <div className="space-y-3 pt-2">
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </div>
        </Stack>
      </Container>
    </>
  );
}
