'use server'

import { prisma } from '@/lib/prisma'
import {
  contactSchema,
  type ContactInput,
  type ContactActionResult,
} from '@/lib/validations/contact'
import {
  sendContactConfirmationEmail,
  sendContactAdminNotification,
} from '@/lib/email-service'
import { withTurnstileAndValidation } from '@/lib/action-helpers'

/**
 * お問い合わせフォーム送信 Server Action
 */
export async function submitContact(
  formData: ContactInput,
  turnstileToken?: string
): Promise<ContactActionResult> {
  return withTurnstileAndValidation(
    turnstileToken,
    contactSchema,
    formData,
    async (data) => {
      try {
        // データベースに保存
        const inquiry = await prisma.inquiry.create({
          data: {
            name: data.name,
            email: data.email,
            subject: data.subject,
            message: data.message,
            status: 'NEW',
          },
        })

        // メール送信データ
        const emailData = {
          inquiryId: inquiry.id,
          name: data.name,
          email: data.email,
          subject: data.subject,
          message: data.message,
        }

        // メール送信（バックグラウンドで実行、失敗してもエラーにしない）
        Promise.all([
          sendContactConfirmationEmail(emailData),
          sendContactAdminNotification(emailData),
        ]).catch((err) => {
          console.error('Failed to send contact emails:', err)
        })

        return {
          success: true,
          message:
            'お問い合わせを受け付けました。確認メールをお送りしましたので、ご確認ください。',
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
  )
}
