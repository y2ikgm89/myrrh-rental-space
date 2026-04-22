import { Container } from "@/public/components/design-system/container";

export default function AboutLoading() {
  return (
    <main id="main-content">
      <Container>
        <div className="space-y-10 py-[var(--space-lg)]">
          {/* Hero placeholder */}
          <div className="mx-auto h-10 w-48 animate-pulse bg-surface" />
          {/* Section placeholders */}
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="space-y-4">
              <div className="h-8 w-40 animate-pulse bg-surface" />
              <div className="h-4 w-full animate-pulse bg-surface" />
              <div className="h-4 w-5/6 animate-pulse bg-surface" />
              <div className="h-4 w-2/3 animate-pulse bg-surface" />
            </div>
          ))}
        </div>
      </Container>
    </main>
  );
}
