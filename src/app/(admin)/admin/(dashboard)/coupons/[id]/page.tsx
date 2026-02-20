import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getCouponById, deleteCoupon } from "@/admin/actions/coupon";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { DangerZone } from "@/admin/components/DangerZone";
import { CouponForm } from "../_components/CouponForm";
import { DetailSection } from "@/admin/components/DetailSection";
import { DetailField } from "@/admin/components/DetailField";
import { formatDateShort, formatPrice } from "@/shared/lib/utils";
import type { Metadata } from "next";

// 管理画面の動的ルートはビルド時プリレンダリングをスキップ

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await connection();
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
  await connection();
  const { id } = await params;
  const coupon = await getCouponById(id);

  if (!coupon) {
    notFound();
  }

  return (
    <AdminDetailLayout
      backHref="/admin/coupons"
      backLabel="クーポン一覧に戻る"
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
                    {" "}/ {coupon.usageLimit}
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
            value={<span className="text-lg">{formatDateShort(coupon.validFrom)}</span>}
          />
          <DetailField
            label="終了日"
            value={
              <span className="text-lg">
                {coupon.validUntil ? formatDateShort(coupon.validUntil) : "無期限"}
              </span>
            }
          />
        </div>
      </DetailSection>

      {/* フォーム */}
      <CouponForm coupon={coupon} />

      <DangerZone
        deleteLabel="クーポンを削除"
        itemName={coupon.code}
        onDelete={deleteCoupon.bind(null, coupon.id)}
        redirectTo="/admin/coupons"
      />
    </AdminDetailLayout>
  );
}
