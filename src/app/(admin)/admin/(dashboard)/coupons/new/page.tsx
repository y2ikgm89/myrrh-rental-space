import { connection } from "next/server";
import { CouponForm } from "../_components/CouponForm";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { requireAdminPermission } from "@/admin/queries/_helpers";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "新規クーポン作成 | Myrrh Rental Space",
};

export default async function NewCouponPage() {
  await connection();
  await requireAdminPermission("coupon", "read");

  return (
    <AdminDetailLayout
      backHref="/admin/coupons"
      title="新規クーポン作成"
      subtitle="新しいクーポンを作成します"
    >
      <CouponForm />
    </AdminDetailLayout>
  );
}
