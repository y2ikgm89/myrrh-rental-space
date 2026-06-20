import {
  getReservationDiscountSettings,
  getSpacesForReservation,
} from "@/admin/queries/reservation";
import { ReservationForm } from "../_components/ReservationForm";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "新規予約 | Myrrh Rental Space",
};

export default async function NewReservationPage() {
  const [spaces, discountSettings] = await Promise.all([
    getSpacesForReservation(),
    getReservationDiscountSettings(),
  ]);

  return (
    <AdminDetailLayout
      backHref="/admin/reservations"
      title="新規予約"
      subtitle="電話予約や対面予約など、管理者が手動で予約を入力します"
    >
      <ReservationForm spaces={spaces} discountSettings={discountSettings} />
    </AdminDetailLayout>
  );
}
