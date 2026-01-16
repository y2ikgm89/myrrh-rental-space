'use client'

import {
  useState,
  useTransition,
  type ReactElement,
  type FormEvent,
} from 'react'
import Link from 'next/link'
import { tv } from 'tailwind-variants'
import { Button } from '@/components/site/ui/Button'
import { Checkbox } from '@/components/site/ui/Checkbox'
import { Input } from '@/components/site/ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/site/ui/Card'
import { TermsAgreementDialog } from '@/components/site/TermsAgreementDialog'
import { Calendar } from './Calendar'
import { TimeSlotPicker } from './TimeSlotPicker'
import { createReservation } from '@/actions/reservation'
import {
  reservationSchema,
  reservationWithTermsSchema,
  type ReservationInput,
  type ReservationWithTermsInput,
  type ReservationActionResult,
} from '@/lib/validations/reservation'
import type { TermsWithVersion } from '@/lib/validations/terms'
import { cn } from '@/lib/utils'

const formStyles = tv({
  slots: {
    container: 'w-full max-w-4xl mx-auto',
    grid: 'grid gap-8 lg:grid-cols-2',
    section: 'space-y-6',
    sectionTitle: 'text-xl font-semibold text-foreground mb-4',
    form: 'space-y-6',
    fieldGroup: 'space-y-2',
    fieldRow: 'grid grid-cols-2 gap-4',
    label: 'block text-sm font-medium text-foreground',
    required: 'text-destructive ml-1',
    textarea:
      'flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y',
    errorText: 'text-sm text-destructive mt-1',
    successMessage:
      'rounded-md bg-green-50 border border-green-200 p-4 text-green-800',
    errorMessage:
      'rounded-md bg-destructive/10 border border-destructive/20 p-4 text-destructive',
    priceSection: 'mt-6 p-4 bg-muted rounded-lg',
    priceRow: 'flex justify-between items-center',
    priceLabel: 'text-sm text-muted-foreground',
    priceValue: 'text-lg font-semibold text-foreground',
    totalRow: 'flex justify-between items-center pt-3 mt-3 border-t border-border',
    totalLabel: 'text-base font-medium text-foreground',
    totalValue: 'text-2xl font-bold text-primary',
    stepIndicator: 'flex items-center gap-2 mb-6',
    step: 'flex items-center gap-2',
    stepNumber:
      'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
    stepNumberActive: 'bg-primary text-primary-foreground',
    stepNumberInactive: 'bg-muted text-muted-foreground',
    stepLine: 'flex-1 h-0.5 bg-muted',
  },
})

const styles = formStyles()

const linkClasses = 'text-primary hover:underline'

function renderTermsLabel(settings: TermsSettings): React.ReactNode {
  const { requireTerms, requirePrivacy } = settings

  if (requireTerms && requirePrivacy) {
    return (
      <>
        <Link href="/terms" target="_blank" className={linkClasses}>
          利用規約
        </Link>
        と
        <Link href="/privacy" target="_blank" className={linkClasses}>
          プライバシーポリシー
        </Link>
        に同意します
      </>
    )
  }

  if (requireTerms) {
    return (
      <>
        <Link href="/terms" target="_blank" className={linkClasses}>
          利用規約
        </Link>
        に同意します
      </>
    )
  }

  if (requirePrivacy) {
    return (
      <>
        <Link href="/privacy" target="_blank" className={linkClasses}>
          プライバシーポリシー
        </Link>
        に同意します
      </>
    )
  }

  return '規約に同意します'
}

interface TermsSettings {
  enabled: boolean
  text: string | null
  requireTerms: boolean
  requirePrivacy: boolean
}

interface ReservationFormProps {
  spaceId: string
  spaceName: string
  hourlyPrice: number
  termsSettings: TermsSettings
  /** スペース固有の規約（設定されている場合） */
  spaceTerms: TermsWithVersion | null
}

type FormStep = 'datetime' | 'info' | 'confirm'

interface FormState {
  lastName: string
  firstName: string
  email: string
  phoneNumber: string
  notes: string
  agreedToTerms: boolean
  /** スペース固有の規約に同意したバージョンID */
  agreedTermsVersionId: string | null
}

const initialFormState: FormState = {
  lastName: '',
  firstName: '',
  email: '',
  phoneNumber: '',
  notes: '',
  agreedToTerms: false,
  agreedTermsVersionId: null,
}

export function ReservationForm({
  spaceId,
  spaceName,
  hourlyPrice,
  termsSettings,
  spaceTerms,
}: ReservationFormProps): ReactElement {
  // 日時選択状態
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [startTime, setStartTime] = useState<string | null>(null)
  const [endTime, setEndTime] = useState<string | null>(null)

  // フォーム状態
  const [formState, setFormState] = useState<FormState>(initialFormState)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [result, setResult] = useState<ReservationActionResult | null>(null)
  const [isPending, startTransition] = useTransition()

  // ステップ管理
  const [currentStep, setCurrentStep] = useState<FormStep>('datetime')

  // 規約ダイアログ状態
  const [isTermsDialogOpen, setIsTermsDialogOpen] = useState(false)
  const [isTermsAgreeing, setIsTermsAgreeing] = useState(false)

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ): void => {
    const { name, value } = e.target
    setFormState((prev) => ({ ...prev, [name]: value }))

    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next[name]
        return next
      })
    }
  }

  const handleDateSelect = (date: Date): void => {
    setSelectedDate(date)
    setStartTime(null)
    setEndTime(null)
  }

  const canProceedToInfo = selectedDate && startTime && endTime

  const handleProceedToInfo = (): void => {
    if (canProceedToInfo) {
      setCurrentStep('info')
    }
  }

  const handleBackToDateTime = (): void => {
    setCurrentStep('datetime')
  }

  // スペース固有の規約同意ハンドラ
  const handleOpenTermsDialog = (): void => {
    if (spaceTerms?.currentVersion) {
      setIsTermsDialogOpen(true)
    }
  }

  const handleTermsAgree = async (_termsId: string, versionId: string): Promise<void> => {
    setIsTermsAgreeing(true)
    // 同意を記録（実際の保存は予約確定時に行う）
    setFormState((prev) => ({
      ...prev,
      agreedTermsVersionId: versionId,
    }))
    setIsTermsAgreeing(false)
    setIsTermsDialogOpen(false)
  }

  const handleTermsDecline = (): void => {
    setFormState((prev) => ({
      ...prev,
      agreedTermsVersionId: null,
    }))
  }

  // スペース規約に同意済みかどうか
  const hasAgreedToSpaceTerms =
    !spaceTerms || // 規約がない場合は同意不要
    formState.agreedTermsVersionId === spaceTerms.currentVersion?.id

  const calculateTotal = (): number => {
    if (!startTime || !endTime) return 0
    const [startHour] = startTime.split(':').map(Number)
    const [endHour] = endTime.split(':').map(Number)
    const hours = endHour - startHour
    return hourlyPrice * hours
  }

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()

    if (!selectedDate || !startTime || !endTime) {
      return
    }

    // スペース固有の規約に同意していない場合はエラー
    if (spaceTerms?.currentVersion && !formState.agreedTermsVersionId) {
      setFieldErrors({
        spaceTerms: ['スペースの利用規約に同意してください'],
      })
      return
    }

    const dateStr = selectedDate.toISOString().split('T')[0]

    // 規約同意が必要な場合は agreedToTerms を含める
    const baseInput = {
      spaceId,
      date: dateStr,
      startTime,
      endTime,
      lastName: formState.lastName,
      firstName: formState.firstName,
      email: formState.email,
      phoneNumber: formState.phoneNumber,
      notes: formState.notes || undefined,
      // スペース固有の規約同意情報
      termsAgreement: formState.agreedTermsVersionId && spaceTerms
        ? {
            termsId: spaceTerms.id,
            versionId: formState.agreedTermsVersionId,
          }
        : undefined,
    }

    const input: ReservationInput | ReservationWithTermsInput = termsSettings.enabled
      ? { ...baseInput, agreedToTerms: formState.agreedToTerms }
      : baseInput

    // クライアントサイドバリデーション（設定に応じてスキーマを選択）
    const schema = termsSettings.enabled ? reservationWithTermsSchema : reservationSchema
    const clientValidation = schema.safeParse(input)

    if (!clientValidation.success) {
      const errors: Record<string, string[]> = {}
      for (const issue of clientValidation.error.issues) {
        const field = issue.path[0]
        if (typeof field === 'string') {
          if (!errors[field]) {
            errors[field] = []
          }
          errors[field].push(issue.message)
        }
      }
      setFieldErrors(errors)
      return
    }

    startTransition(async () => {
      const response = await createReservation(input)
      setResult(response)

      if (response.success) {
        setFormState(initialFormState)
        setSelectedDate(null)
        setStartTime(null)
        setEndTime(null)
        setCurrentStep('confirm')
      } else if (response.fieldErrors) {
        setFieldErrors(response.fieldErrors)
      }
    })
  }

  const formatSelectedDate = (): string => {
    if (!selectedDate) return ''
    const year = selectedDate.getFullYear()
    const month = selectedDate.getMonth() + 1
    const day = selectedDate.getDate()
    const weekday = ['日', '月', '火', '水', '木', '金', '土'][selectedDate.getDay()]
    return `${year}年${month}月${day}日（${weekday}）`
  }

  // 成功画面
  if (result?.success) {
    return (
      <div className={styles.container()}>
        <Card>
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              予約を受け付けました
            </h2>
            <p className="text-muted-foreground mb-6">{result.message}</p>
            <Button
              onClick={() => {
                setResult(null)
                setCurrentStep('datetime')
              }}
            >
              新しい予約をする
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const total = calculateTotal()
  const hours = startTime && endTime
    ? parseInt(endTime.split(':')[0], 10) - parseInt(startTime.split(':')[0], 10)
    : 0

  return (
    <div className={styles.container()}>
      {/* ステップインジケーター */}
      <div className={styles.stepIndicator()}>
        <div className={styles.step()}>
          <span
            className={cn(
              styles.stepNumber(),
              currentStep === 'datetime'
                ? styles.stepNumberActive()
                : styles.stepNumberInactive()
            )}
          >
            1
          </span>
          <span className="text-sm font-medium">日時選択</span>
        </div>
        <div className={styles.stepLine()} />
        <div className={styles.step()}>
          <span
            className={cn(
              styles.stepNumber(),
              currentStep === 'info'
                ? styles.stepNumberActive()
                : styles.stepNumberInactive()
            )}
          >
            2
          </span>
          <span className="text-sm font-medium">お客様情報</span>
        </div>
      </div>

      {/* エラーメッセージ */}
      {result && !result.success && (
        <div className={cn(styles.errorMessage(), 'mb-6')}>{result.error}</div>
      )}

      {currentStep === 'datetime' && (
        <div className={styles.grid()}>
          {/* 左カラム: カレンダー */}
          <Card>
            <CardHeader>
              <CardTitle>日付を選択</CardTitle>
            </CardHeader>
            <CardContent>
              <Calendar
                selectedDate={selectedDate}
                onSelectDate={handleDateSelect}
              />
            </CardContent>
          </Card>

          {/* 右カラム: 時間枠 */}
          <Card>
            <CardHeader>
              <CardTitle>時間を選択</CardTitle>
            </CardHeader>
            <CardContent>
              <TimeSlotPicker
                spaceId={spaceId}
                selectedDate={selectedDate}
                startTime={startTime}
                endTime={endTime}
                onSelectStartTime={setStartTime}
                onSelectEndTime={setEndTime}
              />

              {/* 料金表示 */}
              {canProceedToInfo && (
                <div className={styles.priceSection()}>
                  <div className={styles.priceRow()}>
                    <span className={styles.priceLabel()}>
                      ¥{hourlyPrice.toLocaleString()} × {hours}時間
                    </span>
                  </div>
                  <div className={styles.totalRow()}>
                    <span className={styles.totalLabel()}>合計</span>
                    <span className={styles.totalValue()}>
                      ¥{total.toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              <div className="mt-6">
                <Button
                  onClick={handleProceedToInfo}
                  disabled={!canProceedToInfo}
                  className="w-full"
                >
                  次へ進む
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {currentStep === 'info' && (
        <Card>
          <CardHeader>
            <CardTitle>お客様情報を入力</CardTitle>
          </CardHeader>
          <CardContent>
            {/* 選択内容サマリー */}
            <div className="mb-6 p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">予約内容</p>
              <p className="font-medium">{spaceName}</p>
              <p className="text-sm text-muted-foreground">
                {formatSelectedDate()} {startTime} 〜 {endTime}（{hours}時間）
              </p>
              <p className="text-lg font-bold text-primary mt-2">
                ¥{total.toLocaleString()}
              </p>
            </div>

            <form onSubmit={handleSubmit} className={styles.form()}>
              {/* 名前 */}
              <div className={styles.fieldRow()}>
                <div className={styles.fieldGroup()}>
                  <label htmlFor="lastName" className={styles.label()}>
                    姓<span className={styles.required()}>*</span>
                  </label>
                  <Input
                    id="lastName"
                    name="lastName"
                    value={formState.lastName}
                    onChange={handleChange}
                    placeholder="山田"
                    disabled={isPending}
                    aria-invalid={!!fieldErrors.lastName}
                    aria-describedby={
                      fieldErrors.lastName ? 'lastName-error' : undefined
                    }
                  />
                  {fieldErrors.lastName && (
                    <p id="lastName-error" className={styles.errorText()}>
                      {fieldErrors.lastName[0]}
                    </p>
                  )}
                </div>

                <div className={styles.fieldGroup()}>
                  <label htmlFor="firstName" className={styles.label()}>
                    名<span className={styles.required()}>*</span>
                  </label>
                  <Input
                    id="firstName"
                    name="firstName"
                    value={formState.firstName}
                    onChange={handleChange}
                    placeholder="太郎"
                    disabled={isPending}
                    aria-invalid={!!fieldErrors.firstName}
                    aria-describedby={
                      fieldErrors.firstName ? 'firstName-error' : undefined
                    }
                  />
                  {fieldErrors.firstName && (
                    <p id="firstName-error" className={styles.errorText()}>
                      {fieldErrors.firstName[0]}
                    </p>
                  )}
                </div>
              </div>

              {/* メール */}
              <div className={styles.fieldGroup()}>
                <label htmlFor="email" className={styles.label()}>
                  メールアドレス<span className={styles.required()}>*</span>
                </label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formState.email}
                  onChange={handleChange}
                  placeholder="example@email.com"
                  disabled={isPending}
                  aria-invalid={!!fieldErrors.email}
                  aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                />
                {fieldErrors.email && (
                  <p id="email-error" className={styles.errorText()}>
                    {fieldErrors.email[0]}
                  </p>
                )}
              </div>

              {/* 電話番号 */}
              <div className={styles.fieldGroup()}>
                <label htmlFor="phoneNumber" className={styles.label()}>
                  電話番号<span className={styles.required()}>*</span>
                </label>
                <Input
                  id="phoneNumber"
                  name="phoneNumber"
                  type="tel"
                  value={formState.phoneNumber}
                  onChange={handleChange}
                  placeholder="090-1234-5678"
                  disabled={isPending}
                  aria-invalid={!!fieldErrors.phoneNumber}
                  aria-describedby={
                    fieldErrors.phoneNumber ? 'phoneNumber-error' : undefined
                  }
                />
                {fieldErrors.phoneNumber && (
                  <p id="phoneNumber-error" className={styles.errorText()}>
                    {fieldErrors.phoneNumber[0]}
                  </p>
                )}
              </div>

              {/* 備考 */}
              <div className={styles.fieldGroup()}>
                <label htmlFor="notes" className={styles.label()}>
                  備考・ご要望
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  value={formState.notes}
                  onChange={handleChange}
                  placeholder="ご要望があればご記入ください"
                  disabled={isPending}
                  className={styles.textarea()}
                  aria-invalid={!!fieldErrors.notes}
                  aria-describedby={fieldErrors.notes ? 'notes-error' : undefined}
                />
                {fieldErrors.notes && (
                  <p id="notes-error" className={styles.errorText()}>
                    {fieldErrors.notes[0]}
                  </p>
                )}
              </div>

              {/* スペース固有の規約同意 */}
              {spaceTerms?.currentVersion && (
                <div className={styles.fieldGroup()}>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-foreground">
                          {spaceTerms.title}
                          <span className={styles.required()}>*</span>
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {hasAgreedToSpaceTerms ? (
                            <span className="text-green-600">同意済み</span>
                          ) : (
                            '予約前に規約をご確認ください'
                          )}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant={hasAgreedToSpaceTerms ? 'outline' : 'primary'}
                        size="sm"
                        onClick={handleOpenTermsDialog}
                        disabled={isPending}
                      >
                        {hasAgreedToSpaceTerms ? '再確認' : '規約を確認'}
                      </Button>
                    </div>
                  </div>
                  {fieldErrors.spaceTerms && (
                    <p id="spaceTerms-error" className={styles.errorText()}>
                      {fieldErrors.spaceTerms[0]}
                    </p>
                  )}
                </div>
              )}

              {/* 規約同意チェックボックス */}
              {termsSettings.enabled && (
                <div className={styles.fieldGroup()}>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="agreedToTerms"
                      checked={formState.agreedToTerms}
                      onCheckedChange={(checked) =>
                        setFormState((prev) => ({ ...prev, agreedToTerms: checked }))
                      }
                      disabled={isPending}
                      aria-invalid={!!fieldErrors.agreedToTerms}
                      aria-describedby={
                        fieldErrors.agreedToTerms ? 'agreedToTerms-error' : undefined
                      }
                      className="mt-0.5"
                    />
                    <label
                      htmlFor="agreedToTerms"
                      className="text-sm text-foreground cursor-pointer leading-relaxed"
                    >
                      {termsSettings.text || renderTermsLabel(termsSettings)}
                      <span className={styles.required()}>*</span>
                    </label>
                  </div>
                  {fieldErrors.agreedToTerms && (
                    <p id="agreedToTerms-error" className={styles.errorText()}>
                      {fieldErrors.agreedToTerms[0]}
                    </p>
                  )}
                </div>
              )}

              {/* ボタン */}
              <div className="flex gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBackToDateTime}
                  disabled={isPending}
                >
                  戻る
                </Button>
                <Button
                  type="submit"
                  disabled={isPending || !hasAgreedToSpaceTerms}
                  className="flex-1"
                >
                  {isPending ? '送信中...' : '予約を確定する'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* スペース固有の規約ダイアログ */}
      {spaceTerms?.currentVersion && (
        <TermsAgreementDialog
          open={isTermsDialogOpen}
          onOpenChange={setIsTermsDialogOpen}
          terms={spaceTerms}
          onAgree={handleTermsAgree}
          onDecline={handleTermsDecline}
          loading={isTermsAgreeing}
        />
      )}
    </div>
  )
}
