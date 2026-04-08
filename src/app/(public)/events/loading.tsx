import { Container } from "@/public/components/design-system/container";

export default function EventsLoading() {
  return (
    <main id="main-content">
      <Container>
        <div className="space-y-6 py-10 md:py-14">
          {/* Tab skeleton */}
          <div className="flex gap-4 border-b border-border pb-3">
            <div className="h-5 w-12 animate-pulse bg-surface" />
            <div className="h-5 w-24 animate-pulse bg-surface" />
          </div>
          {/* Card skeletons */}
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex gap-6">
              <div className="h-16 w-16 animate-pulse bg-surface" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-24 animate-pulse bg-surface" />
                <div className="h-5 w-3/4 animate-pulse bg-surface" />
                <div className="h-3 w-1/2 animate-pulse bg-surface" />
              </div>
            </div>
          ))}
        </div>
      </Container>
    </main>
  );
}
