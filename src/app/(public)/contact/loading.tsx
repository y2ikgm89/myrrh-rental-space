import { Container } from "@/public/components/design-system/container";

export default function ContactLoading() {
  return (
    <main id="main-content">
      <Container>
        <div className="space-y-8 py-[var(--spacing-section)]">
          {/* Hero placeholder */}
          <div className="mx-auto h-10 w-48 animate-pulse bg-surface" />
          {/* Form skeleton */}
          <div className="mx-auto max-w-2xl space-y-6">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="h-10 w-full animate-pulse bg-surface" />
            ))}
            <div className="h-32 w-full animate-pulse bg-surface" />
            <div className="h-12 w-full animate-pulse bg-surface" />
          </div>
        </div>
      </Container>
    </main>
  );
}
