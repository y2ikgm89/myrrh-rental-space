"use client";

/**
 * クーポン新規作成・編集フォーム
 *
 *   経由 JST 固定表示。
 */

import { useActionState, useEffect, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import {
  getFormProps,
  getInputProps,
  getTextareaProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { toast } from "sonner";
import { createCoupon, updateCoupon } from "@/admin/actions/coupon";
import type { CouponData } from "@/shared/domain/coupons/types";
import { couponFormSchema } from "@/shared/lib/validations/coupon";
import {
  Button,
  Card,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SubmitButton,
  Switch,
  Textarea,
} from "@/admin/components/ui";
import { CouponType } from "@/shared/lib/validations/enums/prisma-types";
import { isValidCouponType } from "@/shared/lib/validations/enums/guards";
import { formatDateTimeLocalInJst } from "@/shared/lib/date-format";

type CouponFormProps = {
  coupon?: CouponData;
};

export function CouponForm({ coupon }: CouponFormProps): ReactElement {
  const router = useRouter();
  const isEdit = !!coupon;

  const boundAction = isEdit
    ? updateCoupon.bind(null, coupon.id)
    : createCoupon;
  const [lastResult, action, isPending] = useActionState(
    boundAction,
    undefined,
  );

  const [form, fields] = useForm({
    id: isEdit ? `coupon-edit-${coupon.id}` : "coupon-create",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: couponFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: coupon
      ? {
          code: coupon.code,
          name: coupon.name,
          description: coupon.description ?? "",
          type: coupon.type,
          discountValue: String(coupon.discountValue),
          minReservationAmount:
            coupon.minReservationAmount !== null
              ? String(coupon.minReservationAmount)
              : "",
          maxDiscountAmount:
            coupon.maxDiscountAmount !== null
              ? String(coupon.maxDiscountAmount)
              : "",
          validFrom: formatDateTimeLocalInJst(coupon.validFrom),
          validUntil: coupon.validUntil
            ? formatDateTimeLocalInJst(coupon.validUntil)
            : "",
          usageLimit:
            coupon.usageLimit !== null ? String(coupon.usageLimit) : "",
          isActive: coupon.isActive ? "on" : "",
          canCombineWithDurationDiscount: coupon.canCombineWithDurationDiscount
            ? "on"
            : "",
        }
      : {
          code: "",
          name: "",
          description: "",
          type: CouponType.PERCENTAGE,
          discountValue: "10",
          minReservationAmount: "",
          maxDiscountAmount: "",
          validFrom: "",
          validUntil: "",
          usageLimit: "",
          isActive: "on",
          canCombineWithDurationDiscount: "on",
        },
  });

  const typeControl = useInputControl(fields.type);
  const isActiveControl = useInputControl(fields.isActive);
  const canCombineControl = useInputControl(
    fields.canCombineWithDurationDiscount,
  );

  const couponType =
    typeControl.value === CouponType.FIXED_AMOUNT
      ? CouponType.FIXED_AMOUNT
      : CouponType.PERCENTAGE;
  const isActive = isActiveControl.value === "on";
  const canCombine = canCombineControl.value === "on";

  function handleTypeChange(value: string) {
    if (!isValidCouponType(value)) return;
    typeControl.change(value);
  }

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success(
        isEdit ? "クーポンを更新しました" : "クーポンを作成しました",
      );
      router.push(isEdit ? `/admin/coupons/${coupon.id}` : "/admin/coupons");
    }
  }, [lastResult, router, isEdit, coupon]);

  const formErrors = form.errors;

  return (
    <form {...getFormProps(form)} action={action}>
      <Card className="p-6">
        <div className="space-y-6">
          {/* 基本情報 */}
          <div className="space-y-4">
            <h3 className="font-medium">基本情報</h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={fields.code.id}>
                  クーポンコード <span className="text-destructive">*</span>
                </Label>
                <Input
                  {...getInputProps(fields.code, { type: "text" })}
                  placeholder="SUMMER2024"
                  className="font-mono uppercase"
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">
                  大文字英数字のみ、4〜20文字
                </p>
                {fields.code.errors && (
                  <p
                    id={fields.code.errorId}
                    className="text-xs text-destructive"
                  >
                    {fields.code.errors.join(", ")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor={fields.name.id}>
                  クーポン名称 <span className="text-destructive">*</span>
                </Label>
                <Input
                  {...getInputProps(fields.name, { type: "text" })}
                  placeholder="夏季限定割引"
                  disabled={isPending}
                />
                {fields.name.errors && (
                  <p
                    id={fields.name.errorId}
                    className="text-xs text-destructive"
                  >
                    {fields.name.errors.join(", ")}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor={fields.description.id}>説明</Label>
              <Textarea
                {...getTextareaProps(fields.description)}
                placeholder="クーポンの説明..."
                rows={2}
                disabled={isPending}
              />
              {fields.description.errors && (
                <p
                  id={fields.description.errorId}
                  className="text-xs text-destructive"
                >
                  {fields.description.errors.join(", ")}
                </p>
              )}
            </div>
          </div>

          {/* 割引設定 */}
          <div className="space-y-4 border-t pt-6">
            <h3 className="font-medium">割引設定</h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={fields.type.id}>
                  割引タイプ <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={couponType}
                  onValueChange={handleTypeChange}
                  disabled={isPending}
                >
                  <SelectTrigger id={fields.type.id} onBlur={typeControl.blur}>
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
                <input
                  type="hidden"
                  name={fields.type.name}
                  value={couponType}
                />
                {fields.type.errors && (
                  <p className="text-xs text-destructive">
                    {fields.type.errors.join(", ")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor={fields.discountValue.id}>
                  割引値 <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    {...getInputProps(fields.discountValue, { type: "number" })}
                    min={1}
                    {...(couponType === CouponType.PERCENTAGE && { max: 100 })}
                    disabled={isPending}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {couponType === CouponType.PERCENTAGE ? "%" : "円"}
                  </span>
                </div>
                {fields.discountValue.errors && (
                  <p
                    id={fields.discountValue.errorId}
                    className="text-xs text-destructive"
                  >
                    {fields.discountValue.errors.join(", ")}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={fields.minReservationAmount.id}>
                  最低利用金額
                </Label>
                <div className="relative">
                  <Input
                    {...getInputProps(fields.minReservationAmount, {
                      type: "number",
                    })}
                    placeholder="例: 3000"
                    min={0}
                    disabled={isPending}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    円
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  この金額以上の予約でのみ使用可能
                </p>
                {fields.minReservationAmount.errors && (
                  <p
                    id={fields.minReservationAmount.errorId}
                    className="text-xs text-destructive"
                  >
                    {fields.minReservationAmount.errors.join(", ")}
                  </p>
                )}
              </div>

              {couponType === CouponType.PERCENTAGE && (
                <div className="space-y-2">
                  <Label htmlFor={fields.maxDiscountAmount.id}>
                    最大割引額
                  </Label>
                  <div className="relative">
                    <Input
                      {...getInputProps(fields.maxDiscountAmount, {
                        type: "number",
                      })}
                      placeholder="例: 2000"
                      min={1}
                      disabled={isPending}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      円
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    パーセント割引の上限額
                  </p>
                  {fields.maxDiscountAmount.errors && (
                    <p
                      id={fields.maxDiscountAmount.errorId}
                      className="text-xs text-destructive"
                    >
                      {fields.maxDiscountAmount.errors.join(", ")}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 有効期間 */}
          <div className="space-y-4 border-t pt-6">
            <h3 className="font-medium">有効期間</h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={fields.validFrom.id}>
                  開始日時 <span className="text-destructive">*</span>
                </Label>
                <Input
                  {...getInputProps(fields.validFrom, {
                    type: "datetime-local",
                  })}
                  disabled={isPending}
                />
                {fields.validFrom.errors && (
                  <p
                    id={fields.validFrom.errorId}
                    className="text-xs text-destructive"
                  >
                    {fields.validFrom.errors.join(", ")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor={fields.validUntil.id}>終了日時</Label>
                <Input
                  {...getInputProps(fields.validUntil, {
                    type: "datetime-local",
                  })}
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">
                  空欄の場合は無期限
                </p>
                {fields.validUntil.errors && (
                  <p
                    id={fields.validUntil.errorId}
                    className="text-xs text-destructive"
                  >
                    {fields.validUntil.errors.join(", ")}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* 利用制限 */}
          <div className="space-y-4 border-t pt-6">
            <h3 className="font-medium">利用制限・オプション</h3>

            <div className="space-y-2 max-w-[240px]">
              <Label htmlFor={fields.usageLimit.id}>利用回数上限</Label>
              <Input
                {...getInputProps(fields.usageLimit, { type: "number" })}
                placeholder="無制限"
                min={1}
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                空欄の場合は無制限
              </p>
              {fields.usageLimit.errors && (
                <p
                  id={fields.usageLimit.errorId}
                  className="text-xs text-destructive"
                >
                  {fields.usageLimit.errors.join(", ")}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor={fields.isActive.id}>クーポンを有効にする</Label>
                <p className="text-xs text-muted-foreground">
                  無効にすると使用できなくなります
                </p>
              </div>
              <Switch
                id={fields.isActive.id}
                checked={isActive}
                onCheckedChange={(checked) =>
                  isActiveControl.change(checked ? "on" : "")
                }
                onBlur={isActiveControl.blur}
                disabled={isPending}
              />
              <input
                type="hidden"
                name={fields.isActive.name}
                value={isActive ? "on" : ""}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor={fields.canCombineWithDurationDiscount.id}>
                  長時間割引との併用
                </Label>
                <p className="text-xs text-muted-foreground">
                  有効にすると長時間割引と併用できます
                </p>
              </div>
              <Switch
                id={fields.canCombineWithDurationDiscount.id}
                checked={canCombine}
                onCheckedChange={(checked) =>
                  canCombineControl.change(checked ? "on" : "")
                }
                onBlur={canCombineControl.blur}
                disabled={isPending}
              />
              <input
                type="hidden"
                name={fields.canCombineWithDurationDiscount.name}
                value={canCombine ? "on" : ""}
              />
            </div>
          </div>

          {formErrors && formErrors.length > 0 && (
            <div
              id={form.errorId}
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {formErrors.join(", ")}
            </div>
          )}

          {/* 送信ボタン */}
          <div className="flex justify-end gap-3 border-t pt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={isPending}
            >
              キャンセル
            </Button>
            <SubmitButton
              isPending={isPending}
              label={isEdit ? "クーポンを保存" : "クーポンを作成"}
              pendingLabel={isEdit ? "保存中..." : "作成中..."}
            />
          </div>
        </div>
      </Card>
    </form>
  );
}
