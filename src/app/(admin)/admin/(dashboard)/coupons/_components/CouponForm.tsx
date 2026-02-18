'use client'

import { useActionState, useEffect, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createCoupon, updateCoupon, type CouponData } from '@/admin/actions/coupon'
import {
  couponFormSchema,
  type CouponFormInput,
} from '@/shared/lib/validations/coupon'
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
} from '@/admin/components/ui'
import { cn } from '@/shared/lib/utils'
import { CouponType, isValidCouponType, getValidCouponType } from '@/shared/lib/validations/enums'

// =============================================================================
// Types
// =============================================================================

type FormState = {
  success: boolean
  message: string
  couponId?: string
} | null

type CouponFormProps = {
  coupon?: CouponData
}

// =============================================================================
// Form Helpers
// =============================================================================

function formatDateForInput(date: Date): string {
  return date.toISOString().slice(0, 16)
}

function getFormString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key)
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function getFormNumber(formData: FormData, key: string): number | undefined {
  const value = formData.get(key)
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const num = Number(value)
  return Number.isNaN(num) ? undefined : num
}

function getFormBoolean(formData: FormData, key: string): boolean {
  return formData.get(key) === 'on' || formData.get(key) === 'true'
}

function getSubmitButtonLabel(isPending: boolean, isEdit: boolean): string {
  if (isPending) {
    return isEdit ? '保存中...' : '作成中...'
  }
  return isEdit ? 'クーポンを保存' : 'クーポンを作成'
}

// =============================================================================
// Component
// =============================================================================

export function CouponForm({ coupon }: CouponFormProps): ReactElement {
  const router = useRouter()
  const isEdit = !!coupon

  async function submitAction(
    _prevState: FormState,
    formData: FormData
  ): Promise<FormState> {
    const input: CouponFormInput = {
      code: getFormString(formData, 'code') ?? '',
      name: getFormString(formData, 'name') ?? '',
      description: getFormString(formData, 'description') ?? '',
      type: getValidCouponType(getFormString(formData, 'type'), CouponType.PERCENTAGE),
      discountValue: getFormNumber(formData, 'discountValue') ?? 0,
      minReservationAmount: getFormNumber(formData, 'minReservationAmount') ?? null,
      maxDiscountAmount: getFormNumber(formData, 'maxDiscountAmount') ?? null,
      validFrom: new Date(getFormString(formData, 'validFrom') ?? ''),
      validUntil: getFormString(formData, 'validUntil')
        ? new Date(getFormString(formData, 'validUntil')!)
        : null,
      usageLimit: getFormNumber(formData, 'usageLimit') ?? null,
      isActive: getFormBoolean(formData, 'isActive'),
      canCombineWithDurationDiscount: getFormBoolean(formData, 'canCombineWithDurationDiscount'),
    }

    if (isEdit) {
      const result = await updateCoupon(coupon.id, input)
      if (!result.success) {
        return { success: false, message: result.error }
      }
      return { success: true, message: result.message, couponId: coupon.id }
    }

    const result = await createCoupon(input)
    if (!result.success) {
      return { success: false, message: result.error }
    }
    return { success: true, message: result.message, couponId: result.data.id }
  }

  const [state, formAction, isPending] = useActionState(submitAction, null)

  const {
    register,
    control,
    setValue,
    formState: { errors },
  } = useForm<CouponFormInput>({
    resolver: zodResolver(couponFormSchema),
    defaultValues: coupon
      ? {
          code: coupon.code,
          name: coupon.name,
          description: coupon.description ?? '',
          type: coupon.type,
          discountValue: coupon.discountValue,
          minReservationAmount: coupon.minReservationAmount ?? undefined,
          maxDiscountAmount: coupon.maxDiscountAmount ?? undefined,
          validFrom: coupon.validFrom,
          validUntil: coupon.validUntil ?? undefined,
          usageLimit: coupon.usageLimit ?? undefined,
          isActive: coupon.isActive,
          canCombineWithDurationDiscount: coupon.canCombineWithDurationDiscount,
        }
      : {
          code: '',
          name: '',
          description: '',
          type: CouponType.PERCENTAGE,
          discountValue: 10,
          validFrom: new Date(),
          isActive: true,
          canCombineWithDurationDiscount: true,
        },
  })

  // useWatch: React Compiler互換（watch()は非推奨）
  const couponType = useWatch({ control, name: 'type' })
  const isActive = useWatch({ control, name: 'isActive' })
  const canCombine = useWatch({ control, name: 'canCombineWithDurationDiscount' })

  useEffect(() => {
    if (state?.success) {
      router.push('/admin/coupons')
    }
  }, [state?.success, router])

  return (
    <form action={formAction}>
      <Card className="p-6">
        <div className="space-y-6">
          {/* エラーメッセージ */}
          {state && !state.success && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {state.message}
            </div>
          )}

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
                  {...register('code')}
                  placeholder="SUMMER2024"
                  className="font-mono uppercase"
                  aria-invalid={!!errors.code}
                  aria-describedby={errors.code ? 'code-error' : undefined}
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
                  {...register('name')}
                  placeholder="夏季限定割引"
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? 'name-error' : undefined}
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
                {...register('description')}
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
                  onValueChange={(value) => { if (isValidCouponType(value)) setValue('type', value) }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CouponType.PERCENTAGE}>パーセント割引</SelectItem>
                    <SelectItem value={CouponType.FIXED_AMOUNT}>定額割引</SelectItem>
                  </SelectContent>
                </Select>
                <input type="hidden" name="type" value={couponType} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="discountValue">
                  割引値 <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="discountValue"
                    type="number"
                    {...register('discountValue')}
                    min={1}
                    max={couponType === CouponType.PERCENTAGE ? 100 : undefined}
                    aria-invalid={!!errors.discountValue}
                    aria-describedby={errors.discountValue ? 'discountValue-error' : undefined}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {couponType === CouponType.PERCENTAGE ? '%' : '円'}
                  </span>
                </div>
                {errors.discountValue && (
                  <p id="discountValue-error" className="text-xs text-destructive">
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
                    {...register('minReservationAmount')}
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
                      {...register('maxDiscountAmount')}
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
                  {...register('validFrom')}
                  defaultValue={
                    coupon
                      ? formatDateForInput(coupon.validFrom)
                      : formatDateForInput(new Date())
                  }
                  aria-invalid={!!errors.validFrom}
                  aria-describedby={errors.validFrom ? 'validFrom-error' : undefined}
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
                  {...register('validUntil')}
                  defaultValue={
                    coupon?.validUntil
                      ? formatDateForInput(coupon.validUntil)
                      : ''
                  }
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
                {...register('usageLimit')}
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
                name="isActive"
                checked={isActive}
                onCheckedChange={(checked) => setValue('isActive', checked)}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="canCombineWithDurationDiscount">長時間割引との併用</Label>
                <p className="text-xs text-muted-foreground">
                  有効にすると長時間割引と併用できます
                </p>
              </div>
              <Switch
                id="canCombineWithDurationDiscount"
                name="canCombineWithDurationDiscount"
                checked={canCombine}
                onCheckedChange={(checked) => setValue('canCombineWithDurationDiscount', checked)}
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
            <Button
              type="submit"
              disabled={isPending}
              className={cn(isPending && 'opacity-50')}
            >
              {getSubmitButtonLabel(isPending, isEdit)}
            </Button>
          </div>
        </div>
      </Card>
    </form>
  )
}
