import { Container } from "@/public/components/design-system/container";

export default function EventDetailLoading() {
  return (
    <main id="main-content">
      <Container variant="narrow">
        <div className="animate-pulse space-y-6 py-[var(--space-lg)]">
          {/* Title */}
          <div className="space-y-3">
            <div className="h-10 w-3/4 bg-surface" />
            <div className="flex gap-2">
              <div className="h-6 w-20 rounded-full bg-surface" />
              <div className="h-6 w-24 rounded-full bg-surface" />
            </div>
          </div>

          {/* Info card */}
          <div className="space-y-4 border border-border bg-surface p-6">
            <div className="flex gap-3">
              <div className="h-5 w-5 rounded bg-surface" />
              <div className="space-y-1">
                <div className="h-4 w-16 rounded bg-background" />
                <div className="h-4 w-48 rounded bg-background" />
              </div>
            </div>
            <div className="flex gap-3">
              <div className="h-5 w-5 rounded bg-surface" />
              <div className="space-y-1">
                <div className="h-4 w-16 rounded bg-background" />
                <div className="h-4 w-32 rounded bg-background" />
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <div className="h-8 w-32 bg-surface" />
            <div className="h-4 w-full rounded bg-surface" />
            <div className="h-4 w-5/6 rounded bg-surface" />
            <div className="h-4 w-2/3 rounded bg-surface" />
          </div>
        </div>
      </Container>
    </main>
  );
}
