import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getEventById } from "@/shared/domain/events/admin-queries";
import { getEventBroadcastRecipientCounts } from "@/shared/domain/events/registration-queries";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { DetailSection } from "@/admin/components/DetailSection";
import { BroadcastForm } from "./_components/BroadcastForm";
import type { Metadata } from "next";

type PageProps = {
  params: Promise<{ id: string }>;
};

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
    title: `一斉配信: ${event.title} | イベント管理 | Myrrh Rental Space`,
  };
}

export default async function EventBroadcastPage({ params }: PageProps) {
  await connection();

  const { id } = await params;
  const [event, counts] = await Promise.all([
    getEventById(id),
    getEventBroadcastRecipientCounts(id),
  ]);
  if (!event) notFound();

  return (
    <AdminDetailLayout
      backHref={`/admin/events/${event.id}`}
      backLabel="詳細に戻る"
      title={`一斉配信: ${event.title}`}
      subtitle={`/${event.slug}`}
    >
      <DetailSection title="配信対象">
        <p className="text-sm text-muted-foreground">
          確定申込 (CONFIRMED)
          のうち、メールアドレスを登録済みの参加者に配信します。 当日参加
          (walk-in) 由来などメールアドレス未登録の申込は配信対象外となります。
        </p>
        <ul className="mt-3 space-y-1 text-sm">
          <li>
            <span className="font-medium">配信対象:</span>{" "}
            <span data-testid="broadcast-recipient-eligible">
              {counts.eligible}
            </span>{" "}
            名
          </li>
          <li>
            <span className="font-medium">配信対象外 (メール未登録):</span>{" "}
            <span data-testid="broadcast-recipient-skipped">
              {counts.skipped}
            </span>{" "}
            名
          </li>
        </ul>
      </DetailSection>

      <DetailSection title="配信内容">
        <BroadcastForm eventId={event.id} eligibleCount={counts.eligible} />
      </DetailSection>
    </AdminDetailLayout>
  );
}
