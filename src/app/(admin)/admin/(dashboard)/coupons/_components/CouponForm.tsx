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
  Card,
  Textarea,
  Switch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SubmitButton,
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from "@/admin/components/ui";
import { CouponType } from "@/shared/lib/validations/enums/prisma-types";
import { isValidCouponType } from "@/shared/lib/validations/enums/guards";
import { useFormAction } from "@/admin/hooks";
import { formatDateTimeLocalInJst } from "@/shared/lib/date-format";

type CouponFormProps = {
  coupon?: CouponData;
};

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
      redirectTo: isEdit ? `/admin/coupons/${coupon.id}` : "/admin/coupons",
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
            minReservationAmount: coupon.minReservationAmount,
            maxDiscountAmount: coupon.maxDiscountAmount,
            validFrom: formatDateTimeLocalInJst(coupon.validFrom),
            validUntil: coupon.validUntil
              ? formatDateTimeLocalInJst(coupon.validUntil)
              : "",
            usageLimit: coupon.usageLimit,
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
            minReservationAmount: null,
            maxDiscountAmount: null,
            validFrom: "",
            validUntil: "",
            usageLimit: null,
            isActive: true,
            canCombineWithDurationDiscount: true,
          },
    },
  );

  // useWatch: フォーム値の reactive 購読（React Compiler 互換）
  const couponType = useWatch({ control: form.control, name: "type" });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <Card className="p-6">
          <div className="space-y-6">
            {/* 基本情報 */}
            <div className="space-y-4">
              <h3 className="font-medium">基本情報</h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        クーポンコード{" "}
                        <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="SUMMER2024"
                          className="font-mono uppercase"
                          disabled={isPending}
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        大文字英数字のみ、4〜20文字
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        クーポン名称 <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="夏季限定割引"
                          disabled={isPending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>説明</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        value={field.value ?? ""}
                        placeholder="クーポンの説明..."
                        rows={2}
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* 割引設定 */}
            <div className="space-y-4 border-t pt-6">
              <h3 className="font-medium">割引設定</h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        割引タイプ <span className="text-destructive">*</span>
                      </FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(value) => {
                          if (isValidCouponType(value)) field.onChange(value);
                        }}
                        disabled={isPending}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={CouponType.PERCENTAGE}>
                            パーセント割引
                          </SelectItem>
                          <SelectItem value={CouponType.FIXED_AMOUNT}>
                            定額割引
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="discountValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        割引値 <span className="text-destructive">*</span>
                      </FormLabel>
                      <div className="relative">
                        <FormControl>
                          <Input
                            name={field.name}
                            ref={field.ref}
                            onBlur={field.onBlur}
                            type="number"
                            value={
                              typeof field.value === "number" ? field.value : ""
                            }
                            onChange={(e) =>
                              field.onChange(
                                e.target.value === ""
                                  ? undefined
                                  : Number(e.target.value),
                              )
                            }
                            min={1}
                            max={
                              couponType === CouponType.PERCENTAGE
                                ? 100
                                : undefined
                            }
                            disabled={isPending}
                          />
                        </FormControl>
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          {couponType === CouponType.PERCENTAGE ? "%" : "円"}
                        </span>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="minReservationAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>最低利用金額</FormLabel>
                      <div className="relative">
                        <FormControl>
                          <Input
                            name={field.name}
                            ref={field.ref}
                            onBlur={field.onBlur}
                            type="number"
                            value={
                              typeof field.value === "number" ? field.value : ""
                            }
                            onChange={(e) =>
                              field.onChange(
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                              )
                            }
                            placeholder="例: 3000"
                            min={0}
                            disabled={isPending}
                          />
                        </FormControl>
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          円
                        </span>
                      </div>
                      <FormDescription className="text-xs">
                        この金額以上の予約でのみ使用可能
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {couponType === CouponType.PERCENTAGE && (
                  <FormField
                    control={form.control}
                    name="maxDiscountAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>最大割引額</FormLabel>
                        <div className="relative">
                          <FormControl>
                            <Input
                              name={field.name}
                              ref={field.ref}
                              onBlur={field.onBlur}
                              type="number"
                              value={
                                typeof field.value === "number"
                                  ? field.value
                                  : ""
                              }
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                                )
                              }
                              placeholder="例: 2000"
                              min={1}
                              disabled={isPending}
                            />
                          </FormControl>
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                            円
                          </span>
                        </div>
                        <FormDescription className="text-xs">
                          パーセント割引の上限額
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            </div>

            {/* 有効期間 */}
            <div className="space-y-4 border-t pt-6">
              <h3 className="font-medium">有効期間</h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="validFrom"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        開始日時 <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="datetime-local"
                          disabled={isPending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="validUntil"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>終了日時</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          type="datetime-local"
                          disabled={isPending}
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        空欄の場合は無期限
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* 利用制限 */}
            <div className="space-y-4 border-t pt-6">
              <h3 className="font-medium">利用制限・オプション</h3>

              <FormField
                control={form.control}
                name="usageLimit"
                render={({ field }) => (
                  <FormItem className="max-w-[240px]">
                    <FormLabel>利用回数上限</FormLabel>
                    <FormControl>
                      <Input
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        type="number"
                        value={
                          typeof field.value === "number" ? field.value : ""
                        }
                        onChange={(e) =>
                          field.onChange(
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                          )
                        }
                        placeholder="無制限"
                        min={1}
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      空欄の場合は無制限
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel>クーポンを有効にする</FormLabel>
                      <FormDescription className="text-xs">
                        無効にすると使用できなくなります
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value ?? false}
                        onCheckedChange={field.onChange}
                        disabled={isPending}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="canCombineWithDurationDiscount"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel>長時間割引との併用</FormLabel>
                      <FormDescription className="text-xs">
                        有効にすると長時間割引と併用できます
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value ?? false}
                        onCheckedChange={field.onChange}
                        disabled={isPending}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

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
                {...(isEdit && { disabled: !form.formState.isDirty })}
              />
            </div>
          </div>
        </Card>
      </form>
    </Form>
  );
}
