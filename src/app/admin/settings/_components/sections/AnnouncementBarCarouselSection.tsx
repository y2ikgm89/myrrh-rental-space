'use client'

/**
 * お知らせバーカルーセル設定セクション
 *
 * 複数のお知らせバーを表示する際のアニメーション設定
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@/components/admin/ui'
import { updateAnnouncementBarCarouselSettings } from '@/actions/admin/settings'
import type { SettingsData } from '@/actions/admin/settings'

const ANIMATION_OPTIONS = [
  { value: 'fade', label: 'フェード', description: '透明度でふわっと切り替え' },
  { value: 'slideX', label: '横スライド', description: '左右にスライドして切り替え' },
  { value: 'slideY', label: '縦スライド', description: '上下にスライドして切り替え' },
] as const

interface AnnouncementBarCarouselSectionProps {
  settings: SettingsData
  onUpdate: () => void
}

export function AnnouncementBarCarouselSection({
  settings,
  onUpdate,
}: AnnouncementBarCarouselSectionProps) {
  const [isPending, startTransition] = useTransition()
  const [formData, setFormData] = useState({
    announcementBarAnimation: settings.announcementBarAnimation as 'fade' | 'slideX' | 'slideY',
    announcementBarDuration: settings.announcementBarDuration,
    announcementBarAutoPlay: settings.announcementBarAutoPlay,
    announcementBarPauseOnHover: settings.announcementBarPauseOnHover,
    announcementBarShowArrows: settings.announcementBarShowArrows,
    announcementBarShowIndicator: settings.announcementBarShowIndicator,
  })

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateAnnouncementBarCarouselSettings({
        announcementBarAnimation: formData.announcementBarAnimation,
        announcementBarDuration: formData.announcementBarDuration,
        announcementBarAutoPlay: formData.announcementBarAutoPlay,
        announcementBarPauseOnHover: formData.announcementBarPauseOnHover,
        announcementBarShowArrows: formData.announcementBarShowArrows,
        announcementBarShowIndicator: formData.announcementBarShowIndicator,
      })
      if (!result.success) {
        alert(result.error)
      } else {
        onUpdate()
      }
    })
  }

  // 秒数表示用の変換
  const durationSeconds = formData.announcementBarDuration / 1000

  return (
    <Card>
      <CardHeader>
        <CardTitle>お知らせバー カルーセル設定</CardTitle>
        <CardDescription>
          複数のお知らせバーがある場合の表示アニメーションと切り替え動作を設定します。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* アニメーション種類 */}
        <div className="space-y-2">
          <Label htmlFor="announcementBarAnimation">アニメーション種類</Label>
          <Select
            value={formData.announcementBarAnimation}
            onValueChange={(value: 'fade' | 'slideX' | 'slideY') =>
              setFormData({ ...formData, announcementBarAnimation: value })
            }
            disabled={isPending}
          >
            <SelectTrigger id="announcementBarAnimation">
              <SelectValue placeholder="アニメーションを選択" />
            </SelectTrigger>
            <SelectContent>
              {ANIMATION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {ANIMATION_OPTIONS.find((o) => o.value === formData.announcementBarAnimation)?.description}
          </p>
        </div>

        {/* 自動再生 */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="announcementBarAutoPlay" className="font-medium">
              自動切り替え
            </Label>
            <p className="text-xs text-muted-foreground">
              有効にすると、設定した間隔でお知らせが自動的に切り替わります
            </p>
          </div>
          <Switch
            id="announcementBarAutoPlay"
            checked={formData.announcementBarAutoPlay}
            onCheckedChange={(checked) =>
              setFormData({ ...formData, announcementBarAutoPlay: checked })
            }
            disabled={isPending}
          />
        </div>

        {/* 切り替え間隔（自動再生有効時のみ） */}
        {formData.announcementBarAutoPlay && (
          <div className="space-y-2">
            <Label htmlFor="announcementBarDuration">切り替え間隔（秒）</Label>
            <Input
              id="announcementBarDuration"
              type="number"
              min={1}
              max={30}
              step={0.5}
              value={durationSeconds}
              onChange={(e) => {
                const seconds = parseFloat(e.target.value)
                // NaNや範囲外の値はデフォルト値（5秒）にフォールバック
                const validSeconds = isNaN(seconds) ? 5 : Math.max(1, Math.min(30, seconds))
                setFormData({
                  ...formData,
                  announcementBarDuration: Math.round(validSeconds * 1000),
                })
              }}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              1〜30秒の間で設定できます（推奨: 5秒）
            </p>
          </div>
        )}

        {/* ホバー時一時停止 */}
        {formData.announcementBarAutoPlay && (
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="announcementBarPauseOnHover" className="font-medium">
                ホバー時に一時停止
              </Label>
              <p className="text-xs text-muted-foreground">
                マウスを乗せている間は自動切り替えを一時停止します
              </p>
            </div>
            <Switch
              id="announcementBarPauseOnHover"
              checked={formData.announcementBarPauseOnHover}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, announcementBarPauseOnHover: checked })
              }
              disabled={isPending}
            />
          </div>
        )}

        {/* 矢印ボタン表示 */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="announcementBarShowArrows" className="font-medium">
              矢印ボタンを表示
            </Label>
            <p className="text-xs text-muted-foreground">
              手動でお知らせを切り替えるための矢印ボタンを表示します
            </p>
          </div>
          <Switch
            id="announcementBarShowArrows"
            checked={formData.announcementBarShowArrows}
            onCheckedChange={(checked) =>
              setFormData({ ...formData, announcementBarShowArrows: checked })
            }
            disabled={isPending}
          />
        </div>

        {/* インジケーター表示 */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="announcementBarShowIndicator" className="font-medium">
              インジケーターを表示
            </Label>
            <p className="text-xs text-muted-foreground">
              現在のお知らせ番号を表示します（例: 1/3）
            </p>
          </div>
          <Switch
            id="announcementBarShowIndicator"
            checked={formData.announcementBarShowIndicator}
            onCheckedChange={(checked) =>
              setFormData({ ...formData, announcementBarShowIndicator: checked })
            }
            disabled={isPending}
          />
        </div>

        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? '保存中...' : 'カルーセル設定を保存'}
        </Button>
      </CardContent>
    </Card>
  )
}
