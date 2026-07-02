import { notFound } from "next/navigation";
import { connection } from "next/server";
import {
  getReservationById,
  getReservationDiscountSettings,
  getSpacesForReservation,
} from "@/admin/queries/reservation";
import { ReservationEditForm } from "../../_components/ReservationEditForm";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
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
    title: `予約編集: ${reservation.customer.lastName}${reservation.customer.firstName} | Myrrh Rental Space`,
  };
}

export default async function ReservationEditPage({ params }: PageProps) {
  await connection();

  const { id } = await params;

  const [reservation, spaces, discountSettings] = await Promise.all([
    getReservationById(id),
    getSpacesForReservation(),
    getReservationDiscountSettings(),
  ]);

  if (!reservation) {
    notFound();
  }

  return (
    <AdminDetailLayout
      backHref={`/admin/reservations/${id}`}
      backLabel="詳細に戻る"
      title="予約を編集"
      subtitle={`${reservation.customer.lastName} ${reservation.customer.firstName} 様の予約`}
    >
      {/* 編集フォーム */}
      <ReservationEditForm
        key={reservation.id}
        reservation={reservation}
        spaces={spaces}
        discountSettings={discountSettings}
      />
    </AdminDetailLayout>
  );
}
