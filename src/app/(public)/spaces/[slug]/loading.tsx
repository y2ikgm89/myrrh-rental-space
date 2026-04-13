import { Container } from "@/public/components/design-system/container";

export default function SpaceDetailLoading() {
  return (
    <main id="main-content">
      <Container>
        <div className="animate-pulse space-y-8 py-[var(--spacing-section)]">
          {/* Image placeholder */}
          <div className="aspect-[16/9] w-full bg-surface" />

          {/* Title + badges */}
          <div className="space-y-3">
            <div className="h-10 w-3/4 bg-surface" />
            <div className="flex gap-2">
              <div className="h-6 w-20 rounded-full bg-surface" />
              <div className="h-6 w-24 rounded-full bg-surface" />
            </div>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="h-4 w-16 bg-surface" />
              <div className="h-6 w-32 bg-surface" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-16 bg-surface" />
              <div className="h-6 w-24 bg-surface" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-16 bg-surface" />
              <div className="h-6 w-28 bg-surface" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-16 bg-surface" />
              <div className="h-6 w-36 bg-surface" />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <div className="h-4 w-full bg-surface" />
            <div className="h-4 w-5/6 bg-surface" />
            <div className="h-4 w-2/3 bg-surface" />
          </div>
        </div>
      </Container>
    </main>
  );
}
