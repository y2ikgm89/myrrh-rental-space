import { connection } from "next/server";
import { getSpacesForReservation } from "@/admin/queries/reservation";
import { getMaxRecurrenceInstances } from "@/shared/domain/reservations/payloads";
import { requireFeatureEnabled } from "@/shared/domain/features/check";
import { RecurringReservationForm } from "../_components/RecurringReservationForm";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import type { Metadata } from "next";
import { requireReservationCreatePage } from "@/admin/helpers/page-auth";

export const metadata: Metadata = {
  title: "繰返し予約作成 | Myrrh Rental Space",
};

export default async function NewRecurringReservationPage() {
  await connection();
  await requireReservationCreatePage();
  await requireFeatureEnabled("reservation");

  const [spaces, maxRecurrenceInstances] = await Promise.all([
    getSpacesForReservation(),
    getMaxRecurrenceInstances(),
  ]);

  return (
    <AdminDetailLayout
      backHref="/admin/reservations"
      title="繰返し予約作成"
      subtitle="毎週火曜など RRULE ベースの定期予約を一括作成します"
    >
      <RecurringReservationForm
        spaces={spaces}
        maxRecurrenceInstances={maxRecurrenceInstances}
      />
    </AdminDetailLayout>
  );
}
