'use client'

/**
 * 予約設定セクション
 *
 * 予約時間単位、最小/最大予約時間、キャンセルポリシーの設定
 */

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
} from '@/components/admin/ui'
import { updateReservationSettings } from '@/actions/admin/settings'
import type { SettingsData } from '@/actions/admin/settings'
import { useRefreshOnSuccess } from '../hooks'

interface ReservationSectionProps {
  settings: SettingsData
}

export function ReservationSection({ settings }: ReservationSectionProps) {
  const { handleResult } = useRefreshOnSuccess()
  const [isPending, startTransition] = useTransition()
  const [formData, setFormData] = useState({
    defaultTimeSlot: settings.defaultTimeSlot || 60,
    minReservationDuration: settings.minReservationDuration || 60,
    maxReservationDuration: settings.maxReservationDuration || 480,
    cancellationPolicy: settings.cancellationPolicy || '',
  })

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateReservationSettings({
        defaultTimeSlot: formData.defaultTimeSlot || null,
        minReservationDuration: formData.minReservationDuration || null,
        maxReservationDuration: formData.maxReservationDuration || null,
        cancellationPolicy: formData.cancellationPolicy || null,
      })
      handleResult(result)
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>予約設定</CardTitle>
        <CardDescription>予約に関する基本設定を行います</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="defaultTimeSlot">予約時間単位（分）</Label>
            <Input
              id="defaultTimeSlot"
              type="number"
              value={formData.defaultTimeSlot}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  defaultTimeSlot: parseInt(e.target.value) || 60,
                })
              }
              min={15}
              max={240}
              step={15}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">15〜240分</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="minReservationDuration">最小予約時間（分）</Label>
            <Input
              id="minReservationDuration"
              type="number"
              value={formData.minReservationDuration}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  minReservationDuration: parseInt(e.target.value) || 60,
                })
              }
              min={15}
              max={480}
              step={15}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">予約可能な最短時間</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxReservationDuration">最大予約時間（分）</Label>
            <Input
              id="maxReservationDuration"
              type="number"
              value={formData.maxReservationDuration}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  maxReservationDuration: parseInt(e.target.value) || 480,
                })
              }
              min={60}
              max={1440}
              step={30}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">予約可能な最長時間（最大24時間）</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cancellationPolicy">キャンセルポリシー</Label>
          <Textarea
            id="cancellationPolicy"
            value={formData.cancellationPolicy}
            onChange={(e) =>
              setFormData({ ...formData, cancellationPolicy: e.target.value })
            }
            placeholder="キャンセルポリシーを入力...

例）
・7日前まで：無料キャンセル
・3日前まで：50%のキャンセル料
・前日〜当日：100%のキャンセル料"
            rows={6}
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">
            予約フォームや確認メールに表示されます
          </p>
        </div>

        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? '保存中...' : '予約設定を保存'}
        </Button>
      </CardContent>
    </Card>
  )
}
