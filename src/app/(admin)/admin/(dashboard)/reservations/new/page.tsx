import Link from "next/link";
import { connection } from "next/server";
import { getSpacesForReservation } from "@/admin/queries/reservation";
import { ReservationForm } from "../_components/ReservationForm";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { Button } from "@/admin/components/ui";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "新規予約 | Myrrh Rental Space",
};

export default async function NewReservationPage() {
  await connection();

  const spaces = await getSpacesForReservation();

  return (
    <AdminDetailLayout
      backHref="/admin/reservations"
      title="新規予約"
      subtitle="電話予約や対面予約など、管理者が手動で予約を入力します"
    >
      <div className="mb-4 flex justify-end">
        <Button variant="outline" asChild>
          <Link href="/admin/reservations/new-recurring">
            繰返し予約を作成する
          </Link>
        </Button>
      </div>
      <ReservationForm spaces={spaces} />
    </AdminDetailLayout>
  );
}
