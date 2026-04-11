import { notFound } from "next/navigation";
import { IconPencil } from "@tabler/icons-react";
import Link from "next/link";
import { getReservationById } from "@/admin/queries/reservation";
import { getTermsAgreementsForReservation } from "@/shared/domain/terms/admin-queries";
import { ReservationDetail } from "./_components/ReservationDetail";
import { TermsAgreements } from "./_components/TermsAgreements";
import { DetailDeleteButton } from "@/admin/components/DetailDeleteButton";
import { deleteReservation } from "@/admin/actions/reservation";
import { Button } from "@/admin/components/ui";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import type { Metadata } from "next";

type Params = Promise<{ id: string }>;

type PageProps = {
  params: Params;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
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
  const { id } = await params;
  const [reservation, agreements] = await Promise.all([
    getReservationById(id),
    getTermsAgreementsForReservation(id),
  ]);

  if (!reservation) {
    notFound();
  }

  return (
    <AdminDetailLayout
      backHref="/admin/reservations"
      title={`${reservation.customer.lastName}${reservation.customer.firstName} 様の予約`}
      subtitle={reservation.space.name}
      actions={
        <>
          <DetailDeleteButton
            itemName={`${reservation.customer.lastName}${reservation.customer.firstName} 様の予約`}
            onDelete={deleteReservation.bind(null, reservation.id)}
            redirectTo="/admin/reservations"
            successMessage="予約を削除しました"
          />
          <Button size="sm" asChild>
            <Link href={`/admin/reservations/${id}/edit`}>
              <IconPencil className="mr-2 h-4 w-4" />
              編集
            </Link>
          </Button>
        </>
      }
    >
      <ReservationDetail reservation={reservation} />
      <TermsAgreements agreements={agreements} />
    </AdminDetailLayout>
  );
}
