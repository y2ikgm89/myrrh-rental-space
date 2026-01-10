'use server'

/**
 * データエクスポート Server Actions
 *
 * 予約、顧客、お問い合わせデータをCSV形式でエクスポート
 */

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type {
  ReservationWhereInput,
  CustomerWhereInput,
  InquiryWhereInput,
} from '@/types'

// =============================================================================
// Types
// =============================================================================

interface ExportOptions {
  startDate?: string
  endDate?: string
}

interface ExportResult {
  success: boolean
  data?: string
  filename?: string
  error?: string
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * 値をCSVセーフな文字列に変換
 */
function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  const str = String(value)

  // カンマ、改行、ダブルクォートが含まれる場合はダブルクォートで囲む
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`
  }

  return str
}

/**
 * 日付をフォーマット
 */
function formatDate(date: Date | null): string {
  if (!date) return ''
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

/**
 * 日時をフォーマット
 */
function formatDateTime(date: Date | null): string {
  if (!date) return ''
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * 予約ステータスを日本語に変換
 */
const reservationStatusLabels: Record<string, string> = {
  PENDING: '保留中',
  CONFIRMED: '確定',
  CANCELLED: 'キャンセル',
}

/**
 * 顧客ステータスを日本語に変換
 */
const customerStatusLabels: Record<string, string> = {
  NEW: '新規',
  REGULAR: '常連',
  VIP: 'VIP',
  INACTIVE: '休眠',
  BLACKLIST: 'ブラックリスト',
}

/**
 * お問い合わせステータスを日本語に変換
 */
const inquiryStatusLabels: Record<string, string> = {
  NEW: '新規',
  IN_PROGRESS: '対応中',
  RESOLVED: '解決済み',
  CLOSED: 'クローズ',
}

/**
 * 認証チェック
 */
async function checkAuth(): Promise<boolean> {
  const session = await auth()
  return !!session?.user
}

// =============================================================================
// Export Functions
// =============================================================================

/**
 * 予約データをCSVエクスポート
 */
export async function exportReservations(
  options: ExportOptions = {}
): Promise<ExportResult> {
  const isAuthenticated = await checkAuth()
  if (!isAuthenticated) {
    return { success: false, error: '認証が必要です' }
  }

  try {
    const where: ReservationWhereInput = {}

    // 日付フィルター
    if (options.startDate || options.endDate) {
      const endDate = options.endDate ? new Date(options.endDate) : undefined
      if (endDate) endDate.setHours(23, 59, 59, 999)
      where.startTime = {
        ...(options.startDate && { gte: new Date(options.startDate) }),
        ...(endDate && { lte: endDate }),
      }
    }

    const reservations = await prisma.reservation.findMany({
      where,
      include: {
        space: {
          select: { name: true },
        },
        customer: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            phoneNumber: true,
          },
        },
      },
      orderBy: { startTime: 'desc' },
    })

    // CSVヘッダー
    const headers = [
      '予約ID',
      'スペース名',
      '顧客名',
      'メールアドレス',
      '電話番号',
      '開始日時',
      '終了日時',
      'ステータス',
      '料金',
      '備考',
      '作成日',
    ]

    // CSVデータ行
    const rows = reservations.map((r) => [
      escapeCSV(r.id),
      escapeCSV(r.space.name),
      escapeCSV(`${r.customer.lastName} ${r.customer.firstName}`),
      escapeCSV(r.customer.email),
      escapeCSV(r.customer.phoneNumber),
      escapeCSV(formatDateTime(r.startTime)),
      escapeCSV(formatDateTime(r.endTime)),
      escapeCSV(reservationStatusLabels[r.status] ?? r.status),
      escapeCSV(r.totalPrice ? `¥${Number(r.totalPrice).toLocaleString()}` : ''),
      escapeCSV(r.notes),
      escapeCSV(formatDateTime(r.createdAt)),
    ])

    // BOM付きUTF-8でCSV生成
    const BOM = '\uFEFF'
    const csv = BOM + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')

    const filename = `reservations_${new Date().toISOString().split('T')[0]}.csv`

    return { success: true, data: csv, filename }
  } catch (error) {
    console.error('Export reservations error:', error)
    return { success: false, error: 'エクスポートに失敗しました' }
  }
}

/**
 * 顧客データをCSVエクスポート
 */
export async function exportCustomers(
  options: ExportOptions = {}
): Promise<ExportResult> {
  const isAuthenticated = await checkAuth()
  if (!isAuthenticated) {
    return { success: false, error: '認証が必要です' }
  }

  try {
    const where: CustomerWhereInput = {}

    // 日付フィルター（作成日）
    if (options.startDate || options.endDate) {
      const endDate = options.endDate ? new Date(options.endDate) : undefined
      if (endDate) endDate.setHours(23, 59, 59, 999)
      where.createdAt = {
        ...(options.startDate && { gte: new Date(options.startDate) }),
        ...(endDate && { lte: endDate }),
      }
    }

    const customers = await prisma.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    // CSVヘッダー
    const headers = [
      '顧客ID',
      '姓',
      '名',
      'メールアドレス',
      '電話番号',
      '住所',
      'ステータス',
      '予約回数',
      '累計利用金額',
      '初回予約日',
      '最終予約日',
      '備考',
      '登録日',
    ]

    // CSVデータ行
    const rows = customers.map((c) => [
      escapeCSV(c.id),
      escapeCSV(c.lastName),
      escapeCSV(c.firstName),
      escapeCSV(c.email),
      escapeCSV(c.phoneNumber),
      escapeCSV(c.address),
      escapeCSV(customerStatusLabels[c.status] ?? c.status),
      escapeCSV(c.totalReservations),
      escapeCSV(c.totalSpent ? `¥${Number(c.totalSpent).toLocaleString()}` : ''),
      escapeCSV(formatDate(c.firstReservationAt)),
      escapeCSV(formatDate(c.lastReservationAt)),
      escapeCSV(c.notes),
      escapeCSV(formatDate(c.createdAt)),
    ])

    // BOM付きUTF-8でCSV生成
    const BOM = '\uFEFF'
    const csv = BOM + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')

    const filename = `customers_${new Date().toISOString().split('T')[0]}.csv`

    return { success: true, data: csv, filename }
  } catch (error) {
    console.error('Export customers error:', error)
    return { success: false, error: 'エクスポートに失敗しました' }
  }
}

/**
 * お問い合わせデータをCSVエクスポート
 */
export async function exportInquiries(
  options: ExportOptions = {}
): Promise<ExportResult> {
  const isAuthenticated = await checkAuth()
  if (!isAuthenticated) {
    return { success: false, error: '認証が必要です' }
  }

  try {
    const where: InquiryWhereInput = {}

    // 日付フィルター
    if (options.startDate || options.endDate) {
      const endDate = options.endDate ? new Date(options.endDate) : undefined
      if (endDate) endDate.setHours(23, 59, 59, 999)
      where.createdAt = {
        ...(options.startDate && { gte: new Date(options.startDate) }),
        ...(endDate && { lte: endDate }),
      }
    }

    const inquiries = await prisma.inquiry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    // CSVヘッダー
    const headers = [
      'お問い合わせID',
      '名前',
      'メールアドレス',
      '件名',
      'メッセージ',
      'ステータス',
      '受信日時',
      '更新日時',
    ]

    // CSVデータ行
    const rows = inquiries.map((i) => [
      escapeCSV(i.id),
      escapeCSV(i.name),
      escapeCSV(i.email),
      escapeCSV(i.subject),
      escapeCSV(i.message),
      escapeCSV(inquiryStatusLabels[i.status] ?? i.status),
      escapeCSV(formatDateTime(i.createdAt)),
      escapeCSV(formatDateTime(i.updatedAt)),
    ])

    // BOM付きUTF-8でCSV生成
    const BOM = '\uFEFF'
    const csv = BOM + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')

    const filename = `inquiries_${new Date().toISOString().split('T')[0]}.csv`

    return { success: true, data: csv, filename }
  } catch (error) {
    console.error('Export inquiries error:', error)
    return { success: false, error: 'エクスポートに失敗しました' }
  }
}
