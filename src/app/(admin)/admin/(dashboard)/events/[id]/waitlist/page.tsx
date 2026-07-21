import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getEventById, getWaitlistQueue } from "@/admin/queries/event";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { Pagination } from "@/admin/components/ui";
import { loadAdminEventWaitlistSearchParams } from "@/shared/lib/nuqs";
import { WaitlistQueueTable } from "./_components/WaitlistQueueTable";
import type { Metadata } from "next";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
};

export async function generateMetadata({
  params,
}: Omit<PageProps, "searchParams">): Promise<Metadata> {
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

export default async function EventWaitlistPage({
  params,
  searchParams,
}: PageProps) {
  await connection();

  const { id } = await params;
  const { page, perPage } =
    await loadAdminEventWaitlistSearchParams(searchParams);
  const [event, queuePage] = await Promise.all([
    getEventById(id),
    getWaitlistQueue(id, { page, perPage }),
  ]);
  if (!event) notFound();

  const entries = queuePage.entries.map((entry) => ({
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
      <Pagination
        currentPage={queuePage.page}
        totalPages={queuePage.totalPages}
        total={queuePage.total}
        perPage={queuePage.perPage}
        defaultPerPage={20}
      />
    </AdminDetailLayout>
  );
}
