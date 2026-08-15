import { notFound } from "next/navigation";
import { connection } from "next/server";
import { IconPencil } from "@tabler/icons-react";
import Link from "next/link";
import {
  getReservationById,
  getReservationSeriesInfo,
} from "@/admin/queries/reservation";
import { ReservationDetail } from "./_components/ReservationDetail";
import { RestoreReservationStatusButton } from "./_components/RestoreReservationStatusButton";
import { SeriesInfoSection } from "./_components/SeriesInfoSection";
import { DetailDeleteButton } from "@/admin/components/DetailDeleteButton";
import { deleteReservation } from "@/admin/actions/reservation";
import { Button } from "@/admin/components/ui";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { verifyAdminSession } from "@/shared/domain/admin-auth/session";
import { isFeatureEnabled } from "@/shared/domain/features/check";
import { Role } from "@/shared/lib/validations/enums/prisma-types";
import { hasPermission } from "@/shared/lib/admin-permissions";
import { getRefundPolicySettings } from "@/shared/domain/settings/admin-queries";
import { calculateSuggestedRefundAmountNow } from "../_lib/suggested-refund-amount";
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
  const [reservation, sessionUser, paymentEnabled, seriesInfo] =
    await Promise.all([
      getReservationById(id),
      verifyAdminSession(),
      isFeatureEnabled("payment"),
      getReservationSeriesInfo(id),
    ]);

  if (!reservation) {
    notFound();
  }

  const refundPolicyData = await getRefundPolicySettings();
  const suggestedRefundAmount = calculateSuggestedRefundAmountNow(
    refundPolicyData.resolution,
    reservation,
  );

  const canRestoreStatus = sessionUser.role === Role.SUPER_ADMIN;
  const canUpdate = hasPermission(sessionUser.role, "reservation", "update");
  const canDelete = hasPermission(sessionUser.role, "reservation", "delete");

  return (
    <AdminDetailLayout
      backHref="/admin/reservations"
      title={`${reservation.customer.lastName}${reservation.customer.firstName} 様の予約`}
      subtitle={reservation.space.name}
      actions={
        <>
          {canRestoreStatus && (
            <RestoreReservationStatusButton
              reservationId={reservation.id}
              currentStatus={reservation.status}
            />
          )}
          {canDelete ? (
            <DetailDeleteButton
              itemName={`${reservation.customer.lastName}${reservation.customer.firstName} 様の予約`}
              onDelete={deleteReservation.bind(null, reservation.id)}
              redirectTo="/admin/reservations"
              successMessage="予約を削除しました"
            />
          ) : null}
          {canUpdate ? (
            <Button size="sm" asChild>
              <Link href={`/admin/reservations/${id}/edit`}>
                <IconPencil className="mr-2 h-4 w-4" />
                編集
              </Link>
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-6">
        {seriesInfo && (
          <SeriesInfoSection
            reservationId={reservation.id}
            series={seriesInfo}
            canMutate={canUpdate}
          />
        )}
        <ReservationDetail
          key={reservation.id}
          reservation={reservation}
          paymentEnabled={paymentEnabled}
          suggestedRefundAmount={suggestedRefundAmount}
          canUpdate={canUpdate}
        />
      </div>
    </AdminDetailLayout>
  );
}
