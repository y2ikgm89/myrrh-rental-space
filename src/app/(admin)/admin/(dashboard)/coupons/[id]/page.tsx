import { notFound } from "next/navigation";
import Link from "next/link";
import { IconPencil } from "@tabler/icons-react";
import { connection } from "next/server";
import { getCouponById } from "@/admin/queries/coupon";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { Button } from "@/admin/components/ui/button";
import { DetailDeleteButton } from "@/admin/components/DetailDeleteButton";
import { deleteCoupon } from "@/admin/actions/coupon";
import { CouponDetail } from "./_components/CouponDetail";
import { deriveCouponStatusNow } from "../_lib/coupon-status";
import type { Metadata } from "next";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const coupon = await getCouponById(id);

  if (!coupon) {
    return {
      title: "クーポンが見つかりません | Myrrh Rental Space",
    };
  }

  return {
    title: `${coupon.name} | クーポン管理 | Myrrh Rental Space`,
  };
}

export default async function CouponDetailPage({ params }: PageProps) {
  await connection();
  const { id } = await params;
  const coupon = await getCouponById(id);

  if (!coupon) {
    notFound();
  }

  const couponWithStatus = deriveCouponStatusNow(coupon);

  return (
    <AdminDetailLayout
      backHref="/admin/coupons"
      title={coupon.name}
      subtitle={`コード: ${coupon.code}`}
      actions={
        <>
          <DetailDeleteButton
            itemName={coupon.code}
            onDelete={deleteCoupon.bind(null, coupon.id)}
            redirectTo="/admin/coupons"
            successMessage="クーポンを削除しました"
          />
          <Button size="sm" asChild>
            <Link href={`/admin/coupons/${coupon.id}/edit`}>
              <IconPencil className="mr-2 h-4 w-4" />
              編集
            </Link>
          </Button>
        </>
      }
    >
      <CouponDetail coupon={couponWithStatus} />
    </AdminDetailLayout>
  );
}
