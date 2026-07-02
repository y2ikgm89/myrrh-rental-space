import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getCouponById } from "@/admin/queries/coupon";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { CouponForm } from "../../_components/CouponForm";
import type { Metadata } from "next";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await connection();

  const { id } = await params;
  const coupon = await getCouponById(id);
  if (!coupon) return {};

  return {
    title: `${coupon.name} - クーポン編集 | Myrrh Rental Space`,
  };
}

export default async function CouponEditPage({ params }: PageProps) {
  await connection();

  const { id } = await params;
  const coupon = await getCouponById(id);
  if (!coupon) notFound();

  return (
    <AdminDetailLayout
      backHref={`/admin/coupons/${id}`}
      backLabel="詳細に戻る"
      title="クーポンを編集"
      subtitle={`コード: ${coupon.code}`}
    >
      <CouponForm key={coupon.id} coupon={coupon} />
    </AdminDetailLayout>
  );
}
