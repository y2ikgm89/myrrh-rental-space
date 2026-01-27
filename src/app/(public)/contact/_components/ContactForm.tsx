'use client'

import { useState, useTransition, type ReactElement, type FormEvent } from 'react'
import { tv } from 'tailwind-variants'
import { Button } from '@/public/components/ui/Button'
import { Input } from '@/public/components/ui/Input'
import { Card, CardContent, CardHeader, CardTitle } from '@/public/components/ui/Card'
import { Turnstile } from '@/public/components/Turnstile'
import { submitContact } from '@/public/actions/contact'
import {
  contactSchema,
  type ContactInput,
  type ContactActionResult,
} from '@/public/lib/validations/contact'
import { cn } from '@/shared/lib/utils'

const formStyles = tv({
  slots: {
    form: 'space-y-6',
    fieldGroup: 'space-y-2',
    label: 'block text-sm font-medium text-foreground',
    required: 'text-destructive ml-1',
    textarea:
      'flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y',
    errorText: 'text-sm text-destructive mt-1',
    successMessage:
      'rounded-md bg-green-50 border border-green-200 p-4 text-green-800',
    errorMessage:
      'rounded-md bg-destructive/10 border border-destructive/20 p-4 text-destructive',
  },
})

const {
  form,
  fieldGroup,
  label,
  required,
  textarea,
  errorText,
  successMessage,
  errorMessage,
} = formStyles()

type FormState = {
  name: string
  email: string
  phone: string
  subject: string
  message: string
}

const initialFormState: FormState = {
  name: '',
  email: '',
  phone: '',
  subject: '',
  message: '',
}

type Props = {
  /** Turnstile Site Key（DBから取得、nullの場合はTurnstile無効） */
  turnstileSiteKey: string | null
}

export function ContactForm({ turnstileSiteKey }: Props): ReactElement {
  const [formState, setFormState] = useState<FormState>(initialFormState)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [result, setResult] = useState<ContactActionResult | null>(null)
  const [isPending, startTransition] = useTransition()
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ): void => {
    const { name, value } = e.target
    setFormState((prev) => ({ ...prev, [name]: value }))

    // フィールドのエラーをクリア
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next[name]
        return next
      })
    }
  }

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()

    // クライアントサイドバリデーション
    const input: ContactInput = {
      name: formState.name,
      email: formState.email,
      phone: formState.phone || undefined,
      subject: formState.subject,
      message: formState.message,
    }

    const clientValidation = contactSchema.safeParse(input)

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

    // サーバーアクション実行（Turnstileトークン付き）
    startTransition(async () => {
      const actionResult = await submitContact(input, turnstileToken ?? undefined)
      setResult(actionResult)

      if (actionResult.success) {
        setFormState(initialFormState)
        setFieldErrors({})
        setTurnstileToken(null)
      } else if (actionResult.fieldErrors) {
        setFieldErrors(actionResult.fieldErrors)
      }
    })
  }

  // 送信完了後のメッセージ表示
  if (result?.success) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>送信完了</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={successMessage()}>
            <p>{result.message}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={() => setResult(null)}
          >
            新しいお問い合わせを送信
          </Button>
        </CardContent>
      </Card>
    )
  }

  // 送信ボタンの無効化条件
  const isSubmitDisabled = isPending || Boolean(turnstileSiteKey && !turnstileToken)

  return (
    <Card>
      <CardHeader>
        <CardTitle>お問い合わせフォーム</CardTitle>
      </CardHeader>
      <CardContent>
        {result && !result.success && (
          <div className={cn(errorMessage(), 'mb-6')}>
            <p>{result.error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className={form()}>
          {/* お名前 */}
          <div className={fieldGroup()}>
            <label htmlFor="name" className={label()}>
              お名前
              <span className={required()}>*</span>
            </label>
            <Input
              id="name"
              name="name"
              type="text"
              value={formState.name}
              onChange={handleChange}
              placeholder="山田 太郎"
              disabled={isPending}
              aria-invalid={!!fieldErrors.name}
              aria-describedby={fieldErrors.name ? 'name-error' : undefined}
            />
            {fieldErrors.name && (
              <p id="name-error" className={errorText()}>
                {fieldErrors.name[0]}
              </p>
            )}
          </div>

          {/* メールアドレス */}
          <div className={fieldGroup()}>
            <label htmlFor="email" className={label()}>
              メールアドレス
              <span className={required()}>*</span>
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              value={formState.email}
              onChange={handleChange}
              placeholder="example@example.com"
              disabled={isPending}
              aria-invalid={!!fieldErrors.email}
              aria-describedby={fieldErrors.email ? 'email-error' : undefined}
            />
            {fieldErrors.email && (
              <p id="email-error" className={errorText()}>
                {fieldErrors.email[0]}
              </p>
            )}
          </div>

          {/* 電話番号 */}
          <div className={fieldGroup()}>
            <label htmlFor="phone" className={label()}>
              電話番号
              <span className="ml-1 text-muted-foreground text-xs">(任意)</span>
            </label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              value={formState.phone}
              onChange={handleChange}
              placeholder="090-1234-5678"
              disabled={isPending}
              aria-invalid={!!fieldErrors.phone}
              aria-describedby={fieldErrors.phone ? 'phone-error' : undefined}
            />
            {fieldErrors.phone && (
              <p id="phone-error" className={errorText()}>
                {fieldErrors.phone[0]}
              </p>
            )}
          </div>

          {/* 件名 */}
          <div className={fieldGroup()}>
            <label htmlFor="subject" className={label()}>
              件名
              <span className={required()}>*</span>
            </label>
            <Input
              id="subject"
              name="subject"
              type="text"
              value={formState.subject}
              onChange={handleChange}
              placeholder="お問い合わせの件名"
              disabled={isPending}
              aria-invalid={!!fieldErrors.subject}
              aria-describedby={
                fieldErrors.subject ? 'subject-error' : undefined
              }
            />
            {fieldErrors.subject && (
              <p id="subject-error" className={errorText()}>
                {fieldErrors.subject[0]}
              </p>
            )}
          </div>

          {/* お問い合わせ内容 */}
          <div className={fieldGroup()}>
            <label htmlFor="message" className={label()}>
              お問い合わせ内容
              <span className={required()}>*</span>
            </label>
            <textarea
              id="message"
              name="message"
              value={formState.message}
              onChange={handleChange}
              placeholder="お問い合わせ内容をご記入ください"
              disabled={isPending}
              className={textarea()}
              rows={6}
              aria-invalid={!!fieldErrors.message}
              aria-describedby={
                fieldErrors.message ? 'message-error' : undefined
              }
            />
            {fieldErrors.message && (
              <p id="message-error" className={errorText()}>
                {fieldErrors.message[0]}
              </p>
            )}
          </div>

          {/* Turnstile（スパム対策） */}
          {turnstileSiteKey && (
            <div className="flex justify-center">
              <Turnstile
                siteKey={turnstileSiteKey}
                onVerify={setTurnstileToken}
                onExpire={() => setTurnstileToken(null)}
                size="normal"
              />
            </div>
          )}

          {/* 送信ボタン */}
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={isSubmitDisabled}
          >
            {isPending ? '送信中...' : '送信する'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
