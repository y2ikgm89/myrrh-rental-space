'use server'

/**
 * 予約関連 Server Actions（公開側）
 *
 * レンタルスペースの予約作成、空き状況確認を行うServer Actions。
 * 顧客向けの予約フローを提供します。
 *
 * ## 主な機能
 * - 予約作成（顧客情報の作成/更新、規約同意記録を含む）
 * - 時間枠の空き状況取得
 * - 月間の予約可能日取得
 *
 * ## セキュリティ
 * - Turnstile検証による不正アクセス防止
 * - Zodスキーマによる入力検証
 * - 予約重複チェック
 *
 * @module public/actions/reservation
 */

import { headers } from 'next/headers'
import { prisma } from '@/shared/lib/prisma'
import {
  reservationSchema,
  reservationWithTermsSchema,
  type ReservationInput,
  type ReservationWithTermsInput,
  type ReservationActionResult,
} from '@/public/lib/validations/reservation'
// ReservationStatus は checkReservationOverlap 内で使用（共有ロジック）
import {
  sendReservationConfirmationEmail,
  sendReservationAdminNotification,
} from '@/shared/lib/email-service'
import { syncReservationToCalendar } from '@/shared/lib/calendar-sync'
import {
  checkReservationOverlap,
  getAvailableTimeSlots as getAvailableTimeSlotsShared,
  type TimeSlot,
} from '@/shared/lib/reservation'
import { validateTurnstile, extractFieldErrors } from '@/shared/lib/action-helpers'
import { getTermsAgreementSettings } from '@/public/actions/settings'
import { recordTermsAgreement } from '@/public/actions/terms'
import { logError, ErrorCategory, ErrorSeverity, normalizeError } from '@/shared/lib/errors'
import { fireAndForget } from '@/shared/lib/async-utils'
import { toDateString, extractFirstFromCommaList, isRecord } from '@/shared/lib/serialize'
import {
  calculateReservationPrice,
  parseDurationDiscountRules,
  getTaxRate,
  calculateTaxIncludedPrice,
  getSpaceDiscountTypeOrDefault,
  getDurationDiscountOverrideOrDefault,
  getDiscountCombinationModeOrDefault,
  getTaxRateTypeOrDefault,
  type SpaceDiscountSettings,
  type TaxSettings,
} from '@/shared/lib/pricing'
import { validateCouponCode } from '@/shared/actions/coupon'

// 型の再エクスポート（後方互換性のため）
export type { TimeSlot } from '@/shared/lib/reservation'

// =============================================================================
// Internal Types
// =============================================================================

/**
 * スペース固有の規約同意情報（スキーマ外で渡される追加プロパティ）
 */
type TermsAgreementInfo = {
  termsId: string
  versionId: string
}

/**
 * termsAgreement プロパティの型ガード
 */
function isTermsAgreementInfo(value: unknown): value is TermsAgreementInfo {
  return (
    typeof value === 'object' &&
    value !== null &&
    'termsId' in value &&
    'versionId' in value &&
    typeof (value as TermsAgreementInfo).termsId === 'string' &&
    typeof (value as TermsAgreementInfo).versionId === 'string'
  )
}

/**
 * 入力からtermsAgreementを安全に抽出
 */
function extractTermsAgreement(input: unknown): TermsAgreementInfo | undefined {
  if (isRecord(input) && 'termsAgreement' in input) {
    if (isTermsAgreementInfo(input.termsAgreement)) {
      return input.termsAgreement
    }
  }
  return undefined
}

// =============================================================================
// Server Actions
// =============================================================================

/**
 * 予約を作成する Server Action
 *
 * 顧客情報の作成/更新、予約の作成、確認メール送信、カレンダー同期を
 * 一連のフローで実行します。
 *
 * ## 処理フロー
 * 1. Turnstile検証
 * 2. 規約同意設定の確認
 * 3. 入力バリデーション
 * 4. スペース存在確認
 * 5. 予約重複チェック
 * 6. 料金計算
 * 7. トランザクションで顧客・予約作成
 * 8. 規約同意記録（該当時）
 * 9. メール送信・カレンダー同期（バックグラウンド）
 *
 * @param input - 予約入力データ
 * @param turnstileToken - Turnstile検証トークン
 * @returns 予約作成結果（成功時は予約ID含む）
 */
export async function createReservation(
  input: ReservationInput | ReservationWithTermsInput,
  turnstileToken?: string
): Promise<ReservationActionResult> {
  // Turnstile検証
  const turnstileResult = await validateTurnstile(turnstileToken)
  if (!turnstileResult.success) {
    return { success: false, error: turnstileResult.error }
  }

  // 規約同意設定を取得
  const termsSettings = await getTermsAgreementSettings()
  const requireTermsAgreement = termsSettings.enabled

  // バリデーション（設定に応じてスキーマを選択）
  const schema = requireTermsAgreement ? reservationWithTermsSchema : reservationSchema
  const validation = schema.safeParse(input)

  if (!validation.success) {
    return {
      success: false,
      error: '入力内容に誤りがあります',
      fieldErrors: extractFieldErrors(validation.error),
    }
  }

  const {
    spaceId,
    date,
    startTime,
    endTime,
    lastName,
    firstName,
    lastNameKana,
    firstNameKana,
    email,
    phoneNumber,
    notes,
    couponCode,
  } = validation.data

  // スペース固有の規約同意情報（inputから直接取得、型ガードで安全に抽出）
  const termsAgreement = extractTermsAgreement(input)

  // 日時を Date オブジェクトに変換
  const startDateTime = new Date(`${date}T${startTime}:00`)
  const endDateTime = new Date(`${date}T${endTime}:00`)

  try {
    // スペースの存在確認（割引設定・税率タイプも取得）
    const space = await prisma.space.findUnique({
      where: { id: spaceId, isPublished: true, isActive: true },
      select: {
        id: true,
        hourlyPrice: true,
        name: true,
        address: true,
        discountType: true,
        discountValue: true,
        durationDiscountOverride: true,
        taxRateType: true,
      },
    })

    if (!space) {
      return {
        success: false,
        error: '指定されたスペースが見つかりません',
      }
    }

    // 予約重複チェック（共通ユーティリティ使用）
    const overlapCheck = await checkReservationOverlap({
      spaceId,
      startTime: startDateTime,
      endTime: endDateTime,
    })

    if (overlapCheck.hasOverlap) {
      return {
        success: false,
        error: '選択された時間帯は既に予約されています。別の時間帯をお選びください。',
      }
    }

    // 料金計算（時間単位）
    const hours =
      (endDateTime.getTime() - startDateTime.getTime()) / (1000 * 60 * 60)

    // 割引設定・税設定を取得
    const settings = await prisma.settings.findUnique({
      where: { id: 'singleton' },
      select: {
        durationDiscountEnabled: true,
        durationDiscountRules: true,
        discountCombinationMode: true,
        taxStandardRate: true,
        taxReducedRate: true,
      },
    })

    // クーポン検証（クーポンコードが指定されている場合）
    let validatedCoupon: {
      id: string
      code: string
      name: string
      type: 'PERCENTAGE' | 'FIXED_AMOUNT'
      discountValue: number
      maxDiscountAmount: number | null
      canCombineWithDurationDiscount: boolean
    } | null = null

    if (couponCode) {
      const basePrice = Number(space.hourlyPrice) * hours
      const couponResult = await validateCouponCode(couponCode, basePrice)
      if (!couponResult.success) {
        return {
          success: false,
          error: couponResult.error,
          fieldErrors: { couponCode: [couponResult.error] },
        }
      }
      validatedCoupon = couponResult.data.coupon
    }

    // スペース割引設定を構築（型ガード関数で安全に変換）
    const discountType = getSpaceDiscountTypeOrDefault(space.discountType)
    const durationDiscountOverride = getDurationDiscountOverrideOrDefault(space.durationDiscountOverride)

    const spaceDiscountSettings: SpaceDiscountSettings = {
      discountType,
      discountValue: discountType !== 'none' && space.discountValue ? Number(space.discountValue) : null,
      durationDiscountOverride,
    }

    // 料金計算（割引適用）
    const priceCalculation = calculateReservationPrice({
      hourlyPrice: Number(space.hourlyPrice),
      hours,
      durationRules: settings?.durationDiscountRules
        ? parseDurationDiscountRules(settings.durationDiscountRules)
        : [],
      durationDiscountEnabled: settings?.durationDiscountEnabled ?? false,
      spaceDiscount: spaceDiscountSettings,
      coupon: validatedCoupon,
      combinationMode: getDiscountCombinationModeOrDefault(settings?.discountCombinationMode),
      showWarning: false,
    })

    const totalPrice = priceCalculation.totalPrice

    // 税計算（予約時点の値を記録）
    const spaceTaxRateType = getTaxRateTypeOrDefault(space.taxRateType)
    const taxSettings: TaxSettings = {
      standardRate: settings?.taxStandardRate ? Number(settings.taxStandardRate) : 10,
      reducedRate: settings?.taxReducedRate ? Number(settings.taxReducedRate) : 8,
      displayModeAdmin: 'both',
      displayModePublic: 'tax_included',
      inputMode: 'tax_excluded',
    }
    const appliedTaxRate = getTaxRate(spaceTaxRateType, taxSettings)
    const taxAmount = Math.floor(totalPrice * (appliedTaxRate / 100))
    const totalPriceWithTax = calculateTaxIncludedPrice(totalPrice, appliedTaxRate)

    // トランザクションで顧客と予約を作成
    const result = await prisma.$transaction(async (tx) => {
      // 重複チェック（トランザクション内で再検証 - Race Condition防止）
      const overlapCheckTx = await checkReservationOverlap(
        { spaceId, startTime: startDateTime, endTime: endDateTime },
        tx
      )
      if (overlapCheckTx.hasOverlap) {
        throw new Error('OVERLAP_DETECTED')
      }

      // クーポンの再検証（レースコンディション対策）
      if (priceCalculation.appliedCoupon) {
        const coupon = await tx.coupon.findUnique({
          where: { id: priceCalculation.appliedCoupon.id },
        })

        if (!coupon || !coupon.isActive) {
          throw new Error('COUPON_INVALID')
        }

        const now = new Date()
        if (coupon.validFrom > now || (coupon.validUntil && coupon.validUntil < now)) {
          throw new Error('COUPON_EXPIRED')
        }

        if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
          throw new Error('COUPON_LIMIT_REACHED')
        }

        // クーポン使用回数をインクリメント（トランザクション内でアトミックに実行）
        await tx.coupon.update({
          where: { id: coupon.id },
          data: { usageCount: { increment: 1 } },
        })
      }

      // 顧客を検索または作成
      let customer = await tx.customer.findUnique({
        where: { email },
      })

      if (!customer) {
        customer = await tx.customer.create({
          data: {
            lastName,
            firstName,
            lastNameKana: lastNameKana || null,
            firstNameKana: firstNameKana || null,
            email,
            phoneNumber,
          },
        })
      } else {
        // 既存顧客の情報を更新（カナは既存値があれば上書きしない、なければ追加）
        customer = await tx.customer.update({
          where: { email },
          data: {
            lastName,
            firstName,
            // カナは新規入力があれば更新、なければ既存値を保持
            ...(lastNameKana ? { lastNameKana } : {}),
            ...(firstNameKana ? { firstNameKana } : {}),
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
          // 割引情報
          basePrice: priceCalculation.basePrice,
          spaceDiscountAmount: priceCalculation.spaceDiscount > 0 ? priceCalculation.spaceDiscount : null,
          durationDiscountAmount: priceCalculation.durationDiscount > 0 ? priceCalculation.durationDiscount : null,
          couponDiscountAmount: priceCalculation.couponDiscount > 0 ? priceCalculation.couponDiscount : null,
          couponId: priceCalculation.appliedCoupon?.id ?? null,
          // 税情報（予約時点の値を記録）
          taxRateType: spaceTaxRateType,
          taxRate: appliedTaxRate,
          taxAmount,
          totalPriceWithTax,
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

      return { reservation, customer }
    })

    // スペース固有の規約同意を記録
    if (termsAgreement) {
      const headersList = await headers()
      const ipAddress = extractFirstFromCommaList(headersList.get('x-forwarded-for'))
      const userAgent = headersList.get('user-agent') || null

      await recordTermsAgreement({
        termsId: termsAgreement.termsId,
        versionId: termsAgreement.versionId,
        reservationId: result.reservation.id,
        guestName: `${lastName} ${firstName}`,
        guestEmail: email,
        ipAddress: ipAddress || undefined,
        userAgent: userAgent || undefined,
      })
    }

    // 予約確認メールを送信
    const emailData = {
      reservationId: result.reservation.id,
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
      reservationId: result.reservation.id,
      spaceName: space.name,
      customerName: `${lastName} ${firstName}`,
      customerEmail: email,
      startTime: startDateTime,
      endTime: endDateTime,
      location: space.address ?? undefined,
      notes: notes || undefined,
      totalPrice,
    }

    // メール送信 + カレンダー同期（バックグラウンド）
    fireAndForget(
      Promise.all([
        sendReservationConfirmationEmail(emailData),
        sendReservationAdminNotification(emailData, 'new'),
        syncReservationToCalendar(calendarData),
      ]),
      {
        operation: 'postReservationTasks',
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: { reservationId: result.reservation.id },
      }
    )

    return {
      success: true,
      message: `予約を受け付けました。確認メールをお送りしましたので、ご確認ください。`,
      reservationId: result.reservation.id,
    }
  } catch (error) {
    // エラーをユーザーフレンドリーなメッセージに変換
    const err = error instanceof Error ? error : null
    
    // 重複エラー（Race Condition検出時）
    if (err?.message === 'OVERLAP_DETECTED') {
      return {
        success: false,
        error: '選択された時間帯は既に予約されています。別の時間帯をお選びください。',
      }
    }
    
    // クーポン関連のエラー
    if (err?.message === 'COUPON_INVALID') {
      return {
        success: false,
        error: 'クーポンが無効になりました。ページを更新してやり直してください。',
        fieldErrors: { couponCode: ['無効なクーポンコードです'] },
      }
    }
    if (err?.message === 'COUPON_EXPIRED') {
      return {
        success: false,
        error: 'クーポンの有効期限が切れました。',
        fieldErrors: { couponCode: ['クーポンの有効期限が切れています'] },
      }
    }
    if (err?.message === 'COUPON_LIMIT_REACHED') {
      return {
        success: false,
        error: 'クーポンの利用回数上限に達しました。',
        fieldErrors: { couponCode: ['クーポンの利用回数上限に達しています'] },
      }
    }

    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: {
        operation: 'createReservation',
        spaceId: input.spaceId,
      },
    })
    return {
      success: false,
      error: '予約の作成中にエラーが発生しました。しばらく経ってから再度お試しください。',
    }
  }
}

/**
 * 指定日の空き時間枠を取得する
 *
 * 指定されたスペースと日付に対して、予約可能な時間枠を1時間単位で返します。
 * 既存の予約、過去の時間帯は「予約不可」としてマークされます。
 *
 * ## 時間枠の判定ロジック
 * - 営業時間内（デフォルト: 9:00-21:00）の時間枠を生成
 * - 既存予約と重複する時間枠は `available: false`
 * - 当日の過去時間は `available: false`
 *
 * @param spaceId - スペースID
 * @param date - 日付（YYYY-MM-DD形式）
 * @returns 時間枠の配列（time: "HH:mm", available: boolean）
 */
export async function getAvailableTimeSlots(
  spaceId: string,
  date: string
): Promise<TimeSlot[]> {
  // 共有ロジックに委譲
  return getAvailableTimeSlotsShared(spaceId, date)
}

/**
 * 指定月の予約可能日を取得する
 *
 * 指定された年月の全日付に対して、予約可能かどうかを判定して返します。
 * 現在は過去日のみ予約不可としており、各日の詳細な空き状況は含みません。
 *
 * @param spaceId - スペースID
 * @param year - 年（例: 2024）
 * @param month - 月（1-12）
 * @returns 日付と予約可能性の配列
 *
 * @example
 * ```typescript
 * const dates = await getAvailableDates('space-123', 2024, 12)
 * // => [{ date: '2024-12-01', hasAvailability: true }, ...]
 * ```
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
    const dateStr = toDateString(currentDate)
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
