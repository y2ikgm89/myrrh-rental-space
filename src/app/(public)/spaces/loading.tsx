import { Container } from "@/public/components/design-system/container";

export default function SpacesLoading() {
  return (
    <main id="main-content">
      <Container>
        <div className="space-y-6 py-10 md:py-14">
          {/* Hero placeholder */}
          <div className="space-y-3 text-center">
            <div className="mx-auto h-10 w-64 animate-pulse bg-surface" />
            <div className="mx-auto h-4 w-96 animate-pulse bg-surface" />
          </div>
          {/* Filter bar placeholder */}
          <div className="h-10 w-full animate-pulse bg-surface" />
          {/* Card grid */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="space-y-3">
                <div className="aspect-[3/2] w-full animate-pulse bg-surface" />
                <div className="h-5 w-3/4 animate-pulse bg-surface" />
                <div className="h-4 w-1/2 animate-pulse bg-surface" />
              </div>
            ))}
          </div>
        </div>
      </Container>
    </main>
  );
}
