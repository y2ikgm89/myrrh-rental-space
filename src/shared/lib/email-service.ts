import { getResendClient, getFromAddress, isEmailEnabled } from './email'
import { ReservationConfirmationEmail } from '@/public/emails/reservation-confirmation'
import { ReservationCancelledEmail } from '@/public/emails/reservation-cancelled'
import { ContactConfirmationEmail } from '@/public/emails/contact-confirmation'
import { AdminNotificationEmail } from '@/public/emails/admin-notification'
import { prisma } from './prisma'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import {
  createReservationEvent,
  generateAddToCalendarLinks,
  generateICalContent,
} from '@/admin/lib/ical'

// =============================================================================
// Types
// =============================================================================

type ReservationEmailData = {
  reservationId: string
  customerEmail: string
  customerName: string
  spaceName: string
  startTime: Date
  endTime: Date
  totalPrice: number | null
  notes?: string
  location?: string
}

type ContactEmailData = {
  inquiryId: string
  name: string
  email: string
  subject: string
  message: string
}

// =============================================================================
// Helper Functions
// =============================================================================

async function getNotificationEmails(): Promise<string[]> {
  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: { notificationEmailAddresses: true },
  })

  if (!settings?.notificationEmailAddresses) return []

  return settings.notificationEmailAddresses
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean)
}

function formatPrice(price: number | null): string {
  if (price === null) return '未設定'
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
  }).format(price)
}

function getAdminUrl(path: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return `${baseUrl}/admin${path}`
}

// =============================================================================
// Reservation Emails
// =============================================================================

/**
 * カレンダー設定を取得
 */
async function getCalendarEmailSettings(): Promise<{
  icalAttachmentEnabled: boolean
  addToCalendarLinksEnabled: boolean
}> {
  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: {
      icalAttachmentEnabled: true,
      addToCalendarLinksEnabled: true,
    },
  })

  return {
    icalAttachmentEnabled: settings?.icalAttachmentEnabled ?? true,
    addToCalendarLinksEnabled: settings?.addToCalendarLinksEnabled ?? true,
  }
}

/**
 * 予約確認メールを送信
 */
export async function sendReservationConfirmationEmail(
  data: ReservationEmailData
): Promise<{ success: boolean; error?: string }> {
  if (!isEmailEnabled()) {
    console.warn('Email disabled: RESEND_API_KEY not set')
    return { success: true }
  }

  const resend = getResendClient()
  if (!resend) {
    return { success: true }
  }

  try {
    const reservationDate = format(data.startTime, 'yyyy年M月d日 (EEEE)', { locale: ja })
    const startTime = format(data.startTime, 'HH:mm', { locale: ja })
    const endTime = format(data.endTime, 'HH:mm', { locale: ja })

    // カレンダー設定を取得
    const calendarSettings = await getCalendarEmailSettings()

    // カレンダーイベントを生成
    const calendarEvent = createReservationEvent({
      reservationId: data.reservationId,
      spaceName: data.spaceName,
      customerName: data.customerName,
      startTime: data.startTime,
      endTime: data.endTime,
      location: data.location,
      notes: data.notes,
    })

    // Add to Calendarリンクを生成
    const addToCalendarLinks = calendarSettings.addToCalendarLinksEnabled
      ? generateAddToCalendarLinks(calendarEvent)
      : undefined

    // iCalファイルを生成（添付用）
    let attachments: { filename: string; content: Buffer }[] | undefined
    if (calendarSettings.icalAttachmentEnabled) {
      try {
        attachments = [
          {
            filename: `reservation-${data.reservationId.slice(0, 8)}.ics`,
            content: Buffer.from(generateICalContent(calendarEvent), 'utf-8'),
          },
        ]
      } catch (icalError) {
        console.error('Failed to generate iCal attachment:', icalError)
        // 添付なしで続行
      }
    }

    await resend.emails.send({
      from: getFromAddress(),
      to: data.customerEmail,
      subject: `【ご予約確認】${data.spaceName} - ${reservationDate}`,
      react: ReservationConfirmationEmail({
        customerName: data.customerName,
        spaceName: data.spaceName,
        reservationDate,
        startTime,
        endTime,
        totalPrice: formatPrice(data.totalPrice),
        reservationId: data.reservationId.slice(0, 8).toUpperCase(),
        notes: data.notes,
        addToCalendarLinks,
      }),
      attachments,
    })

    return { success: true }
  } catch (error) {
    console.error('Failed to send reservation confirmation email:', error)
    return { success: false, error: 'メール送信に失敗しました' }
  }
}

/**
 * 予約キャンセルメールを送信
 */
export async function sendReservationCancelledEmail(
  data: ReservationEmailData
): Promise<{ success: boolean; error?: string }> {
  if (!isEmailEnabled()) {
    console.warn('Email disabled: RESEND_API_KEY not set')
    return { success: true }
  }

  const resend = getResendClient()
  if (!resend) {
    return { success: true }
  }

  try {
    const reservationDate = format(data.startTime, 'yyyy年M月d日 (EEEE)', { locale: ja })
    const startTime = format(data.startTime, 'HH:mm', { locale: ja })
    const endTime = format(data.endTime, 'HH:mm', { locale: ja })

    await resend.emails.send({
      from: getFromAddress(),
      to: data.customerEmail,
      subject: `【予約キャンセル】${data.spaceName} - ${reservationDate}`,
      react: ReservationCancelledEmail({
        customerName: data.customerName,
        spaceName: data.spaceName,
        reservationDate,
        startTime,
        endTime,
        reservationId: data.reservationId.slice(0, 8).toUpperCase(),
      }),
    })

    return { success: true }
  } catch (error) {
    console.error('Failed to send reservation cancelled email:', error)
    return { success: false, error: 'メール送信に失敗しました' }
  }
}

/**
 * 予約に関する管理者通知メールを送信
 */
export async function sendReservationAdminNotification(
  data: ReservationEmailData,
  action: 'new' | 'update' | 'cancel'
): Promise<{ success: boolean; error?: string }> {
  if (!isEmailEnabled()) {
    console.warn('Email disabled: RESEND_API_KEY not set')
    return { success: true }
  }

  const resend = getResendClient()
  if (!resend) {
    return { success: true }
  }

  try {
    const notificationEmails = await getNotificationEmails()
    if (notificationEmails.length === 0) return { success: true }

    const reservationDate = format(data.startTime, 'yyyy年M月d日 (EEEE)', { locale: ja })
    const startTime = format(data.startTime, 'HH:mm', { locale: ja })
    const endTime = format(data.endTime, 'HH:mm', { locale: ja })

    const actionText = {
      new: '新規予約',
      update: '予約変更',
      cancel: '予約キャンセル',
    }[action]

    await resend.emails.send({
      from: getFromAddress(),
      to: notificationEmails,
      subject: `【${actionText}】${data.spaceName} - ${data.customerName}様`,
      react: AdminNotificationEmail({
        type: 'reservation',
        action,
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        spaceName: data.spaceName,
        reservationDate,
        startTime,
        endTime,
        totalPrice: formatPrice(data.totalPrice),
        reservationId: data.reservationId.slice(0, 8).toUpperCase(),
        adminUrl: getAdminUrl(`/reservations/${data.reservationId}`),
      }),
    })

    return { success: true }
  } catch (error) {
    console.error('Failed to send admin notification email:', error)
    return { success: false, error: 'メール送信に失敗しました' }
  }
}

// =============================================================================
// Contact Emails
// =============================================================================

/**
 * お問い合わせ確認メールを送信
 */
export async function sendContactConfirmationEmail(
  data: ContactEmailData
): Promise<{ success: boolean; error?: string }> {
  if (!isEmailEnabled()) {
    console.warn('Email disabled: RESEND_API_KEY not set')
    return { success: true }
  }

  const resend = getResendClient()
  if (!resend) {
    return { success: true }
  }

  try {
    await resend.emails.send({
      from: getFromAddress(),
      to: data.email,
      subject: `【お問い合わせ受付】${data.subject}`,
      react: ContactConfirmationEmail({
        name: data.name,
        subject: data.subject,
        message: data.message,
      }),
    })

    return { success: true }
  } catch (error) {
    console.error('Failed to send contact confirmation email:', error)
    return { success: false, error: 'メール送信に失敗しました' }
  }
}

/**
 * お問い合わせ管理者通知メールを送信
 */
export async function sendContactAdminNotification(
  data: ContactEmailData
): Promise<{ success: boolean; error?: string }> {
  if (!isEmailEnabled()) {
    console.warn('Email disabled: RESEND_API_KEY not set')
    return { success: true }
  }

  const resend = getResendClient()
  if (!resend) {
    return { success: true }
  }

  try {
    const notificationEmails = await getNotificationEmails()
    if (notificationEmails.length === 0) return { success: true }

    await resend.emails.send({
      from: getFromAddress(),
      to: notificationEmails,
      subject: `【新規お問い合わせ】${data.subject} - ${data.name}様`,
      react: AdminNotificationEmail({
        type: 'inquiry',
        name: data.name,
        email: data.email,
        subject: data.subject,
        message: data.message,
        inquiryId: data.inquiryId.slice(0, 8).toUpperCase(),
        adminUrl: getAdminUrl(`/inquiries/${data.inquiryId}`),
      }),
    })

    return { success: true }
  } catch (error) {
    console.error('Failed to send admin notification email:', error)
    return { success: false, error: 'メール送信に失敗しました' }
  }
}

// =============================================================================
// System Notification Emails
// =============================================================================

/**
 * カレンダー同期による時間変更拒否の管理者通知メールを送信
 */
export async function sendCalendarSyncRejectionEmail(data: {
  reservationId: string
  spaceName: string
  customerName: string
  customerEmail: string
  attemptedStartTime: Date
  attemptedEndTime: Date
  currentStartTime: Date
  currentEndTime: Date
  conflictingReservation: {
    id: string
    startTime: Date
    endTime: Date
  }
}): Promise<{ success: boolean; error?: string }> {
  if (!isEmailEnabled()) {
    console.warn('Email disabled: RESEND_API_KEY not set')
    return { success: true }
  }

  const resend = getResendClient()
  if (!resend) {
    return { success: true }
  }

  try {
    const notificationEmails = await getNotificationEmails()
    if (notificationEmails.length === 0) return { success: true }

    const currentDate = format(data.currentStartTime, 'yyyy年M月d日 (EEEE)', { locale: ja })
    const currentStart = format(data.currentStartTime, 'HH:mm')
    const currentEnd = format(data.currentEndTime, 'HH:mm')

    const attemptedDate = format(data.attemptedStartTime, 'yyyy年M月d日 (EEEE)', { locale: ja })
    const attemptedStart = format(data.attemptedStartTime, 'HH:mm')
    const attemptedEnd = format(data.attemptedEndTime, 'HH:mm')

    const conflictDate = format(data.conflictingReservation.startTime, 'yyyy年M月d日 (EEEE)', {
      locale: ja,
    })
    const conflictStart = format(data.conflictingReservation.startTime, 'HH:mm')
    const conflictEnd = format(data.conflictingReservation.endTime, 'HH:mm')

    const textContent = `
カレンダー同期エラー: 時間変更が拒否されました

予約番号: ${data.reservationId.slice(0, 8).toUpperCase()}
お客様: ${data.customerName} (${data.customerEmail})
スペース: ${data.spaceName}

現在の予約時間（変更なし）:
  ${currentDate} ${currentStart} - ${currentEnd}

試行された変更時間（拒否）:
  ${attemptedDate} ${attemptedStart} - ${attemptedEnd}

拒否理由: 以下の予約と重複
  予約ID: ${data.conflictingReservation.id.slice(0, 8).toUpperCase()}
  時間: ${conflictDate} ${conflictStart} - ${conflictEnd}

対応が必要な場合は、管理画面で予約を確認してください:
${getAdminUrl(`/reservations/${data.reservationId}`)}

※ Google Calendarでの変更は反映されていません。予約は元の時間のままです。
    `.trim()

    await resend.emails.send({
      from: getFromAddress(),
      to: notificationEmails,
      subject: `【カレンダー同期エラー】時間変更拒否 - ${data.spaceName}`,
      text: textContent,
    })

    return { success: true }
  } catch (error) {
    console.error('Failed to send calendar sync rejection email:', error)
    return { success: false, error: 'メール送信に失敗しました' }
  }
}

/**
 * Webhook更新通知メールを送信
 */
export async function sendWebhookRenewalNotification(data: {
  success: boolean
  newExpiration?: Date
  error?: string
}): Promise<{ success: boolean; error?: string }> {
  if (!isEmailEnabled()) {
    console.warn('Email disabled: RESEND_API_KEY not set')
    return { success: true }
  }

  const resend = getResendClient()
  if (!resend) {
    return { success: true }
  }

  try {
    const notificationEmails = await getNotificationEmails()
    if (notificationEmails.length === 0) return { success: true }

    const subject = data.success
      ? '【Google Calendar】Webhook自動更新完了'
      : '【エラー】Google Calendar Webhook自動更新失敗'

    const renewedAt = format(new Date(), 'yyyy年M月d日 HH:mm', { locale: ja })
    const newExpirationStr = data.newExpiration
      ? format(data.newExpiration, 'yyyy年M月d日 HH:mm', { locale: ja })
      : '不明'

    let textContent: string
    if (data.success) {
      textContent = `
Google Calendar Webhookが自動更新されました。

更新日時: ${renewedAt}
新しい有効期限: ${newExpirationStr}

次の更新は有効期限の2日前に自動実行されます。
      `.trim()
    } else {
      textContent = `
Google Calendar Webhookの自動更新に失敗しました。

更新試行日時: ${renewedAt}
エラー: ${data.error || '不明なエラー'}

対応が必要です。管理画面から手動でWebhookを再設定してください:
${getAdminUrl('/settings')}

※ ポーリングが設定されている場合は、引き続きポーリングで同期されます。
      `.trim()
    }

    await resend.emails.send({
      from: getFromAddress(),
      to: notificationEmails,
      subject,
      text: textContent,
    })

    return { success: true }
  } catch (error) {
    console.error('Failed to send webhook renewal notification email:', error)
    return { success: false, error: 'メール送信に失敗しました' }
  }
}
