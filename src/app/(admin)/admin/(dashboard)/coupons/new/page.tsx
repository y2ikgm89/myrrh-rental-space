import { CouponForm } from "../_components/CouponForm";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "新規クーポン作成 | Myrrh Rental Space",
};

export default function NewCouponPage() {
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
