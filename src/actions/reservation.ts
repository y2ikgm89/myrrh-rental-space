'use server'

import { prisma } from '@/lib/prisma'
import {
  reservationSchema,
  reservationWithTermsSchema,
  type ReservationInput,
  type ReservationWithTermsInput,
  type ReservationActionResult,
  type TimeSlot,
} from '@/lib/validations/reservation'
import { ReservationStatus } from '@/generated/prisma/client/enums'
import {
  sendReservationConfirmationEmail,
  sendReservationAdminNotification,
} from '@/lib/email-service'
import { syncReservationToCalendar } from '@/lib/calendar-sync'
import { verifyTurnstileToken, isTurnstileEnabled } from '@/lib/turnstile'
import { getTermsAgreementSettings } from '@/actions/admin/settings'

/**
 * 予約を作成する Server Action
 */
export async function createReservation(
  input: ReservationInput | ReservationWithTermsInput,
  turnstileToken?: string
): Promise<ReservationActionResult> {
  // Turnstile検証（有効な場合のみ）
  if (isTurnstileEnabled()) {
    if (!turnstileToken) {
      return {
        success: false,
        error: 'セキュリティ検証が必要です。ページを再読み込みしてください。',
      }
    }

    const isValid = await verifyTurnstileToken(turnstileToken)
    if (!isValid) {
      return {
        success: false,
        error: 'セキュリティ検証に失敗しました。しばらく経ってから再度お試しください。',
      }
    }
  }

  // 規約同意設定を取得
  const termsSettings = await getTermsAgreementSettings()
  const requireTermsAgreement = termsSettings.enabled

  // バリデーション（設定に応じてスキーマを選択）
  const schema = requireTermsAgreement ? reservationWithTermsSchema : reservationSchema
  const validation = schema.safeParse(input)

  if (!validation.success) {
    const fieldErrors: Record<string, string[]> = {}
    for (const issue of validation.error.issues) {
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
      error: '入力内容に誤りがあります',
      fieldErrors,
    }
  }

  const { spaceId, date, startTime, endTime, lastName, firstName, email, phoneNumber, notes } =
    validation.data

  // 日時を Date オブジェクトに変換
  const startDateTime = new Date(`${date}T${startTime}:00`)
  const endDateTime = new Date(`${date}T${endTime}:00`)

  try {
    // スペースの存在確認
    const space = await prisma.space.findUnique({
      where: { id: spaceId, isPublished: true, isActive: true },
      select: { id: true, hourlyPrice: true, name: true, address: true },
    })

    if (!space) {
      return {
        success: false,
        error: '指定されたスペースが見つかりません',
      }
    }

    // 予約重複チェック
    const existingReservation = await prisma.reservation.findFirst({
      where: {
        spaceId,
        status: { not: 'CANCELLED' as ReservationStatus },
        OR: [
          {
            // 既存予約の開始時間が新規予約の時間内にある
            startTime: {
              gte: startDateTime,
              lt: endDateTime,
            },
          },
          {
            // 既存予約の終了時間が新規予約の時間内にある
            endTime: {
              gt: startDateTime,
              lte: endDateTime,
            },
          },
          {
            // 既存予約が新規予約を完全に含む
            AND: [
              { startTime: { lte: startDateTime } },
              { endTime: { gte: endDateTime } },
            ],
          },
        ],
      },
    })

    if (existingReservation) {
      return {
        success: false,
        error: '選択された時間帯は既に予約されています。別の時間帯をお選びください。',
      }
    }

    // 料金計算（時間単位）
    const hours =
      (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60 * 60)
    const totalPrice = Number(space.hourlyPrice) * hours

    // トランザクションで顧客と予約を作成
    const result = await prisma.$transaction(async (tx) => {
      // 顧客を検索または作成
      let customer = await tx.customer.findUnique({
        where: { email },
      })

      if (!customer) {
        customer = await tx.customer.create({
          data: {
            lastName,
            firstName,
            email,
            phoneNumber,
          },
        })
      } else {
        // 既存顧客の情報を更新
        customer = await tx.customer.update({
          where: { email },
          data: {
            lastName,
            firstName,
            phoneNumber,
          },
        })
      }

      // 予約を作成
      const reservation = await tx.reservation.create({
        data: {
          spaceId,
          customerId: customer.id,
          startTime: startDateTime,
          endTime: endDateTime,
          totalPrice,
          notes,
          status: 'PENDING',
          // 規約同意が有効で、実際にユーザーが同意している場合のみ日時を記録
          termsAgreedAt:
            requireTermsAgreement && 'agreedToTerms' in input && input.agreedToTerms
              ? new Date()
              : null,
        },
      })

      // 顧客の予約統計を更新
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          totalReservations: { increment: 1 },
          lastReservationAt: new Date(),
          firstReservationAt: customer.firstReservationAt ?? new Date(),
        },
      })

      return reservation
    })

    // 予約確認メールを送信
    const emailData = {
      reservationId: result.id,
      customerEmail: email,
      customerName: `${lastName} ${firstName}`,
      spaceName: space.name,
      startTime: startDateTime,
      endTime: endDateTime,
      totalPrice,
      notes: notes || undefined,
      location: space.address ?? undefined,
    }

    // カレンダー同期用データ
    const calendarData = {
      reservationId: result.id,
      spaceName: space.name,
      customerName: `${lastName} ${firstName}`,
      customerEmail: email,
      startTime: startDateTime,
      endTime: endDateTime,
      location: space.address ?? undefined,
      notes: notes || undefined,
      totalPrice,
    }

    // メール送信 + カレンダー同期（バックグラウンドで実行、失敗してもエラーにしない）
    Promise.all([
      sendReservationConfirmationEmail(emailData),
      sendReservationAdminNotification(emailData, 'new'),
      syncReservationToCalendar(calendarData),
    ]).catch((err) => {
      console.error('Failed to send reservation emails or sync calendar:', err)
    })

    return {
      success: true,
      message: `予約を受け付けました。確認メールをお送りしましたので、ご確認ください。`,
      reservationId: result.id,
    }
  } catch (error) {
    console.error('Reservation creation error:', error)
    return {
      success: false,
      error: '予約の作成中にエラーが発生しました。しばらく経ってから再度お試しください。',
    }
  }
}

/**
 * 指定日の空き時間枠を取得する
 */
export async function getAvailableTimeSlots(
  spaceId: string,
  date: string
): Promise<TimeSlot[]> {
  // 営業時間（デフォルト: 9:00-21:00）
  const businessHours = {
    start: 9,
    end: 21,
  }

  // 1時間単位の時間枠を生成
  const slots: TimeSlot[] = []
  for (let hour = businessHours.start; hour < businessHours.end; hour++) {
    const timeStr = `${hour.toString().padStart(2, '0')}:00`
    slots.push({
      time: timeStr,
      available: true,
    })
  }

  // 対象日の予約を取得
  const targetDate = new Date(date)
  const startOfDay = new Date(targetDate)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(targetDate)
  endOfDay.setHours(23, 59, 59, 999)

  const reservations = await prisma.reservation.findMany({
    where: {
      spaceId,
      status: { not: 'CANCELLED' as ReservationStatus },
      startTime: { gte: startOfDay },
      endTime: { lte: endOfDay },
    },
    select: {
      startTime: true,
      endTime: true,
    },
  })

  // 予約済み時間枠をマーク
  for (const reservation of reservations) {
    const startHour = reservation.startTime.getHours()
    const endHour = reservation.endTime.getHours()

    for (let hour = startHour; hour < endHour; hour++) {
      const slotIndex = hour - businessHours.start
      if (slotIndex >= 0 && slotIndex < slots.length) {
        slots[slotIndex].available = false
      }
    }
  }

  // 過去の時間枠を無効化（今日の場合）
  const now = new Date()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (targetDate.getTime() === today.getTime()) {
    const currentHour = now.getHours()
    for (let i = 0; i < slots.length; i++) {
      const slotHour = businessHours.start + i
      if (slotHour <= currentHour) {
        slots[i].available = false
      }
    }
  }

  return slots
}

/**
 * 指定月の予約可能日を取得する
 */
export async function getAvailableDates(
  spaceId: string,
  year: number,
  month: number
): Promise<{ date: string; hasAvailability: boolean }[]> {
  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // 月内の全日付を生成
  const dates: { date: string; hasAvailability: boolean }[] = []
  const currentDate = new Date(startDate)

  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0]
    const isPast = currentDate < today

    dates.push({
      date: dateStr,
      hasAvailability: !isPast, // 過去日は予約不可
    })

    currentDate.setDate(currentDate.getDate() + 1)
  }

  // 各日の予約状況をチェック（オプション：重い処理のため必要に応じて実装）
  // この実装では簡略化のため、過去日以外は全て予約可能としています

  return dates
}
