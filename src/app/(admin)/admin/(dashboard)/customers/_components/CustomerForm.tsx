'use client'

import { useActionState, useEffect, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createCustomer, type CreateCustomerInput } from '@/admin/actions/customer'
import {
  Button,
  Input,
  Label,
  Card,
  Textarea,
} from '@/admin/components/ui'
import { cn } from '@/shared/lib/utils'

const customerFormSchema = z.object({
  lastName: z.string().min(1, '姓は必須です').max(50, '姓は50文字以内で入力してください'),
  firstName: z.string().min(1, '名は必須です').max(50, '名は50文字以内で入力してください'),
  email: z.string().email('有効なメールアドレスを入力してください'),
  phoneNumber: z.string().max(20, '電話番号は20文字以内で入力してください').optional().or(z.literal('')),
  address: z.string().max(500, '住所は500文字以内で入力してください').optional().or(z.literal('')),
  notes: z.string().max(2000, 'メモは2000文字以内で入力してください').optional().or(z.literal('')),
})

type CustomerFormData = z.infer<typeof customerFormSchema>

type FormState = {
  success: boolean
  message: string
  customerId?: string
} | null

async function submitAction(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const input: CreateCustomerInput = {
    lastName: formData.get('lastName') as string,
    firstName: formData.get('firstName') as string,
    email: formData.get('email') as string,
    phoneNumber: (formData.get('phoneNumber') as string) || '',
    address: (formData.get('address') as string) || '',
    notes: (formData.get('notes') as string) || '',
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
    formState: { errors },
  } = useForm<CustomerFormData>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: {
      lastName: '',
      firstName: '',
      email: '',
      phoneNumber: '',
      address: '',
      notes: '',
    },
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
              />
              {errors.firstName && (
                <p id="firstName-error" className="text-xs text-destructive">
                  {errors.firstName.message}
                </p>
              )}
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
              onClick={() => router.push('/admin/customers')}
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
