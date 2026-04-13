import { Container } from "@/public/components/design-system/container";

export default function SettingsLoading() {
  return (
    <main id="main-content">
      <Container>
        <div className="animate-pulse space-y-8 py-[var(--spacing-section)]">
          {/* Title */}
          <div className="h-8 w-48 bg-surface" />

          {/* Form skeleton */}
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="h-4 w-20 bg-surface" />
              <div className="h-10 w-full bg-surface" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-20 bg-surface" />
              <div className="h-10 w-full bg-surface" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-20 bg-surface" />
              <div className="h-10 w-full bg-surface" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-20 bg-surface" />
              <div className="h-10 w-full bg-surface" />
            </div>
          </div>

          {/* Submit button */}
          <div className="h-10 w-32 bg-surface" />
        </div>
      </Container>
    </main>
  );
}
