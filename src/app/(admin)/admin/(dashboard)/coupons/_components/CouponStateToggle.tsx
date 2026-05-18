"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/admin/components/ui";
import { updateCouponActive } from "@/admin/actions/coupon";
import { isMutationError } from "@/shared/lib/mutation-result";
import { cn } from "@/shared/lib/cn";
import type { CouponStatusType } from "../_lib/coupon-status";
import { COUPON_STATUS_CONFIG } from "./CouponStatusBadge";

type CouponStateToggleProps = {
  id: string;
  isActive: boolean;
  status: CouponStatusType;
  name: string;
};

/**
 * クーポン一覧の状態セル: Switch (binary 制御) + 派生 5 状態テキスト (visual indicator)。
 *
 * 設計判断:
 * - PublishSwitch SSoT (binary publish/unpublish の canonical) を流用せず
 *   クーポン専用に分離。PublishSwitch.label の API abuse を回避
 * - Switch = admin の `isActive` 切替（binary）
 * - 下のテキスト = computed operational state (active/inactive/expired/limitReached/notStarted)
 * - セマンティックカラーで warning 状態 (期限切れ / 上限到達) を即時識別可能
 *   （WCAG 1.4.1 Use of Color 補強）
 * - 業界標準（Shopify Discounts / Stripe Promotion Codes / Linear Status）と整合
 *
 * 詳細ページでは `<CouponStatusBadge>` (colored Badge) を使用。
 */
export function CouponStateToggle({
  id,
  isActive,
  status,
  name,
}: CouponStateToggleProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const config = COUPON_STATUS_CONFIG[status];

  const handleChange = (checked: boolean) => {
    startTransition(async () => {
      const result = await updateCouponActive(id, checked);
      if (isMutationError(result)) {
        toast.error(result.error);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div className="inline-flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 py-2">
      <Switch
        checked={isActive}
        onCheckedChange={handleChange}
        disabled={isPending}
        aria-label={`${name} のステータス（現在: ${config.label}）`}
      />
      <span
        className={cn("text-xs font-medium", config.textColor)}
        aria-hidden="true"
      >
        {config.label}
      </span>
    </div>
  );
}
