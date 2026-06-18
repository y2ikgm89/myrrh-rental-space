/**
 * /contact ローディング — page-hero + contact form fields + submit
 */

import { Container } from "@/public/components/design-system/container";
import { Skeleton } from "@/public/components/design-system/skeleton";

export default function ContactLoading() {
  return (
    <main id="main-content" aria-busy="true">
      {/* Page hero */}
      <section className="bg-background py-[var(--spacing-fluid-xl)]">
        <Container>
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
            <Skeleton className="h-3 w-16" variant="text" />
            <Skeleton className="h-10 w-48 md:h-12 md:w-64" />
            <Skeleton className="h-4 w-80 max-w-md" variant="text" />
          </div>
        </Container>
      </section>

      <Container>
        <div className="mx-auto max-w-2xl space-y-6 py-[var(--spacing-fluid-lg)]">
          {/* Form fields */}
          <div className="space-y-6 border border-border p-6 sm:p-8">
            {/* name + email */}
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Skeleton className="h-3 w-16" variant="text" />
                <Skeleton className="h-11 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-3 w-20" variant="text" />
                <Skeleton className="h-11 w-full" />
              </div>
            </div>
            {/* phone + subject */}
            <div className="space-y-2">
              <Skeleton className="h-3 w-20" variant="text" />
              <Skeleton className="h-11 w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-24" variant="text" />
              <Skeleton className="h-11 w-full" />
            </div>
            {/* message */}
            <div className="space-y-2">
              <Skeleton className="h-3 w-20" variant="text" />
              <Skeleton className="h-32 w-full" />
            </div>
            {/* turnstile + submit */}
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      </Container>
    </main>
  );
}
