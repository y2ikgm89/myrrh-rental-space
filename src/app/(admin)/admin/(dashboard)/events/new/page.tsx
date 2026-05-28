import {
  getLocationsForEvent,
  getSpacesForEvent,
  searchPostsForEventRelation,
} from "@/shared/domain/events/admin-queries";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { EventForm } from "../_components/EventForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "イベント新規作成 | Myrrh Rental Space",
};

export default async function NewEventPage() {
  const [locations, spaces, relatedPostOptions] = await Promise.all([
    getLocationsForEvent(),
    getSpacesForEvent(),
    searchPostsForEventRelation({}),
  ]);

  return (
    <AdminDetailLayout
      backHref="/admin/events"
      title="イベント新規作成"
      subtitle="新しいイベントを作成します"
    >
      <EventForm
        locations={locations}
        spaces={spaces}
        relatedPostOptions={relatedPostOptions}
      />
    </AdminDetailLayout>
  );
}
