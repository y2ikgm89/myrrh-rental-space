import { notFound } from "next/navigation";
import { connection } from "next/server";
import {
  getEventById,
  getEventBroadcastRecipientCounts,
} from "@/admin/queries/event";
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
          配信対象は、配信同意済み (marketingOptIn) かつ Customer
          に解決できる確定申込です。配信同意なし / メール未登録 / Customer
          未解決の申込は配信対象外です。
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
            <span className="font-medium">
              配信対象外 (配信同意なし / メール未登録 / Customer 未解決):
            </span>{" "}
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
