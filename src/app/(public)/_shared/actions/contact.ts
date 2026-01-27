'use server'

/**
 * お問い合わせフォーム Server Actions
 *
 * お問い合わせフォームからのデータ送信を処理するServer Actions。
 * Turnstile検証、バリデーション、DB保存、メール送信を行います。
 *
 * ## 処理フロー
 * 1. Turnstile検証
 * 2. Zodスキーマによる入力検証
 * 3. お問い合わせデータをDBに保存
 * 4. 確認メール・管理者通知メール送信（バックグラウンド）
 *
 * @module public/actions/contact
 */

import { prisma } from '@/shared/lib/prisma'
import {
  contactSchema,
  type ContactInput,
  type ContactActionResult,
} from '@/public/lib/validations/contact'
import {
  sendContactConfirmationEmail,
  sendContactAdminNotification,
} from '@/shared/lib/email-service'
import { withTurnstileAndValidation } from '@/shared/lib/action-helpers'
import { logError, ErrorCategory, ErrorSeverity, normalizeError } from '@/shared/lib/errors'
import { fireAndForget } from '@/shared/lib/async-utils'

// =============================================================================
// Server Actions
// =============================================================================

/**
 * お問い合わせフォーム送信 Server Action
 *
 * お問い合わせ内容をDBに保存し、確認メールと管理者通知を送信します。
 *
 * @param formData - お問い合わせ入力データ
 * @param turnstileToken - Turnstile検証トークン
 * @returns 送信結果
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

        // メール送信（バックグラウンド）
        fireAndForget(
          Promise.all([
            sendContactConfirmationEmail(emailData),
            sendContactAdminNotification(emailData),
          ]),
          {
            operation: 'sendContactEmails',
            category: ErrorCategory.EXTERNAL_API,
            severity: ErrorSeverity.MEDIUM,
            context: { inquiryId: inquiry.id },
          }
        )

        return {
          success: true,
          message:
            'お問い合わせを受け付けました。確認メールをお送りしましたので、ご確認ください。',
        }
      } catch (error) {
        logError(normalizeError(error), {
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation: 'submitContact',
            email: data.email,
          },
        })

        return {
          success: false,
          error:
            '送信中にエラーが発生しました。しばらく経ってから再度お試しください。',
        }
      }
    }
  )
}
