'use client'

import { useState, useTransition } from 'react'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
  Switch,
} from '@/admin/components/ui'
import { updateBusinessHoursSettings } from '@/admin/actions/settings'
import type { SettingsData, BusinessHours, BusinessHoursDay } from '@/admin/actions/settings'
import { useRefreshOnSuccess } from './hooks'

interface BusinessHoursSectionProps {
  settings: SettingsData
}

interface DayOfWeek {
  key: keyof BusinessHours
  label: string
}

const DAYS_OF_WEEK: readonly DayOfWeek[] = [
  { key: 'monday', label: '月曜日' },
  { key: 'tuesday', label: '火曜日' },
  { key: 'wednesday', label: '水曜日' },
  { key: 'thursday', label: '木曜日' },
  { key: 'friday', label: '金曜日' },
  { key: 'saturday', label: '土曜日' },
  { key: 'sunday', label: '日曜日' },
]

const DEFAULT_HOURS: BusinessHoursDay = {
  isOpen: true,
  openTime: '09:00',
  closeTime: '21:00',
}

const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  monday: { ...DEFAULT_HOURS },
  tuesday: { ...DEFAULT_HOURS },
  wednesday: { ...DEFAULT_HOURS },
  thursday: { ...DEFAULT_HOURS },
  friday: { ...DEFAULT_HOURS },
  saturday: { ...DEFAULT_HOURS },
  sunday: { isOpen: false, openTime: null, closeTime: null },
}

export function BusinessHoursSection({ settings }: BusinessHoursSectionProps) {
  const { handleResult } = useRefreshOnSuccess()
  const [isPending, startTransition] = useTransition()

  const initialBusinessHours = settings.businessHours ?? DEFAULT_BUSINESS_HOURS
  const initialRegularHolidays = settings.regularHolidays ?? []
  const initialSpecialHolidays = settings.specialHolidays ?? []

  // 定休日設定を営業時間に反映（DBに保存されたregularHolidaysから初期化）
  const businessHoursWithHolidays = (() => {
    const hours = { ...initialBusinessHours }
    for (const day of initialRegularHolidays) {
      if (day in hours) {
        hours[day as keyof BusinessHours] = {
          ...hours[day as keyof BusinessHours],
          isOpen: false,
        }
      }
    }
    return hours
  })()

  const [businessHours, setBusinessHours] = useState<BusinessHours>(businessHoursWithHolidays)
  const [specialHolidaysText, setSpecialHolidaysText] = useState(
    initialSpecialHolidays.join('\n')
  )
  const [holidayNotice, setHolidayNotice] = useState(settings.holidayNotice || '')

  const handleDayChange = (
    day: keyof BusinessHours,
    field: keyof BusinessHoursDay,
    value: boolean | string | null
  ) => {
    setBusinessHours((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: value,
      },
    }))
  }

  const handleSave = () => {
    startTransition(async () => {
      // 特別休業日をパース（1行1日付）
      const specialHolidays = specialHolidaysText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && /^\d{4}-\d{2}-\d{2}$/.test(line))

      // 定休日を抽出
      const regularHolidays = DAYS_OF_WEEK
        .filter(({ key }) => !businessHours[key].isOpen)
        .map(({ key }) => key)

      const result = await updateBusinessHoursSettings({
        businessHours,
        regularHolidays: regularHolidays.length > 0 ? regularHolidays : null,
        specialHolidays: specialHolidays.length > 0 ? specialHolidays : null,
        holidayNotice: holidayNotice || null,
      })

      handleResult({ ...result, message: result.success ? '営業時間設定を保存しました' : undefined })
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>営業日・時間設定</CardTitle>
        <CardDescription>曜日ごとの営業時間と定休日を設定します</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 曜日ごとの営業時間 */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium">曜日別営業時間</h3>
          <div className="space-y-3">
            {DAYS_OF_WEEK.map(({ key, label }) => (
              <div
                key={key}
                className="flex items-center gap-4 rounded-lg border p-3"
              >
                <div className="w-20">
                  <span className="font-medium">{label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={businessHours[key].isOpen}
                    onCheckedChange={(checked) =>
                      handleDayChange(key, 'isOpen', checked)
                    }
                    disabled={isPending}
                  />
                  <span className="text-sm text-muted-foreground">
                    {businessHours[key].isOpen ? '営業' : '休業'}
                  </span>
                </div>
                {businessHours[key].isOpen && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={businessHours[key].openTime || '09:00'}
                      onChange={(e) =>
                        handleDayChange(key, 'openTime', e.target.value)
                      }
                      className="w-32"
                      disabled={isPending}
                    />
                    <span>〜</span>
                    <Input
                      type="time"
                      value={businessHours[key].closeTime || '21:00'}
                      onChange={(e) =>
                        handleDayChange(key, 'closeTime', e.target.value)
                      }
                      className="w-32"
                      disabled={isPending}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 特別休業日 */}
        <div className="space-y-2">
          <Label htmlFor="specialHolidays">特別休業日</Label>
          <Textarea
            id="specialHolidays"
            value={specialHolidaysText}
            onChange={(e) => setSpecialHolidaysText(e.target.value)}
            placeholder="2024-12-31&#10;2025-01-01&#10;2025-01-02&#10;2025-01-03"
            rows={5}
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">
            1行に1日付（YYYY-MM-DD形式）で入力してください。年末年始・お盆・祝日などを登録できます。
          </p>
        </div>

        {/* 休業日のお知らせ */}
        <div className="space-y-2">
          <Label htmlFor="holidayNotice">休業日のお知らせ</Label>
          <Textarea
            id="holidayNotice"
            value={holidayNotice}
            onChange={(e) => setHolidayNotice(e.target.value)}
            placeholder="年末年始（12/31〜1/3）は休業いたします。"
            rows={3}
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">
            ホームページに表示するお知らせ文を入力できます。
          </p>
        </div>

        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? '保存中...' : '営業時間設定を保存'}
        </Button>
      </CardContent>
    </Card>
  )
}
