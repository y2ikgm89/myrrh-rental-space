import { notFound } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import { Pencil } from "lucide-react";
import {
  getReservationById,
  deleteReservation,
} from "@/admin/actions/reservation";
import { ReservationDetail } from "./_components/ReservationDetail";
import { Button } from "@/admin/components/ui";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { DangerZone } from "@/admin/components/DangerZone";
import type { Metadata } from "next";

type Params = Promise<{ id: string }>;

type PageProps = {
  params: Params;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await connection();
  const { id } = await params;
  const reservation = await getReservationById(id);

  if (!reservation) {
    return { title: "予約が見つかりません | Myrrh Rental Space" };
  }

  return {
    title: `予約詳細: ${reservation.customer.lastName}${reservation.customer.firstName} | Myrrh Rental Space`,
  };
}

export default async function ReservationDetailPage({ params }: PageProps) {
  await connection();
  const { id } = await params;
  const reservation = await getReservationById(id);

  if (!reservation) {
    notFound();
  }

  return (
    <AdminDetailLayout
      backHref="/admin/reservations"
      title={`${reservation.customer.lastName}${reservation.customer.firstName} 様の予約`}
      subtitle={reservation.space.name}
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link href={`/admin/reservations/${id}/edit`}>
            <Pencil className="mr-2 h-4 w-4" />
            編集
          </Link>
        </Button>
      }
    >
      <ReservationDetail reservation={reservation} />
      <DangerZone
        deleteLabel="予約を削除"
        onDelete={() => deleteReservation(reservation.id)}
        redirectTo="/admin/reservations"
      />
    </AdminDetailLayout>
  );
}
