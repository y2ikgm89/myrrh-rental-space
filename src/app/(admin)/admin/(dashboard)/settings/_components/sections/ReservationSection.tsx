'use client'

/**
 * 予約設定セクション
 *
 * 予約時間単位、最小/最大予約時間、キャンセルポリシーの設定
 * キャンセルポリシーは利用規約管理（Terms）から選択
 */

import { useState, useTransition, useEffect } from 'react'
import Link from 'next/link'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/admin/components/ui'
import { updateReservationSettings, getCancellationPolicies } from '@/admin/actions/settings'
import type { SettingsData } from '@/admin/actions/settings'
import { useRefreshOnSuccess } from '../hooks'
import { ExternalLink, AlertCircle } from 'lucide-react'

interface ReservationSectionProps {
  settings: SettingsData
}

interface CancellationPolicy {
  id: string
  title: string
  updatedAt: Date
}

export function ReservationSection({ settings }: ReservationSectionProps) {
  const { handleResult } = useRefreshOnSuccess()
  const [isPending, startTransition] = useTransition()
  const [cancellationPolicies, setCancellationPolicies] = useState<CancellationPolicy[]>([])
  const [isLoadingPolicies, setIsLoadingPolicies] = useState(true)

  const [formData, setFormData] = useState({
    defaultTimeSlot: settings.defaultTimeSlot || 60,
    minReservationDuration: settings.minReservationDuration || 60,
    maxReservationDuration: settings.maxReservationDuration || 480,
    cancellationTermsId: settings.cancellationTermsId || '',
  })

  // キャンセルポリシー一覧を取得
  useEffect(() => {
    async function fetchPolicies() {
      try {
        const policies = await getCancellationPolicies()
        setCancellationPolicies(policies)
      } catch (error) {
        console.error('Failed to fetch cancellation policies:', error)
      } finally {
        setIsLoadingPolicies(false)
      }
    }
    fetchPolicies()
  }, [])

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateReservationSettings({
        defaultTimeSlot: formData.defaultTimeSlot || null,
        minReservationDuration: formData.minReservationDuration || null,
        maxReservationDuration: formData.maxReservationDuration || null,
        cancellationTermsId: formData.cancellationTermsId || null,
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

        <div className="space-y-3">
          <Label>キャンセルポリシー</Label>

          {/* キャンセルポリシー選択 */}
          <div className="space-y-2">
            <Select
              value={formData.cancellationTermsId}
              onValueChange={(v) => setFormData({ ...formData, cancellationTermsId: v === 'none' ? '' : v })}
              disabled={isPending || isLoadingPolicies}
            >
              <SelectTrigger className="w-full max-w-md">
                <SelectValue placeholder={isLoadingPolicies ? '読み込み中...' : 'キャンセルポリシーを選択'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  <span className="text-muted-foreground">設定しない</span>
                </SelectItem>
                {cancellationPolicies.map((policy) => (
                  <SelectItem key={policy.id} value={policy.id}>
                    {policy.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {cancellationPolicies.length === 0 && !isLoadingPolicies && (
              <div className="flex items-center gap-2 rounded-md border border-warning/20 bg-warning/10 p-3 text-sm text-warning-foreground">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>
                  キャンセルポリシーが登録されていません。先に利用規約管理で作成してください。
                </span>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              キャンセルポリシーは
              <Link
                href="/admin/terms"
                className="mx-1 inline-flex items-center gap-1 text-primary hover:underline"
              >
                利用規約管理
                <ExternalLink className="h-3 w-3" />
              </Link>
              で作成・編集できます。予約フォームや確認メールに表示されます。
            </p>
          </div>
        </div>

        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? '保存中...' : '予約設定を保存'}
        </Button>
      </CardContent>
    </Card>
  )
}
