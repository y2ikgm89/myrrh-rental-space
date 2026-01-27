/**
 * iCal (.ics) 生成 + Add to Calendar リンク生成
 *
 * RFC 5545 準拠のiCalendarファイル生成と
 * 各カレンダーサービス（Google, Outlook, Apple）への追加リンク生成
 *
 * @module shared/lib/ical
 */

import { format } from 'date-fns'

// =============================================================================
// Types
// =============================================================================

export interface CalendarEvent {
  title: string
  description: string
  location?: string
  startTime: Date
  endTime: Date
  url?: string
}

export interface AddToCalendarLinks {
  google: string
  outlook: string
  outlookWeb: string
  apple: string // iCal data URL
  ical: string // 直接ダウンロード用
}

// =============================================================================
// iCal Generation (RFC 5545)
// =============================================================================

/**
 * iCalendarファイルの内容を生成
 */
export function generateICalContent(event: CalendarEvent): string {
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@myrrh-rental-space`
  const dtstamp = formatICalDate(new Date())
  const dtstart = formatICalDate(event.startTime)
  const dtend = formatICalDate(event.endTime)

  // 説明文のエスケープ（改行、カンマ、セミコロン、バックスラッシュ）
  const escapedDescription = escapeICalText(event.description)
  const escapedTitle = escapeICalText(event.title)
  const escapedLocation = event.location ? escapeICalText(event.location) : ''

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Myrrh Rental Space//Reservation System//JP',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${escapedTitle}`,
  ]

  if (escapedDescription) {
    lines.push(`DESCRIPTION:${escapedDescription}`)
  }

  if (escapedLocation) {
    lines.push(`LOCATION:${escapedLocation}`)
  }

  if (event.url) {
    lines.push(`URL:${event.url}`)
  }

  lines.push('END:VEVENT', 'END:VCALENDAR')

  // RFC 5545: 行は75オクテット以下、CRLF で終端
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

/**
 * iCal形式の日時フォーマット（UTC）
 * Format: YYYYMMDDTHHmmssZ
 *
 * 注意: 入力はローカル時刻（JST）として扱い、UTCに変換して出力
 */
function formatICalDate(date: Date): string {
  // DateオブジェクトをUTC文字列に変換してからフォーマット
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  const seconds = String(date.getUTCSeconds()).padStart(2, '0')

  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`
}

/**
 * iCalテキストのエスケープ
 * - バックスラッシュ → \\
 * - セミコロン → \;
 * - カンマ → \,
 * - 改行 → \n
 */
function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * RFC 5545: 行の折り返し（75オクテット制限）
 */
function foldLine(line: string): string {
  if (line.length <= 75) return line

  const parts: string[] = []
  let remaining = line

  while (remaining.length > 75) {
    // 最初の行は75文字、継続行は74文字（スペース1文字分）
    const limit = parts.length === 0 ? 75 : 74
    parts.push(remaining.slice(0, limit))
    remaining = remaining.slice(limit)
  }

  if (remaining) {
    parts.push(remaining)
  }

  // 継続行は先頭にスペースを付ける
  return parts.join('\r\n ')
}

// =============================================================================
// iCal Feed Generation (Multiple Events)
// =============================================================================

/**
 * 複数イベントのiCalフィードを生成（外部カレンダー購読用）
 */
export function generateICalFeed(
  events: CalendarEvent[],
  calendarName: string = '予約カレンダー'
): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Myrrh Rental Space//Reservation System//JP',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICalText(calendarName)}`,
    'X-WR-TIMEZONE:Asia/Tokyo',
  ]

  for (const event of events) {
    lines.push(...generateVEventLines(event))
  }

  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

/**
 * 単一イベントのVEVENTセクションを生成（内部使用）
 */
function generateVEventLines(event: CalendarEvent & { uid?: string }): string[] {
  // UIDは予約IDベースで生成（一意性を保証）
  const uid = event.uid || `${Date.now()}-${Math.random().toString(36).slice(2)}@myrrh-rental-space`
  const dtstamp = formatICalDate(new Date())
  const dtstart = formatICalDate(event.startTime)
  const dtend = formatICalDate(event.endTime)

  const escapedDescription = escapeICalText(event.description)
  const escapedTitle = escapeICalText(event.title)
  const escapedLocation = event.location ? escapeICalText(event.location) : ''

  const lines: string[] = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${escapedTitle}`,
  ]

  if (escapedDescription) {
    lines.push(`DESCRIPTION:${escapedDescription}`)
  }

  if (escapedLocation) {
    lines.push(`LOCATION:${escapedLocation}`)
  }

  if (event.url) {
    lines.push(`URL:${event.url}`)
  }

  lines.push('END:VEVENT')
  return lines
}

// =============================================================================
// Add to Calendar Links
// =============================================================================

/**
 * 各カレンダーサービスへの追加リンクを生成
 */
export function generateAddToCalendarLinks(event: CalendarEvent): AddToCalendarLinks {
  const icalContent = generateICalContent(event)

  return {
    google: generateGoogleCalendarLink(event),
    outlook: generateOutlookLink(event),
    outlookWeb: generateOutlookWebLink(event),
    apple: generateICalDataUrl(icalContent),
    ical: generateICalDataUrl(icalContent),
  }
}

/**
 * Google Calendar追加リンク
 */
function generateGoogleCalendarLink(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${formatGoogleDate(event.startTime)}/${formatGoogleDate(event.endTime)}`,
    details: event.description,
  })

  if (event.location) {
    params.set('location', event.location)
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/**
 * Google Calendar用の日時フォーマット（UTC）
 */
function formatGoogleDate(date: Date): string {
  return formatICalDate(date) // 同じフォーマットを使用
}

/**
 * Outlook (デスクトップ) 追加リンク
 * webcal://スキームでiCalファイルを開く
 */
function generateOutlookLink(event: CalendarEvent): string {
  const icalContent = generateICalContent(event)
  // data URLをwebcal://で開く
  // ただし、実際にはdata URLはwebcal://で使えないので、
  // iCalダウンロードリンクを使う
  return generateICalDataUrl(icalContent)
}

/**
 * Outlook Web (Outlook.com) 追加リンク
 */
function generateOutlookWebLink(event: CalendarEvent): string {
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    startdt: event.startTime.toISOString(),
    enddt: event.endTime.toISOString(),
    subject: event.title,
    body: event.description,
  })

  if (event.location) {
    params.set('location', event.location)
  }

  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`
}

/**
 * iCalファイルのData URL生成
 * Apple Calendarやその他のカレンダーアプリで使用可能
 */
function generateICalDataUrl(icalContent: string): string {
  // Base64エンコード
  const base64 = Buffer.from(icalContent, 'utf-8').toString('base64')
  return `data:text/calendar;charset=utf-8;base64,${base64}`
}

// =============================================================================
// Reservation-specific Helpers
// =============================================================================

/**
 * 予約情報からカレンダーイベントを生成
 */
export function createReservationEvent(params: {
  reservationId: string
  spaceName: string
  customerName: string
  startTime: Date
  endTime: Date
  location?: string
  notes?: string
}): CalendarEvent {
  const formattedDate = format(params.startTime, 'yyyy/MM/dd')
  const formattedStart = format(params.startTime, 'HH:mm')
  const formattedEnd = format(params.endTime, 'HH:mm')

  const description = [
    `予約ID: ${params.reservationId.slice(0, 8).toUpperCase()}`,
    `スペース: ${params.spaceName}`,
    `日時: ${formattedDate} ${formattedStart} - ${formattedEnd}`,
    `お名前: ${params.customerName}`,
    params.notes ? `備考: ${params.notes}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  return {
    title: `【予約】${params.spaceName}`,
    description,
    location: params.location,
    startTime: params.startTime,
    endTime: params.endTime,
  }
}

/**
 * iCalファイルのダウンロード用ファイル名を生成
 */
export function generateICalFilename(reservationId: string, startTime: Date): string {
  const dateStr = format(startTime, 'yyyyMMdd')
  return `reservation-${reservationId.slice(0, 8)}-${dateStr}.ics`
}
