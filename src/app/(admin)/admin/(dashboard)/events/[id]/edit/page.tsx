import { notFound } from "next/navigation";
import { connection } from "next/server";
import {
  getEventById,
  getLocationsForEvent,
  getSpacesForEvent,
  getCategoriesForEvent,
} from "@/admin/queries/event";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { EventForm } from "../../_components/EventForm";
import type { Metadata } from "next";
import { requireEventEditPage } from "@/admin/helpers/page-auth";

type Params = Promise<{ id: string }>;

type PageProps = {
  params: Params;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await connection();

  const { id } = await params;
  const event = await getEventById(id);

  if (!event) {
    return {
      title: "イベントが見つかりません | Myrrh Rental Space",
    };
  }

  return {
    title: `${event.title} を編集 | イベント管理 | Myrrh Rental Space`,
  };
}

export default async function EditEventPage({ params }: PageProps) {
  await connection();
  await requireEventEditPage();

  const { id } = await params;

  const event = await getEventById(id);
  if (!event) notFound();

  const [locations, spaces, categories] = await Promise.all([
    getLocationsForEvent(),
    getSpacesForEvent(),
    getCategoriesForEvent(),
  ]);

  return (
    <AdminDetailLayout
      backHref={`/admin/events/${id}`}
      backLabel="詳細に戻る"
      title="イベントを編集"
      subtitle={event.title}
    >
      <EventForm
        key={event.id}
        event={event}
        locations={locations}
        spaces={spaces}
        categories={categories}
      />
    </AdminDetailLayout>
  );
}
