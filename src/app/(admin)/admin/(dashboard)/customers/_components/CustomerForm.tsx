'use client'

import { useActionState, useEffect, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createCustomer } from '@/admin/actions/customer'
import {
  customerFormSchema,
  type CustomerFormData,
  type CustomerFormInput,
} from '@/admin/lib/validations/customer'
import {
  Button,
  Input,
  Label,
  Card,
  Textarea,
} from '@/admin/components/ui'
import { cn } from '@/shared/lib/cn'
import { useKanaInput } from '@/admin/hooks'
import {
  getFormString,
  getFormStringRequired,
  getFormStringOrDefault,
} from '@/shared/lib/form-data'

type FormState = {
  success: boolean
  message: string
  customerId?: string
} | null

async function submitAction(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const input: CustomerFormInput = {
    lastName: getFormStringRequired(formData, 'lastName'),
    firstName: getFormStringRequired(formData, 'firstName'),
    lastNameKana: getFormString(formData, 'lastNameKana'),
    firstNameKana: getFormString(formData, 'firstNameKana'),
    email: getFormStringRequired(formData, 'email'),
    phoneNumber: getFormStringOrDefault(formData, 'phoneNumber', ''),
    address: getFormStringOrDefault(formData, 'address', ''),
    notes: getFormStringOrDefault(formData, 'notes', ''),
  }

  const result = await createCustomer(input)

  if (!result.success) {
    return { success: false, message: result.error }
  }

  return {
    success: true,
    message: result.message,
    customerId: result.data?.id,
  }
}

export function CustomerForm(): ReactElement {
  const router = useRouter()
  const [state, formAction, isPending] = useActionState(submitAction, null)

  const {
    register,
    setValue,
    formState: { errors },
  } = useForm<CustomerFormData>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: {
      lastName: '',
      firstName: '',
      lastNameKana: '',
      firstNameKana: '',
      email: '',
      phoneNumber: '',
      address: '',
      notes: '',
    },
  })

  // IME 自動カナ入力
  const lastNameKanaInput = useKanaInput({
    onKanaChange: (kana) => setValue('lastNameKana', kana),
  })
  const firstNameKanaInput = useKanaInput({
    onKanaChange: (kana) => setValue('firstNameKana', kana),
  })

  useEffect(() => {
    if (state?.success) {
      router.push('/admin/customers')
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

          {/* 氏名 */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="lastName">
                姓 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lastName"
                {...register('lastName')}
                placeholder="山田"
                aria-invalid={!!errors.lastName}
                aria-describedby={errors.lastName ? 'lastName-error' : undefined}
                onCompositionStart={lastNameKanaInput.inputProps.onCompositionStart}
                onCompositionUpdate={lastNameKanaInput.inputProps.onCompositionUpdate}
                onCompositionEnd={lastNameKanaInput.inputProps.onCompositionEnd}
                onInput={lastNameKanaInput.inputProps.onInput}
              />
              {errors.lastName && (
                <p id="lastName-error" className="text-xs text-destructive">
                  {errors.lastName.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="firstName">
                名 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="firstName"
                {...register('firstName')}
                placeholder="太郎"
                aria-invalid={!!errors.firstName}
                aria-describedby={errors.firstName ? 'firstName-error' : undefined}
                onCompositionStart={firstNameKanaInput.inputProps.onCompositionStart}
                onCompositionUpdate={firstNameKanaInput.inputProps.onCompositionUpdate}
                onCompositionEnd={firstNameKanaInput.inputProps.onCompositionEnd}
                onInput={firstNameKanaInput.inputProps.onInput}
              />
              {errors.firstName && (
                <p id="firstName-error" className="text-xs text-destructive">
                  {errors.firstName.message}
                </p>
              )}
            </div>
          </div>

          {/* カナ（リアルタイム自動入力） */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="lastNameKana">
                セイ
                <span className="text-xs text-muted-foreground ml-2">（自動入力）</span>
              </Label>
              <Input
                id="lastNameKana"
                name="lastNameKana"
                placeholder="ヤマダ"
                value={lastNameKanaInput.kana}
                onChange={(e) => lastNameKanaInput.setKana(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="firstNameKana">
                メイ
                <span className="text-xs text-muted-foreground ml-2">（自動入力）</span>
              </Label>
              <Input
                id="firstNameKana"
                name="firstNameKana"
                placeholder="タロウ"
                value={firstNameKanaInput.kana}
                onChange={(e) => firstNameKanaInput.setKana(e.target.value)}
              />
            </div>
          </div>

          {/* メールアドレス */}
          <div className="space-y-2">
            <Label htmlFor="email">
              メールアドレス <span className="text-destructive">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              {...register('email')}
              placeholder="example@example.com"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-error' : undefined}
            />
            {errors.email && (
              <p id="email-error" className="text-xs text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>

          {/* 電話番号 */}
          <div className="space-y-2">
            <Label htmlFor="phoneNumber">電話番号</Label>
            <Input
              id="phoneNumber"
              type="tel"
              {...register('phoneNumber')}
              placeholder="090-1234-5678"
              aria-invalid={!!errors.phoneNumber}
              aria-describedby={errors.phoneNumber ? 'phoneNumber-error' : undefined}
            />
            {errors.phoneNumber && (
              <p id="phoneNumber-error" className="text-xs text-destructive">
                {errors.phoneNumber.message}
              </p>
            )}
          </div>

          {/* 住所 */}
          <div className="space-y-2">
            <Label htmlFor="address">住所</Label>
            <Input
              id="address"
              {...register('address')}
              placeholder="東京都渋谷区..."
              aria-invalid={!!errors.address}
              aria-describedby={errors.address ? 'address-error' : undefined}
            />
            {errors.address && (
              <p id="address-error" className="text-xs text-destructive">
                {errors.address.message}
              </p>
            )}
          </div>

          {/* メモ */}
          <div className="space-y-2">
            <Label htmlFor="notes">メモ</Label>
            <Textarea
              id="notes"
              {...register('notes')}
              placeholder="顧客に関するメモ..."
              rows={4}
              aria-invalid={!!errors.notes}
              aria-describedby={errors.notes ? 'notes-error' : undefined}
            />
            {errors.notes && (
              <p id="notes-error" className="text-xs text-destructive">
                {errors.notes.message}
              </p>
            )}
          </div>

          {/* 送信ボタン */}
          <div className="flex justify-end gap-3">
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
              {isPending ? '作成中...' : '顧客を作成'}
            </Button>
          </div>
        </div>
      </Card>
    </form>
  )
}
