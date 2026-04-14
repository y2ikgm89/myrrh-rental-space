"use client";

import type { ReactElement } from "react";
import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
import { createCoupon, updateCoupon } from "@/admin/actions/coupon";
import type { CouponData } from "@/shared/domain/coupons/types";
import { couponFormSchema } from "@/shared/lib/validations/coupon";
import {
  Button,
  Input,
  Label,
  Card,
  Textarea,
  Switch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SubmitButton,
} from "@/admin/components/ui";
import { CouponType } from "@/shared/lib/validations/enums/prisma-types";
import { isValidCouponType } from "@/shared/lib/validations/enums/guards";
import { useFormAction } from "@/admin/hooks";

// =============================================================================
// Types
// =============================================================================

type CouponFormProps = {
  coupon?: CouponData;
};

// =============================================================================
// Form Helpers
// =============================================================================

function formatDateForInput(date: string): string {
  return date.slice(0, 16);
}

// =============================================================================
// Component
// =============================================================================

export function CouponForm({ coupon }: CouponFormProps): ReactElement {
  const router = useRouter();
  const isEdit = !!coupon;

  const { form, isPending, onSubmit } = useFormAction(
    couponFormSchema,
    async (data) => {
      if (isEdit) {
        return updateCoupon(coupon.id, data);
      }
      return createCoupon(data);
    },
    {
      redirectTo: "/admin/coupons",
      successMessage: isEdit
        ? "クーポンを更新しました"
        : "クーポンを作成しました",
      defaultValues: coupon
        ? {
            code: coupon.code,
            name: coupon.name,
            description: coupon.description ?? "",
            type: coupon.type,
            discountValue: coupon.discountValue,
            minReservationAmount: coupon.minReservationAmount ?? undefined,
            maxDiscountAmount: coupon.maxDiscountAmount ?? undefined,
            validFrom: formatDateForInput(coupon.validFrom),
            validUntil: coupon.validUntil
              ? formatDateForInput(coupon.validUntil)
              : undefined,
            usageLimit: coupon.usageLimit ?? undefined,
            isActive: coupon.isActive,
            canCombineWithDurationDiscount:
              coupon.canCombineWithDurationDiscount,
          }
        : {
            code: "",
            name: "",
            description: "",
            type: CouponType.PERCENTAGE,
            discountValue: 10,
            validFrom: "",
            isActive: true,
            canCombineWithDurationDiscount: true,
          },
    },
  );

  const {
    register,
    control,
    setValue,
    formState: { errors },
  } = form;

  // useWatch: React Compiler互換（watch()は非推奨）
  const couponType = useWatch({ control, name: "type" });
  const isActive = useWatch({ control, name: "isActive" });
  const canCombine = useWatch({
    control,
    name: "canCombineWithDurationDiscount",
  });

  return (
    <form onSubmit={onSubmit}>
      <Card className="p-6">
        <div className="space-y-6">
          {/* 基本情報 */}
          <div className="space-y-4">
            <h3 className="font-medium">基本情報</h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="code">
                  クーポンコード <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="code"
                  {...register("code")}
                  placeholder="SUMMER2024"
                  className="font-mono uppercase"
                  aria-invalid={!!errors.code}
                  aria-describedby={errors.code ? "code-error" : undefined}
                />
                <p className="text-xs text-muted-foreground">
                  大文字英数字のみ、4〜20文字
                </p>
                {errors.code && (
                  <p id="code-error" className="text-xs text-destructive">
                    {errors.code.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">
                  クーポン名称 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  {...register("name")}
                  placeholder="夏季限定割引"
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? "name-error" : undefined}
                />
                {errors.name && (
                  <p id="name-error" className="text-xs text-destructive">
                    {errors.name.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">説明</Label>
              <Textarea
                id="description"
                {...register("description")}
                placeholder="クーポンの説明..."
                rows={2}
              />
            </div>
          </div>

          {/* 割引設定 */}
          <div className="space-y-4 border-t pt-6">
            <h3 className="font-medium">割引設定</h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="type">
                  割引タイプ <span className="text-destructive">*</span>
                </Label>
                <Select
                  defaultValue={coupon?.type ?? CouponType.PERCENTAGE}
                  onValueChange={(value) => {
                    if (isValidCouponType(value)) setValue("type", value);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CouponType.PERCENTAGE}>
                      パーセント割引
                    </SelectItem>
                    <SelectItem value={CouponType.FIXED_AMOUNT}>
                      定額割引
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="discountValue">
                  割引値 <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="discountValue"
                    type="number"
                    {...register("discountValue")}
                    min={1}
                    max={couponType === CouponType.PERCENTAGE ? 100 : undefined}
                    aria-invalid={!!errors.discountValue}
                    aria-describedby={
                      errors.discountValue ? "discountValue-error" : undefined
                    }
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {couponType === CouponType.PERCENTAGE ? "%" : "円"}
                  </span>
                </div>
                {errors.discountValue && (
                  <p
                    id="discountValue-error"
                    className="text-xs text-destructive"
                  >
                    {errors.discountValue.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="minReservationAmount">最低利用金額</Label>
                <div className="relative">
                  <Input
                    id="minReservationAmount"
                    type="number"
                    {...register("minReservationAmount")}
                    placeholder="例: 3000"
                    min={0}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    円
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  この金額以上の予約でのみ使用可能
                </p>
              </div>

              {couponType === CouponType.PERCENTAGE && (
                <div className="space-y-2">
                  <Label htmlFor="maxDiscountAmount">最大割引額</Label>
                  <div className="relative">
                    <Input
                      id="maxDiscountAmount"
                      type="number"
                      {...register("maxDiscountAmount")}
                      placeholder="例: 2000"
                      min={1}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      円
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    パーセント割引の上限額
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 有効期間 */}
          <div className="space-y-4 border-t pt-6">
            <h3 className="font-medium">有効期間</h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="validFrom">
                  開始日時 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="validFrom"
                  type="datetime-local"
                  {...register("validFrom")}
                  aria-invalid={!!errors.validFrom}
                  aria-describedby={
                    errors.validFrom ? "validFrom-error" : undefined
                  }
                />
                {errors.validFrom && (
                  <p id="validFrom-error" className="text-xs text-destructive">
                    {errors.validFrom.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="validUntil">終了日時</Label>
                <Input
                  id="validUntil"
                  type="datetime-local"
                  {...register("validUntil")}
                />
                <p className="text-xs text-muted-foreground">
                  空欄の場合は無期限
                </p>
              </div>
            </div>
          </div>

          {/* 利用制限 */}
          <div className="space-y-4 border-t pt-6">
            <h3 className="font-medium">利用制限・オプション</h3>

            <div className="space-y-2">
              <Label htmlFor="usageLimit">利用回数上限</Label>
              <Input
                id="usageLimit"
                type="number"
                {...register("usageLimit")}
                placeholder="無制限"
                min={1}
                className="max-w-[200px]"
              />
              <p className="text-xs text-muted-foreground">
                空欄の場合は無制限
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="isActive">クーポンを有効にする</Label>
                <p className="text-xs text-muted-foreground">
                  無効にすると使用できなくなります
                </p>
              </div>
              <Switch
                id="isActive"
                checked={isActive ?? false}
                onCheckedChange={(checked) => setValue("isActive", checked)}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="canCombineWithDurationDiscount">
                  長時間割引との併用
                </Label>
                <p className="text-xs text-muted-foreground">
                  有効にすると長時間割引と併用できます
                </p>
              </div>
              <Switch
                id="canCombineWithDurationDiscount"
                checked={canCombine ?? false}
                onCheckedChange={(checked) =>
                  setValue("canCombineWithDurationDiscount", checked)
                }
              />
            </div>
          </div>

          {/* 送信ボタン */}
          <div className="flex justify-end gap-3 border-t pt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              キャンセル
            </Button>
            <SubmitButton
              isPending={isPending}
              label={isEdit ? "クーポンを保存" : "クーポンを作成"}
              pendingLabel={isEdit ? "保存中..." : "作成中..."}
              {...(isEdit && { disabled: !form.formState.isDirty })}
            />
          </div>
        </div>
      </Card>
    </form>
  );
}
