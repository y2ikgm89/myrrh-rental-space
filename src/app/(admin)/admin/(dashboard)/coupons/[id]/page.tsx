import { notFound } from "next/navigation";
import { getCouponById } from "@/admin/queries/coupon";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { CouponForm } from "../_components/CouponForm";
import { DetailDeleteButton } from "@/admin/components/DetailDeleteButton";
import { deleteCoupon } from "@/admin/actions/coupon";
import { DetailSection } from "@/admin/components/DetailSection";
import { DetailField } from "@/admin/components/DetailField";
import { formatPrice } from "@/shared/lib/price-format";
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
  const { id } = await params;
  const coupon = await getCouponById(id);

  if (!coupon) {
    notFound();
  }

  return (
    <AdminDetailLayout
      backHref="/admin/coupons"
      title={coupon.name}
      subtitle={`コード: ${coupon.code}`}
      actions={
        <DetailDeleteButton
          itemName={coupon.code}
          onDelete={deleteCoupon.bind(null, coupon.id)}
          redirectTo="/admin/coupons"
          successMessage="クーポンを削除しました"
        />
      }
    >
      <DetailSection title="利用状況">
        <div className="grid gap-4 sm:grid-cols-3">
          <DetailField
            label="利用回数"
            value={`${coupon.usageCount}${coupon.usageLimit !== null ? ` / ${coupon.usageLimit}` : ""} 回`}
          />
          <DetailField
            label="割引額"
            value={
              coupon.type === "PERCENTAGE"
                ? `${coupon.discountValue}%`
                : formatPrice(coupon.discountValue)
            }
          />
          <DetailField
            label="最低利用金額"
            value={formatPrice(coupon.minReservationAmount, "なし")}
          />
        </div>
      </DetailSection>

      {/* フォーム */}
      <CouponForm coupon={coupon} />
    </AdminDetailLayout>
  );
}
