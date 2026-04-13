import { Container } from "@/public/components/design-system/container";

export default function NewsDetailLoading() {
  return (
    <main id="main-content">
      <Container variant="narrow">
        <div className="animate-pulse space-y-6 py-[var(--spacing-section)]">
          {/* Date + title */}
          <div className="space-y-3">
            <div className="h-4 w-24 bg-surface" />
            <div className="h-10 w-3/4 bg-surface" />
          </div>

          {/* Content lines */}
          <div className="space-y-3">
            <div className="h-4 w-full bg-surface" />
            <div className="h-4 w-5/6 bg-surface" />
            <div className="h-4 w-4/5 bg-surface" />
            <div className="h-4 w-full bg-surface" />
            <div className="h-4 w-2/3 bg-surface" />
          </div>
        </div>
      </Container>
    </main>
  );
}
