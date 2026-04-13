import { Container } from "@/public/components/design-system/container";

export default function FaqLoading() {
  return (
    <main id="main-content">
      <Container>
        <div className="space-y-6 py-10 md:py-14">
          {/* Hero placeholder */}
          <div className="space-y-3 text-center">
            <div className="mx-auto h-10 w-32 animate-pulse bg-surface" />
            <div className="mx-auto h-4 w-72 animate-pulse bg-surface" />
          </div>
          {/* Accordion rows */}
          <div>
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                className="h-12 animate-pulse border-b border-border bg-surface"
              />
            ))}
          </div>
        </div>
      </Container>
    </main>
  );
}
