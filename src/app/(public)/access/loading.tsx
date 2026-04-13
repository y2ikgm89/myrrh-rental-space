import { Container } from "@/public/components/design-system/container";

export default function AccessLoading() {
  return (
    <main id="main-content">
      <Container>
        <div className="space-y-8 py-[var(--spacing-section)]">
          {/* Hero placeholder */}
          <div className="mx-auto h-10 w-48 animate-pulse bg-surface" />
          {/* Map skeleton */}
          <div className="h-[400px] w-full animate-pulse rounded-lg bg-surface" />
          {/* Info skeleton */}
          <div className="mx-auto max-w-2xl space-y-4">
            <div className="mx-auto h-6 w-32 animate-pulse bg-surface" />
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-5 w-full animate-pulse bg-surface" />
            ))}
          </div>
        </div>
      </Container>
    </main>
  );
}
