import { notFound } from "next/navigation";
import Link from "next/link";
import { IconDownload, IconPencil } from "@tabler/icons-react";
import { getEventById } from "@/shared/domain/events/admin-queries";
import { getEventRegistrations } from "@/shared/domain/events/registration-queries";
import { deleteEvent } from "@/admin/actions/event";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { DetailSection } from "@/admin/components/DetailSection";
import { DetailField } from "@/admin/components/DetailField";
import { DetailDeleteButton } from "@/admin/components/DetailDeleteButton";
import { EventStatusBadge } from "@/admin/components/status-badges";
import { Badge, Button } from "@/admin/components/ui";
import { formatDateTimeShort } from "@/shared/lib/date-format";
import { formatPrice } from "@/shared/lib/pricing/format";
import { RegistrationStatus } from "@/shared/lib/validations/enums/prisma-types";
import { EventRegistrationTable } from "./_components/EventRegistrationTable";
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
    title: `${event.title} | イベント管理 | Myrrh Rental Space`,
  };
}

export default async function EventDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [event, registrations] = await Promise.all([
    getEventById(id),
    getEventRegistrations(id),
  ]);

  if (!event) {
    notFound();
  }

  const serializedRegistrations = registrations.map((r) => ({
    ...r,
    cancelledAt: r.cancelledAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

  const confirmedCount = registrations.filter(
    (r) => r.status === RegistrationStatus.CONFIRMED,
  ).length;

  return (
    <AdminDetailLayout
      backHref="/admin/events"
      title={
        <>
          {event.title}
          {event.googleCalendarEventId && (
            <Badge variant="outline" className="ml-2 align-middle">
              GCal 連携
            </Badge>
          )}
        </>
      }
      subtitle={`/${event.slug}`}
      actions={
        <>
          <DetailDeleteButton
            itemName={event.title}
            onDelete={deleteEvent.bind(null, event.id)}
            redirectTo="/admin/events"
            successMessage="イベントを削除しました"
          />
          <Button asChild size="sm" variant="outline">
            <a
              href={`/api/admin/export/event-registrations?eventId=${event.id}`}
              download
            >
              <IconDownload className="mr-2 h-4 w-4" />
              CSV
            </a>
          </Button>
          <Button asChild size="sm">
            <Link href={`/admin/events/${event.id}/edit`}>
              <IconPencil className="mr-2 h-4 w-4" />
              編集
            </Link>
          </Button>
        </>
      }
    >
      <DetailSection title="基本情報">
        <div className="grid gap-4 sm:grid-cols-2">
          <DetailField label="タイトル" value={event.title} />
          <DetailField label="スラッグ" value={event.slug} />
          <DetailField
            label="ステータス"
            value={<EventStatusBadge status={event.status} />}
          />
          <DetailField
            label="参加登録"
            value={event.registrationOpen ? "受付中" : "受付停止"}
          />
        </div>
      </DetailSection>

      <DetailSection title="日時・場所">
        <div className="grid gap-4 sm:grid-cols-2">
          <DetailField
            label="開始日時"
            value={formatDateTimeShort(event.startTime)}
          />
          <DetailField
            label="終了日時"
            value={formatDateTimeShort(event.endTime)}
          />
          <DetailField label="場所" value={event.location ?? "-"} />
          <DetailField label="スペース" value={event.space?.name ?? "-"} />
        </div>
      </DetailSection>

      <DetailSection title="詳細">
        <div className="grid gap-4 sm:grid-cols-2">
          <DetailField
            label="定員"
            value={event.capacity !== null ? `${event.capacity}人` : "-"}
          />
          <DetailField
            label="料金"
            value={event.price !== null ? formatPrice(event.price) : "-"}
          />
          <DetailField label="説明" value={event.description ?? "-"} />
          <DetailField
            label="公開日時"
            value={formatDateTimeShort(event.publishedAt)}
          />
          <DetailField
            label="作成日時"
            value={formatDateTimeShort(event.createdAt)}
          />
          <DetailField
            label="更新日時"
            value={formatDateTimeShort(event.updatedAt)}
          />
        </div>
      </DetailSection>

      <DetailSection title={`参加者一覧（${String(confirmedCount)}名）`}>
        <EventRegistrationTable registrations={serializedRegistrations} />
      </DetailSection>
    </AdminDetailLayout>
  );
}
