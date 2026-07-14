import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getEventById } from "@/shared/domain/events/admin-queries";
import { getWaitlistQueue } from "@/shared/domain/events/waitlist-queries";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { WaitlistQueueTable } from "./_components/WaitlistQueueTable";
import type { Metadata } from "next";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await connection();

  const { id } = await params;
  const event = await getEventById(id);
  if (!event) {
    return { title: "イベントが見つかりません | Myrrh Rental Space" };
  }
  return {
    title: `キャンセル待ち - ${event.title} | Myrrh Rental Space`,
  };
}

export default async function EventWaitlistPage({ params }: PageProps) {
  await connection();

  const { id } = await params;
  const [event, queue] = await Promise.all([
    getEventById(id),
    getWaitlistQueue(id),
  ]);
  if (!event) notFound();

  const entries = queue.map((entry) => ({
    id: entry.id,
    name: entry.name,
    email: entry.email,
    quantity: entry.quantity,
    slotStartAt: entry.slotStartAt.toISOString(),
    ticketName: entry.ticketName,
    status: entry.status,
    waitlistedAt: entry.waitlistedAt?.toISOString() ?? null,
    offeredAt: entry.offeredAt?.toISOString() ?? null,
    expiresAt: entry.expiresAt?.toISOString() ?? null,
  }));

  return (
    <AdminDetailLayout
      backHref={`/admin/events/${event.id}`}
      backLabel="詳細に戻る"
      title={`キャンセル待ち: ${event.title}`}
      subtitle={`/${event.slug}`}
    >
      <WaitlistQueueTable entries={entries} />
    </AdminDetailLayout>
  );
}
