import { notFound } from "next/navigation";
import {
  getEventById,
  getLocationsForEvent,
  getSpacesForEvent,
  searchPostsForEventRelation,
} from "@/shared/domain/events/admin-queries";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { EventForm } from "../../_components/EventForm";
import type { Metadata } from "next";

type Params = Promise<{ id: string }>;

type PageProps = {
  params: Params;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
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
  const { id } = await params;

  const event = await getEventById(id);
  if (!event) notFound();

  const [locations, spaces, relatedPostOptions] = await Promise.all([
    getLocationsForEvent(),
    getSpacesForEvent(),
    searchPostsForEventRelation({
      includeIds: event.relatedPosts.map((r) => r.postId),
    }),
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
        relatedPostOptions={relatedPostOptions}
      />
    </AdminDetailLayout>
  );
}
