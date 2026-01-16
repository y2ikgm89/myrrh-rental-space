'use client'

/**
 * 通知設定セクション
 *
 * 各種イベント通知のオン/オフ設定
 */

import { useState, useTransition } from 'react'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
  Switch,
} from '@/components/admin/ui'
import { updateNotificationSettings } from '@/actions/admin/settings'
import type { SettingsData } from '@/actions/admin/settings'
import { useRefreshOnSuccess } from '../hooks'

interface NotificationSectionProps {
  settings: SettingsData
}

export function NotificationSection({ settings }: NotificationSectionProps) {
  const { handleResult } = useRefreshOnSuccess()
  const [isPending, startTransition] = useTransition()
  const [formData, setFormData] = useState({
    notifyNewReservation: settings.notifyNewReservation,
    notifyReservationChange: settings.notifyReservationChange,
    notifyReservationCancel: settings.notifyReservationCancel,
    notifyNewInquiry: settings.notifyNewInquiry,
  })

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateNotificationSettings(formData)
      handleResult(result)
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>通知トリガー設定</CardTitle>
        <CardDescription>
          どのイベントで管理者に通知メールを送信するか設定します
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="notifyNewReservation" className="font-medium">
                新規予約
              </Label>
              <p className="text-xs text-muted-foreground">
                予約が作成されたとき
              </p>
            </div>
            <Switch
              id="notifyNewReservation"
              checked={formData.notifyNewReservation}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, notifyNewReservation: checked })
              }
              disabled={isPending}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="notifyReservationChange" className="font-medium">
                予約変更
              </Label>
              <p className="text-xs text-muted-foreground">
                予約内容が変更されたとき
              </p>
            </div>
            <Switch
              id="notifyReservationChange"
              checked={formData.notifyReservationChange}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, notifyReservationChange: checked })
              }
              disabled={isPending}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="notifyReservationCancel" className="font-medium">
                予約キャンセル
              </Label>
              <p className="text-xs text-muted-foreground">
                予約がキャンセルされたとき
              </p>
            </div>
            <Switch
              id="notifyReservationCancel"
              checked={formData.notifyReservationCancel}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, notifyReservationCancel: checked })
              }
              disabled={isPending}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="notifyNewInquiry" className="font-medium">
                お問い合わせ
              </Label>
              <p className="text-xs text-muted-foreground">
                お問い合わせが送信されたとき
              </p>
            </div>
            <Switch
              id="notifyNewInquiry"
              checked={formData.notifyNewInquiry}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, notifyNewInquiry: checked })
              }
              disabled={isPending}
            />
          </div>
        </div>

        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? '保存中...' : '通知設定を保存'}
        </Button>
      </CardContent>
    </Card>
  )
}
