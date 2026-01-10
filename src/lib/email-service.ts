import { getResendClient, getFromAddress, isEmailEnabled } from './email'
import { ReservationConfirmationEmail } from '@/emails/reservation-confirmation'
import { ReservationCancelledEmail } from '@/emails/reservation-cancelled'
import { ContactConfirmationEmail } from '@/emails/contact-confirmation'
import { AdminNotificationEmail } from '@/emails/admin-notification'
import { prisma } from './prisma'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

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
      }),
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
