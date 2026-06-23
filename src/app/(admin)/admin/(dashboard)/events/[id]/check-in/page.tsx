import { notFound } from "next/navigation";
import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import { getEventById } from "@/shared/domain/events/admin-queries";
import { getEventCheckInAttendees } from "@/shared/domain/events/registration-queries";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { Button } from "@/admin/components/ui";
import { CheckInClient } from "./_components/CheckInClient";
import type { Metadata } from "next";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const event = await getEventById(id);
  if (!event) {
    return { title: "イベントが見つかりません | Myrrh Rental Space" };
  }
  return {
    title: `当日受付 - ${event.title} | Myrrh Rental Space`,
  };
}

export default async function CheckInPage({ params }: PageProps) {
  const { id } = await params;
  const [event, attendees] = await Promise.all([
    getEventById(id),
    getEventCheckInAttendees(id),
  ]);
  if (!event) notFound();

  const initialAttendees = attendees.registrations.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    quantity: r.quantity,
    attendedAt: r.attendedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    ticket: r.ticket,
  }));

  const tickets = event.tickets
    .filter((t) => t.isAvailable)
    .map((t) => ({
      id: t.id,
      name: t.name,
      price: t.price,
    }));

  return (
    <AdminDetailLayout
      backHref={`/admin/events/${event.id}`}
      title={`当日受付: ${event.title}`}
      subtitle={`/${event.slug}`}
      actions={
        <Button asChild size="sm" variant="outline">
          <Link href={`/admin/events/${event.id}`}>
            <IconArrowLeft className="mr-2 h-4 w-4" />
            詳細に戻る
          </Link>
        </Button>
      }
    >
      <CheckInClient
        eventId={event.id}
        initialAttendees={initialAttendees}
        initialAttendedCount={attendees.attendedCount}
        tickets={tickets}
      />
    </AdminDetailLayout>
  );
}
