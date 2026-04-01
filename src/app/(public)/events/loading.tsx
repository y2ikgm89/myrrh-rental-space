import { Container } from "@/public/components/design-system/container";
import { CalendarSkeleton } from "@/public/components/event-calendar/CalendarSkeleton";

export default function EventsLoading() {
  return (
    <main id="main-content">
      <Container>
        <div className="space-y-6 py-4">
          <div className="h-10 w-64 animate-pulse rounded-md bg-surface" />
          <CalendarSkeleton />
        </div>
      </Container>
    </main>
  );
}
