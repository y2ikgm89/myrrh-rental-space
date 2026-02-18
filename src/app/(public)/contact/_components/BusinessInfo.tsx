/**
 * BusinessInfo — Business information card with DB data
 *
 * Server Component. Fetches business info from DB.
 * schema.org microdata for NAP consistency.
 * 営業時間 / 施設属性 / Google口コミリンク を含む
 */

import type { ReactElement } from 'react'
import {
  ExternalLink,
  Wifi,
  Car,
  Accessibility,
  ArrowUpFromDot,
  Cigarette,
  Utensils,
  Camera,
  Music,
} from 'lucide-react'
import { getBusinessInfo } from '@/public/data/business'
import { DAY_LABELS, ATTR_LABELS } from '@/public/lib/seo/json-ld-config'
import { isRecord } from '@/shared/lib/serialize'

// =============================================================================
// Constants
// =============================================================================

/** 曜日の表示順序 */
const DAY_ORDER = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
] as const

/** 施設属性アイコンマッピング */
const ATTR_ICONS: Record<string, typeof Wifi> = {
  wifi: Wifi,
  parking: Car,
  barrier_free: Accessibility,
  elevator: ArrowUpFromDot,
  smoking_area: Cigarette,
  food_allowed: Utensils,
  photography_allowed: Camera,
  music_allowed: Music,
}

// =============================================================================
// Helpers
// =============================================================================

interface BusinessHoursDisplay {
  label: string
  time: string
  microdataContent: string
}

/**
 * 営業時間 JSON を表示用データに変換
 * 同じ時間帯の曜日をグループ化して「月〜金 09:00-21:00」形式で出力
 */
function parseBusinessHoursForDisplay(businessHours: unknown): BusinessHoursDisplay[] {
  if (!isRecord(businessHours)) return []

  // 曜日ごとの時間帯を取得
  const dayTimes: { key: string; label: string; time: string }[] = []
  for (const dayKey of DAY_ORDER) {
    const dayValue = businessHours[dayKey]
    if (!isRecord(dayValue) || !dayValue['isOpen'] || !Array.isArray(dayValue['slots'])) continue

    for (const slot of dayValue['slots']) {
      if (!isRecord(slot) || typeof slot['openTime'] !== 'string' || typeof slot['closeTime'] !== 'string') continue
      dayTimes.push({
        key: dayKey,
        label: DAY_LABELS[dayKey] ?? dayKey,
        time: `${slot['openTime']}-${slot['closeTime']}`,
      })
    }
  }

  if (dayTimes.length === 0) return []

  // 同じ時間帯の曜日をグループ化
  const groups = new Map<string, string[]>()
  const groupKeys = new Map<string, string[]>()
  for (const dt of dayTimes) {
    const existing = groups.get(dt.time)
    const existingKeys = groupKeys.get(dt.time)
    if (existing && existingKeys) {
      existing.push(dt.label)
      existingKeys.push(dt.key)
    } else {
      groups.set(dt.time, [dt.label])
      groupKeys.set(dt.time, [dt.key])
    }
  }

  const DAY_ABBREV: Record<string, string> = {
    monday: 'Mo', tuesday: 'Tu', wednesday: 'We', thursday: 'Th',
    friday: 'Fr', saturday: 'Sa', sunday: 'Su',
  }

  const result: BusinessHoursDisplay[] = []
  for (const [time, labels] of groups) {
    const keys = groupKeys.get(time) ?? []
    const [opens = '', closes = ''] = time.split('-')
    const abbrevs = keys.map((k) => DAY_ABBREV[k] ?? k)
    const firstAbbrev = abbrevs[0] ?? ''
    const lastAbbrev = abbrevs[abbrevs.length - 1] ?? ''
    const microdataContent = abbrevs.length > 1
      ? `${firstAbbrev}-${lastAbbrev} ${opens}-${closes}`
      : `${firstAbbrev} ${opens}-${closes}`

    const firstLabel = labels[0] ?? ''
    const lastLabel = labels[labels.length - 1] ?? ''
    result.push({
      label: labels.length > 1 ? `${firstLabel}〜${lastLabel}` : firstLabel,
      time: `${opens} - ${closes}`,
      microdataContent,
    })
  }

  return result
}

// =============================================================================
// Component
// =============================================================================

export async function BusinessInfo(): Promise<ReactElement> {
  const info = await getBusinessInfo()
  const hoursDisplay = parseBusinessHoursForDisplay(info.businessHours)

  return (
    <div
      className="rounded-lg border border-border bg-card p-6 md:p-8"
      itemScope
      itemType="https://schema.org/LocalBusiness"
    >
      <h3 className="font-heading text-lg tracking-tight">
        アクセス・営業情報
      </h3>
      <meta itemProp="name" content={info.name} />

      <dl className="mt-6 space-y-5">
        {info.address && (
          <div
            itemProp="address"
            itemScope
            itemType="https://schema.org/PostalAddress"
          >
            <dt className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
              住所
            </dt>
            <dd className="mt-1 text-sm text-foreground">
              {info.postalCode && <meta itemProp="postalCode" content={info.postalCode} />}
              {info.prefecture && <meta itemProp="addressRegion" content={info.prefecture} />}
              {info.city && <meta itemProp="addressLocality" content={info.city} />}
              {info.streetAddress && <meta itemProp="streetAddress" content={info.streetAddress} />}
              {info.address}
            </dd>
          </div>
        )}

        {info.phone && (
          <div>
            <dt className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
              電話番号
            </dt>
            <dd className="mt-1 text-sm text-foreground">
              <a
                itemProp="telephone"
                href={`tel:${info.phone}`}
                className="transition-colors hover:text-primary-dark"
              >
                {info.phone}
              </a>
            </dd>
          </div>
        )}

        {info.email && (
          <div>
            <dt className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
              メール
            </dt>
            <dd className="mt-1 text-sm text-foreground">
              <a
                itemProp="email"
                href={`mailto:${info.email}`}
                className="transition-colors hover:text-primary-dark"
              >
                {info.email}
              </a>
            </dd>
          </div>
        )}

        {/* 営業時間（microdata付き） */}
        {hoursDisplay.length > 0 && (
          <div>
            <dt className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
              営業時間
            </dt>
            <dd className="mt-1 space-y-1 text-sm text-foreground">
              {hoursDisplay.map((h) => (
                <div key={h.microdataContent} className="flex items-center gap-3">
                  <span className="min-w-[4rem] text-muted-foreground">{h.label}</span>
                  <time itemProp="openingHours" content={h.microdataContent}>
                    {h.time}
                  </time>
                </div>
              ))}
            </dd>
          </div>
        )}

        {info.holidayNotice && (
          <div>
            <dt className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
              休業日
            </dt>
            <dd className="mt-1 text-sm text-foreground">{info.holidayNotice}</dd>
          </div>
        )}

        {/* 施設属性 */}
        {info.businessAttributes && Object.values(info.businessAttributes).some(Boolean) && (
          <div>
            <dt className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
              設備・サービス
            </dt>
            <dd className="mt-2 flex flex-wrap gap-3">
              {Object.entries(info.businessAttributes)
                .filter(([, value]) => value)
                .map(([key]) => {
                  const Icon = ATTR_ICONS[key]
                  const label = ATTR_LABELS[key] ?? key
                  return (
                    <span
                      key={key}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
                    >
                      {Icon && <Icon className="h-3.5 w-3.5" />}
                      {label}
                    </span>
                  )
                })}
            </dd>
          </div>
        )}

        {/* Google リンク */}
        {(info.googleMapsUrl || info.googleReviewUrl) && (
          <div>
            <dt className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
              Google
            </dt>
            <dd className="mt-1 flex flex-col gap-2 text-sm">
              {info.googleMapsUrl && (
                <a
                  href={info.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-foreground transition-colors hover:text-primary-dark"
                >
                  Google Maps で見る
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              {info.googleReviewUrl && (
                <a
                  href={info.googleReviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-foreground transition-colors hover:text-primary-dark"
                >
                  Google で口コミを書く
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </dd>
          </div>
        )}
      </dl>
    </div>
  )
}
