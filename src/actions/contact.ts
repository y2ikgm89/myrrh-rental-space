'use server'

import {
  contactSchema,
  type ContactInput,
  type ContactActionResult,
} from '@/lib/validations/contact'

/**
 * お問い合わせフォーム送信 Server Action
 *
 * バリデーション後、メール送信（現時点では console.log でモック）
 */
export async function submitContact(
  formData: ContactInput
): Promise<ContactActionResult> {
  // サーバーサイドバリデーション
  const validationResult = contactSchema.safeParse(formData)

  if (!validationResult.success) {
    const fieldErrors: Record<string, string[]> = {}

    for (const issue of validationResult.error.issues) {
      const field = issue.path[0]
      if (typeof field === 'string') {
        if (!fieldErrors[field]) {
          fieldErrors[field] = []
        }
        fieldErrors[field].push(issue.message)
      }
    }

    return {
      success: false,
      error: 'バリデーションエラーが発生しました',
      fieldErrors,
    }
  }

  const data = validationResult.data

  try {
    // TODO: Resend でメール送信（現時点では console.log でモック）
    console.log('=== お問い合わせ受信 ===')
    console.log('お名前:', data.name)
    console.log('メールアドレス:', data.email)
    console.log('電話番号:', data.phone ?? '(未入力)')
    console.log('件名:', data.subject)
    console.log('本文:', data.message)
    console.log('========================')

    // 模擬的な遅延（実際のメール送信時間をシミュレート）
    await new Promise((resolve) => setTimeout(resolve, 500))

    return {
      success: true,
      message: 'お問い合わせを受け付けました。ありがとうございます。',
    }
  } catch (error) {
    console.error('お問い合わせ送信エラー:', error)

    return {
      success: false,
      error:
        '送信中にエラーが発生しました。しばらく経ってから再度お試しください。',
    }
  }
}
