'use client'

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
} from '@/admin/components/ui'
import type { DesignStyle, AnimationType } from '@/shared/lib/announcement-bar-utils'
import { DesignPreview } from './DesignPreview'
import {
  ANIMATION_OPTIONS,
  DESIGN_STYLE_OPTIONS,
  type CarouselSettingsProps,
} from './types'

export function CarouselSettingsPanel({
  settings,
  isPending,
  onSettingsChange,
  onSave,
}: CarouselSettingsProps) {
  const durationSeconds = settings.announcementBarDuration / 1000

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>デザイン設定</CardTitle>
          <CardDescription>
            お知らせバーの見た目とカラーを設定します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* デザインスタイル */}
          <div className="space-y-2">
            <Label htmlFor="designStyle">デザインスタイル</Label>
            <Select
              value={settings.announcementBarDesignStyle}
              onValueChange={(value: DesignStyle) =>
                onSettingsChange({ ...settings, announcementBarDesignStyle: value })
              }
              disabled={isPending}
            >
              <SelectTrigger id="designStyle">
                <SelectValue placeholder="デザインスタイルを選択" />
              </SelectTrigger>
              <SelectContent>
                {DESIGN_STYLE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {DESIGN_STYLE_OPTIONS.find((o) => o.value === settings.announcementBarDesignStyle)?.description}
            </p>
          </div>

          {/* プレビュー */}
          <div className="space-y-2">
            <Label>プレビュー</Label>
            <div className="rounded-lg border bg-gradient-to-br from-gray-100 to-gray-200 p-4">
              <DesignPreview
                message="サンプルお知らせメッセージ"
                linkText="詳細はこちら"
                designStyle={settings.announcementBarDesignStyle}
                bgColor={settings.announcementBarBgColor || null}
                textColor={settings.announcementBarTextColor || null}
                stripeColor={settings.announcementBarStripeColor || null}
                stripeAnimation={settings.announcementBarStripeAnimation}
                gradientAnimation={settings.announcementBarGradientAnimation}
                glassAnimation={settings.announcementBarGlassAnimation}
              />
            </div>
          </div>

          {/* 共通カラー設定 */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bgColor">背景色（カスタム）</Label>
              <div className="flex gap-2">
                <Input
                  id="bgColor"
                  value={settings.announcementBarBgColor}
                  onChange={(e) => onSettingsChange({ ...settings, announcementBarBgColor: e.target.value })}
                  placeholder="#2563eb"
                  disabled={isPending}
                />
                {settings.announcementBarBgColor && (
                  <div
                    className="h-10 w-10 shrink-0 rounded border"
                    style={{ backgroundColor: settings.announcementBarBgColor }}
                  />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                空欄の場合はデフォルト色を使用
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="textColor">文字色（カスタム）</Label>
              <div className="flex gap-2">
                <Input
                  id="textColor"
                  value={settings.announcementBarTextColor}
                  onChange={(e) => onSettingsChange({ ...settings, announcementBarTextColor: e.target.value })}
                  placeholder="#ffffff"
                  disabled={isPending}
                />
                {settings.announcementBarTextColor && (
                  <div
                    className="h-10 w-10 shrink-0 rounded border"
                    style={{ backgroundColor: settings.announcementBarTextColor }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* ストライプ設定（stripedスタイル選択時のみ） */}
          {settings.announcementBarDesignStyle === 'striped' && (
            <div className="rounded-lg border p-4 space-y-4">
              <h4 className="font-medium">ストライプ設定</h4>

              <div className="space-y-2">
                <Label htmlFor="stripeColor">ストライプ色</Label>
                <div className="flex gap-2">
                  <Input
                    id="stripeColor"
                    value={settings.announcementBarStripeColor}
                    onChange={(e) => onSettingsChange({ ...settings, announcementBarStripeColor: e.target.value })}
                    placeholder="#ffffff"
                    disabled={isPending}
                  />
                  {settings.announcementBarStripeColor && (
                    <div
                      className="h-10 w-10 shrink-0 rounded border"
                      style={{ backgroundColor: settings.announcementBarStripeColor }}
                    />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  空欄の場合は背景色を少し明るくした色を使用
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="stripeAnimation" className="font-medium">
                    ストライプアニメーション
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    ストライプが流れるアニメーションを有効にします
                  </p>
                </div>
                <Switch
                  id="stripeAnimation"
                  checked={settings.announcementBarStripeAnimation}
                  onCheckedChange={(checked) =>
                    onSettingsChange({ ...settings, announcementBarStripeAnimation: checked })
                  }
                  disabled={isPending}
                />
              </div>
            </div>
          )}

          {/* グラデーション設定（gradientスタイル選択時のみ） */}
          {settings.announcementBarDesignStyle === 'gradient' && (
            <div className="rounded-lg border p-4 space-y-4">
              <h4 className="font-medium">グラデーション設定</h4>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="gradientAnimation" className="font-medium">
                    グラデーションアニメーション
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    グラデーションが左右に流れるアニメーションを有効にします
                  </p>
                </div>
                <Switch
                  id="gradientAnimation"
                  checked={settings.announcementBarGradientAnimation}
                  onCheckedChange={(checked) =>
                    onSettingsChange({ ...settings, announcementBarGradientAnimation: checked })
                  }
                  disabled={isPending}
                />
              </div>
            </div>
          )}

          {/* グラス設定（glassスタイル選択時のみ） */}
          {settings.announcementBarDesignStyle === 'glass' && (
            <div className="rounded-lg border p-4 space-y-4">
              <h4 className="font-medium">グラス設定</h4>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="glassAnimation" className="font-medium">
                    シマーアニメーション
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    光の反射が流れるようなシマー効果を有効にします
                  </p>
                </div>
                <Switch
                  id="glassAnimation"
                  checked={settings.announcementBarGlassAnimation}
                  onCheckedChange={(checked) =>
                    onSettingsChange({ ...settings, announcementBarGlassAnimation: checked })
                  }
                  disabled={isPending}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>カルーセル設定</CardTitle>
          <CardDescription>
            複数のお知らせバーがある場合の表示アニメーションと切り替え動作を設定します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* アニメーション種類 */}
          <div className="space-y-2">
            <Label htmlFor="animation">アニメーション種類</Label>
            <Select
              value={settings.announcementBarAnimation}
              onValueChange={(value: AnimationType) =>
                onSettingsChange({ ...settings, announcementBarAnimation: value })
              }
              disabled={isPending}
            >
              <SelectTrigger id="animation">
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
              {ANIMATION_OPTIONS.find((o) => o.value === settings.announcementBarAnimation)?.description}
            </p>
          </div>

          {/* 自動再生 */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="autoPlay" className="font-medium">
                自動切り替え
              </Label>
              <p className="text-xs text-muted-foreground">
                有効にすると、設定した間隔でお知らせが自動的に切り替わります
              </p>
            </div>
            <Switch
              id="autoPlay"
              checked={settings.announcementBarAutoPlay}
              onCheckedChange={(checked) =>
                onSettingsChange({ ...settings, announcementBarAutoPlay: checked })
              }
              disabled={isPending}
            />
          </div>

          {/* 切り替え間隔（自動再生有効時のみ） */}
          {settings.announcementBarAutoPlay && (
            <div className="space-y-2">
              <Label htmlFor="duration">切り替え間隔（秒）</Label>
              <Input
                id="duration"
                type="number"
                min={1}
                max={30}
                step={0.5}
                value={durationSeconds}
                onChange={(e) => {
                  const seconds = parseFloat(e.target.value)
                  const validSeconds = isNaN(seconds) ? 5 : Math.max(1, Math.min(30, seconds))
                  onSettingsChange({
                    ...settings,
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
          {settings.announcementBarAutoPlay && (
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="pauseOnHover" className="font-medium">
                  ホバー時に一時停止
                </Label>
                <p className="text-xs text-muted-foreground">
                  マウスを乗せている間は自動切り替えを一時停止します
                </p>
              </div>
              <Switch
                id="pauseOnHover"
                checked={settings.announcementBarPauseOnHover}
                onCheckedChange={(checked) =>
                  onSettingsChange({ ...settings, announcementBarPauseOnHover: checked })
                }
                disabled={isPending}
              />
            </div>
          )}

          {/* 矢印ボタン表示 */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="showArrows" className="font-medium">
                矢印ボタンを表示
              </Label>
              <p className="text-xs text-muted-foreground">
                手動でお知らせを切り替えるための矢印ボタンを表示します
              </p>
            </div>
            <Switch
              id="showArrows"
              checked={settings.announcementBarShowArrows}
              onCheckedChange={(checked) =>
                onSettingsChange({ ...settings, announcementBarShowArrows: checked })
              }
              disabled={isPending}
            />
          </div>

          {/* インジケーター表示 */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="showIndicator" className="font-medium">
                インジケーターを表示
              </Label>
              <p className="text-xs text-muted-foreground">
                現在のお知らせ番号を表示します（例: 1/3）
              </p>
            </div>
            <Switch
              id="showIndicator"
              checked={settings.announcementBarShowIndicator}
              onCheckedChange={(checked) =>
                onSettingsChange({ ...settings, announcementBarShowIndicator: checked })
              }
              disabled={isPending}
            />
          </div>

          <Button onClick={onSave} disabled={isPending}>
            {isPending ? '保存中...' : 'デザイン・カルーセル設定を保存'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
