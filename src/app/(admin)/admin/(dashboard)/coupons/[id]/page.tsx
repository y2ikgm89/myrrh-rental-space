import { notFound } from "next/navigation";
import { getCouponById } from "@/admin/queries/coupon";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { CouponForm } from "../_components/CouponForm";
import { CouponDangerZone } from "./_components/CouponDangerZone";
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
    return { title: "クーポンが見つかりません | Myrrh Rental Space" };
  }

  return {
    title: `${coupon.code} の編集 | Myrrh Rental Space`,
  };
}

export default async function EditCouponPage({ params }: PageProps) {
  const { id } = await params;
  const coupon = await getCouponById(id);

  if (!coupon) {
    notFound();
  }

  return (
    <AdminDetailLayout
      backHref="/admin/coupons"
      backLabel="一覧に戻る"
      title={`${coupon.code} の編集`}
      subtitle={coupon.name}
    >
      {/* 利用統計 */}
      <DetailSection title="利用統計">
        <div className="grid gap-4 sm:grid-cols-4">
          <DetailField
            label="利用回数"
            value={
              <span className="text-2xl font-bold">
                {coupon.usageCount}
                {coupon.usageLimit && (
                  <span className="text-sm font-normal text-muted-foreground">
                    {" "}
                    / {coupon.usageLimit}
                  </span>
                )}
              </span>
            }
          />
          <DetailField
            label="割引タイプ"
            value={
              <span className="text-lg font-medium">
                {coupon.type === "PERCENTAGE"
                  ? `${coupon.discountValue}%`
                  : formatPrice(coupon.discountValue)}
              </span>
            }
          />
          <DetailField
            label="開始日"
            value={<span className="text-lg">{coupon.validFromLabel}</span>}
          />
          <DetailField
            label="終了日"
            value={
              <span className="text-lg">
                {coupon.validUntilLabel ?? "無期限"}
              </span>
            }
          />
        </div>
      </DetailSection>

      {/* フォーム */}
      <CouponForm coupon={coupon} />

      <CouponDangerZone couponId={coupon.id} itemName={coupon.code} />
    </AdminDetailLayout>
  );
}
