'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { CalendarIcon } from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  Checkbox,
} from '@/admin/components/ui'
import {
  adminReservationSchema,
  type AdminReservationInput,
} from '@/admin/lib/validations/admin-reservation'
import { createAdminReservation } from '@/admin/actions/reservation'

type SpaceOption = {
  id: string
  name: string
  hourlyPrice: number
}

type ReservationFormProps = {
  spaces: SpaceOption[]
}

// =============================================================================
// Placeholder Components (Phase 3/4で実装)
// =============================================================================

function CustomerSelector({
  customerId: _customerId,
  customerData,
  onCustomerIdChange,
  onCustomerDataChange,
  disabled,
}: {
  customerId: string | undefined
  customerData:
    | { lastName: string; firstName: string; email: string; phoneNumber?: string }
    | undefined
  onCustomerIdChange: (id: string | undefined) => void
  onCustomerDataChange: (
    data:
      | { lastName: string; firstName: string; email: string; phoneNumber?: string }
      | undefined
  ) => void
  disabled?: boolean
}) {
  const [mode, setMode] = useState<'select' | 'new'>('new')

  return (
    <Card>
      <CardHeader>
        <CardTitle>顧客情報</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* モード切り替え */}
        <div className="space-y-2">
          <Label>顧客選択方法</Label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={mode === 'select'}
                onChange={() => {
                  setMode('select')
                  onCustomerDataChange(undefined)
                }}
                disabled={disabled}
              />
              <span>既存顧客を検索</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={mode === 'new'}
                onChange={() => {
                  setMode('new')
                  onCustomerIdChange(undefined)
                }}
                disabled={disabled}
              />
              <span>新規顧客として入力</span>
            </label>
          </div>
        </div>

        {/* 既存顧客検索（Placeholder） */}
        {mode === 'select' && (
          <div className="space-y-2">
            <Label>顧客検索</Label>
            <Input placeholder="名前・メール・電話番号で検索..." disabled />
            <p className="text-sm text-muted-foreground">
              ※ Phase 3で実装予定（検索・選択機能）
            </p>
          </div>
        )}

        {/* 新規顧客入力 */}
        {mode === 'new' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lastName">姓 *</Label>
                <Input
                  id="lastName"
                  value={customerData?.lastName || ''}
                  onChange={(e) =>
                    onCustomerDataChange({
                      lastName: e.target.value,
                      firstName: customerData?.firstName || '',
                      email: customerData?.email || '',
                      phoneNumber: customerData?.phoneNumber,
                    })
                  }
                  placeholder="山田"
                  disabled={disabled}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="firstName">名 *</Label>
                <Input
                  id="firstName"
                  value={customerData?.firstName || ''}
                  onChange={(e) =>
                    onCustomerDataChange({
                      lastName: customerData?.lastName || '',
                      firstName: e.target.value,
                      email: customerData?.email || '',
                      phoneNumber: customerData?.phoneNumber,
                    })
                  }
                  placeholder="太郎"
                  disabled={disabled}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">メールアドレス *</Label>
              <Input
                id="email"
                type="email"
                value={customerData?.email || ''}
                onChange={(e) =>
                  onCustomerDataChange({
                    lastName: customerData?.lastName || '',
                    firstName: customerData?.firstName || '',
                    email: e.target.value,
                    phoneNumber: customerData?.phoneNumber,
                  })
                }
                placeholder="example@example.com"
                disabled={disabled}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phoneNumber">電話番号</Label>
              <Input
                id="phoneNumber"
                type="tel"
                value={customerData?.phoneNumber || ''}
                onChange={(e) =>
                  onCustomerDataChange({
                    lastName: customerData?.lastName || '',
                    firstName: customerData?.firstName || '',
                    email: customerData?.email || '',
                    phoneNumber: e.target.value,
                  })
                }
                placeholder="090-1234-5678"
                disabled={disabled}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export function ReservationForm({ spaces }: ReservationFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [manualPrice, setManualPrice] = useState<number | undefined>(undefined)

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    control,
  } = useForm<AdminReservationInput>({
    resolver: zodResolver(adminReservationSchema),
    defaultValues: {
      status: 'CONFIRMED',
      sendEmail: true,
    },
  })

  const spaceId = useWatch({ control, name: 'spaceId' })
  const date = useWatch({ control, name: 'date' })
  const startTime = useWatch({ control, name: 'startTime' })
  const endTime = useWatch({ control, name: 'endTime' })
  const customerId = useWatch({ control, name: 'customerId' })
  const customerData = useWatch({ control, name: 'customerData' })
  const status = useWatch({ control, name: 'status' })
  const sendEmail = useWatch({ control, name: 'sendEmail' })

  // 選択されたスペース情報
  const selectedSpace = spaces.find((s) => s.id === spaceId)

  // 料金自動計算
  const calculatedPrice = (() => {
    if (!selectedSpace || !startTime || !endTime) return null
    try {
      const start = new Date(`${date || '2000-01-01'}T${startTime}`)
      const end = new Date(`${date || '2000-01-01'}T${endTime}`)
      if (end <= start) return null
      const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
      return selectedSpace.hourlyPrice * hours
    } catch {
      return null
    }
  })()

  const displayPrice = manualPrice ?? calculatedPrice

  const onSubmit = async (data: AdminReservationInput) => {
    startTransition(async () => {
      const submitData: AdminReservationInput = {
        ...data,
        totalPrice: manualPrice,
      }

      const result = await createAdminReservation(submitData)
      if (result.success) {
        toast.success(result.message)
        if ('data' in result && result.data && typeof result.data === 'object' && 'id' in result.data) {
          router.push(`/admin/reservations/${(result.data as { id: string }).id}`)
        } else {
          router.push('/admin/reservations')
        }
      } else {
        toast.error(result.error || '予約の作成に失敗しました')
        if (result.fieldErrors) {
          Object.entries(result.fieldErrors).forEach(([field, messages]) => {
            messages.forEach((message: string) => toast.error(`${field}: ${message}`))
          })
        }
      }
    })
  }

  // 時間オプション（9:00-21:00、1時間刻み）
  const timeOptions = Array.from({ length: 13 }, (_, i) => {
    const hour = 9 + i
    return `${hour.toString().padStart(2, '0')}:00`
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 左カラム: スペース・日時・料金 */}
        <div className="space-y-6">
          {/* スペース選択 */}
          <Card>
            <CardHeader>
              <CardTitle>スペース選択</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="spaceId">スペース *</Label>
                <Select
                  value={spaceId || ''}
                  onValueChange={(value) => setValue('spaceId', value)}
                  disabled={isPending}
                >
                  <SelectTrigger id="spaceId">
                    <SelectValue placeholder="スペースを選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {spaces.map((space) => (
                      <SelectItem key={space.id} value={space.id}>
                        {space.name} - ¥{space.hourlyPrice.toLocaleString()}/時間
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.spaceId && (
                  <p className="text-sm text-destructive">{errors.spaceId.message}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 日時選択 */}
          <Card>
            <CardHeader>
              <CardTitle>日時選択</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="date">日付 *</Label>
                <div className="relative">
                  <Input
                    id="date"
                    type="date"
                    {...register('date')}
                    disabled={isPending}
                    className="pr-10"
                  />
                  <CalendarIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
                {errors.date && (
                  <p className="text-sm text-destructive">{errors.date.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startTime">開始時間 *</Label>
                  <Select
                    value={startTime || ''}
                    onValueChange={(value) => setValue('startTime', value)}
                    disabled={isPending}
                  >
                    <SelectTrigger id="startTime">
                      <SelectValue placeholder="選択" />
                    </SelectTrigger>
                    <SelectContent>
                      {timeOptions.map((time) => (
                        <SelectItem key={time} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.startTime && (
                    <p className="text-sm text-destructive">
                      {errors.startTime.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="endTime">終了時間 *</Label>
                  <Select
                    value={endTime || ''}
                    onValueChange={(value) => setValue('endTime', value)}
                    disabled={isPending}
                  >
                    <SelectTrigger id="endTime">
                      <SelectValue placeholder="選択" />
                    </SelectTrigger>
                    <SelectContent>
                      {timeOptions.map((time) => (
                        <SelectItem key={time} value={time}>
                          {time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.endTime && (
                    <p className="text-sm text-destructive">{errors.endTime.message}</p>
                  )}
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                ※ Phase 4で空き時間表示機能を追加予定
              </p>
            </CardContent>
          </Card>

          {/* 料金 */}
          <Card>
            <CardHeader>
              <CardTitle>料金</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {displayPrice !== null ? (
                <div className="space-y-2">
                  <div className="text-2xl font-bold">
                    ¥{displayPrice.toLocaleString()}
                  </div>
                  {!manualPrice && calculatedPrice !== null && (
                    <p className="text-sm text-muted-foreground">
                      自動計算: {selectedSpace?.hourlyPrice.toLocaleString()}円/時間 ×{' '}
                      {((calculatedPrice / selectedSpace!.hourlyPrice) * 10) / 10}時間
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">
                  スペースと時間を選択してください
                </p>
              )}

              <div className="space-y-2">
                <Label htmlFor="manualPrice">手動で料金を調整</Label>
                <Input
                  id="manualPrice"
                  type="number"
                  value={manualPrice ?? ''}
                  onChange={(e) =>
                    setManualPrice(e.target.value ? Number(e.target.value) : undefined)
                  }
                  placeholder="手動で料金を入力（任意）"
                  disabled={isPending}
                />
                <p className="text-sm text-muted-foreground">
                  割引や追加料金がある場合に手動で調整できます
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 右カラム: 顧客情報 */}
        <div className="space-y-6">
          <CustomerSelector
            customerId={customerId}
            customerData={customerData}
            onCustomerIdChange={(id) => setValue('customerId', id)}
            onCustomerDataChange={(data) => setValue('customerData', data)}
            disabled={isPending}
          />
        </div>
      </div>

      {/* 下部: ステータス・メモ・送信設定 */}
      <Card>
        <CardHeader>
          <CardTitle>追加設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>予約ステータス</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="CONFIRMED"
                  checked={status === 'CONFIRMED'}
                  onChange={() => setValue('status', 'CONFIRMED')}
                  disabled={isPending}
                />
                <span>確定（CONFIRMED）</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  value="PENDING"
                  checked={status === 'PENDING'}
                  onChange={() => setValue('status', 'PENDING')}
                  disabled={isPending}
                />
                <span>保留（PENDING）</span>
              </label>
            </div>
            <p className="text-sm text-muted-foreground">
              電話予約の場合は「確定」を推奨します
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">メモ</Label>
            <Textarea
              id="notes"
              {...register('notes')}
              placeholder="例: 電話予約、紹介（山田様）"
              disabled={isPending}
              rows={3}
            />
            {errors.notes && (
              <p className="text-sm text-destructive">{errors.notes.message}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="sendEmail"
              checked={sendEmail}
              onCheckedChange={(checked) =>
                setValue('sendEmail', checked === true)
              }
              disabled={isPending}
            />
            <Label htmlFor="sendEmail" className="cursor-pointer">
              予約確認メールを顧客に送信する
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* ボタン */}
      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isPending}
        >
          キャンセル
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? '作成中...' : '予約を作成'}
        </Button>
      </div>
    </form>
  )
}
