import { DetailSection } from "@/admin/components/DetailSection";
import { DetailField } from "@/admin/components/DetailField";
import {
  CouponStatusBadge,
  CouponTypeBadge,
} from "../../_components/CouponStatusBadge";
import type { CouponDetailData } from "@/shared/domain/coupons/types";
import type { CouponStatusType } from "../../_lib/coupon-status";
import { formatPrice } from "@/shared/lib/pricing/format";
import { formatDateTimeFull } from "@/shared/lib/date-format";

type CouponDetailProps = {
  coupon: CouponDetailData & { status: CouponStatusType };
};

export function CouponDetail({ coupon }: CouponDetailProps) {
  const discountValueLabel =
    coupon.type === "PERCENTAGE"
      ? `${coupon.discountValue}%`
      : formatPrice(coupon.discountValue);

  return (
    <div className="space-y-6">
      <DetailSection title="基本情報">
        <div className="grid gap-4 sm:grid-cols-2">
          <DetailField
            label="ステータス"
            value={<CouponStatusBadge status={coupon.status} />}
          />
          <DetailField
            label="タイプ"
            value={<CouponTypeBadge type={coupon.type} />}
          />
          <DetailField
            label="クーポンコード"
            value={<span className="font-mono">{coupon.code}</span>}
          />
          <DetailField label="クーポン名称" value={coupon.name} />
          <DetailField
            label="説明"
            value={coupon.description}
            className="sm:col-span-2"
          />
        </div>
      </DetailSection>

      <DetailSection title="割引設定">
        <div className="grid gap-4 sm:grid-cols-3">
          <DetailField
            label="割引値"
            value={
              <span className="text-2xl font-bold">{discountValueLabel}</span>
            }
          />
          <DetailField
            label="最低利用金額"
            value={formatPrice(coupon.minReservationAmount, "なし")}
          />
          <DetailField
            label="最大割引額"
            value={
              coupon.type === "PERCENTAGE"
                ? formatPrice(coupon.maxDiscountAmount, "なし")
                : "—"
            }
          />
        </div>
      </DetailSection>

      <DetailSection title="有効期間">
        <div className="grid gap-4 sm:grid-cols-2">
          <DetailField label="開始日時" value={coupon.validFromLabel} />
          <DetailField
            label="終了日時"
            value={coupon.validUntilLabel ?? "無期限"}
          />
        </div>
      </DetailSection>

      <DetailSection title="利用状況">
        <div className="grid gap-4 sm:grid-cols-2">
          <DetailField
            label="利用回数"
            value={
              <span className="text-2xl font-bold">{coupon.usageCount}</span>
            }
          />
          <DetailField
            label="利用回数上限"
            value={
              coupon.usageLimit !== null ? `${coupon.usageLimit} 回` : "無制限"
            }
          />
        </div>
      </DetailSection>

      <DetailSection title="オプション">
        <DetailField
          label="長時間割引との併用"
          value={coupon.canCombineWithDurationDiscount ? "可能" : "不可"}
        />
      </DetailSection>

      <DetailSection title="メタ情報">
        <div className="grid gap-4 sm:grid-cols-2">
          <DetailField
            label="作成日時"
            value={formatDateTimeFull(coupon.createdAt)}
          />
          <DetailField
            label="最終更新日時"
            value={formatDateTimeFull(coupon.updatedAt)}
          />
        </div>
      </DetailSection>
    </div>
  );
}
