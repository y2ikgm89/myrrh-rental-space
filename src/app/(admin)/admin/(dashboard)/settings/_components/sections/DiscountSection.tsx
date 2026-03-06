'use client'

/**
 * 割引設定セクション
 *
 * 長時間割引ルールと割引併用モードの設定
 */

import { useState, useTransition } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Switch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/admin/components/ui'
import { updateDiscountSettings, type DiscountSettingsData } from '@/admin/actions/settings'
import { DiscountCombinationMode } from '@/shared/generated/prisma/enums'
import { useRefreshOnSuccess } from '../hooks'

interface DiscountSectionProps {
  settings: DiscountSettingsData
}

type DurationRule = {
  hours: number
  discountRate: number
}

export function DiscountSection({ settings }: DiscountSectionProps) {
  const { handleResult } = useRefreshOnSuccess()
  const [isPending, startTransition] = useTransition()

  const [formData, setFormData] = useState({
    durationDiscountEnabled: settings.durationDiscountEnabled,
    durationDiscountRules: settings.durationDiscountRules.length > 0
      ? settings.durationDiscountRules
      : [{ hours: 4, discountRate: 10 }],
    discountCombinationMode: settings.discountCombinationMode,
    showOriginalPrice: settings.showOriginalPrice,
    discountWarningEnabled: settings.discountWarningEnabled,
  })

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateDiscountSettings({
        durationDiscountEnabled: formData.durationDiscountEnabled,
        durationDiscountRules: formData.durationDiscountRules,
        discountCombinationMode: formData.discountCombinationMode,
        showOriginalPrice: formData.showOriginalPrice,
        discountWarningEnabled: formData.discountWarningEnabled,
      })
      handleResult(result)
    })
  }

  const addRule = () => {
    const maxHours = Math.max(...formData.durationDiscountRules.map((r) => r.hours), 0)
    setFormData({
      ...formData,
      durationDiscountRules: [
        ...formData.durationDiscountRules,
        { hours: maxHours + 2, discountRate: 5 },
      ],
    })
  }

  const removeRule = (index: number) => {
    setFormData({
      ...formData,
      durationDiscountRules: formData.durationDiscountRules.filter((_, i) => i !== index),
    })
  }

  const updateRule = (index: number, field: keyof DurationRule, value: number) => {
    const newRules = [...formData.durationDiscountRules]
    const current = newRules[index]
    if (!current) return
    newRules[index] = { ...current, [field]: value }
    setFormData({ ...formData, durationDiscountRules: newRules })
  }

  return (
    <div className="space-y-6">
      {/* 長時間割引設定 */}
      <Card>
        <CardHeader>
          <CardTitle>長時間割引</CardTitle>
          <CardDescription>
            指定時間以上の予約に自動で割引を適用します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 有効/無効スイッチ */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label>長時間割引を有効にする</Label>
              <p className="text-xs text-muted-foreground">
                無効にすると全ての長時間割引が適用されません
              </p>
            </div>
            <Switch
              checked={formData.durationDiscountEnabled}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, durationDiscountEnabled: checked })
              }
              disabled={isPending}
            />
          </div>

          {/* 割引ルール一覧 */}
          {formData.durationDiscountEnabled && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>割引ルール</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addRule}
                  disabled={isPending}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  ルールを追加
                </Button>
              </div>

              <div className="space-y-3">
                {formData.durationDiscountRules
                  .sort((a, b) => a.hours - b.hours)
                  .map((rule, index) => (
                    <div
                      key={rule.hours}
                      className="flex items-center gap-3 rounded-lg border p-3"
                    >
                      <div className="flex-1 grid gap-3 sm:grid-cols-2">
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={rule.hours}
                            onChange={(e) =>
                              updateRule(index, 'hours', parseInt(e.target.value) || 1)
                            }
                            min={1}
                            max={24}
                            className="w-20"
                            disabled={isPending}
                          />
                          <span className="text-sm text-muted-foreground">時間以上で</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={rule.discountRate}
                            onChange={(e) =>
                              updateRule(index, 'discountRate', parseInt(e.target.value) || 1)
                            }
                            min={1}
                            max={100}
                            className="w-20"
                            disabled={isPending}
                          />
                          <span className="text-sm text-muted-foreground">% OFF</span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeRule(index)}
                        disabled={isPending || formData.durationDiscountRules.length <= 1}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
              </div>

              <p className="text-xs text-muted-foreground">
                複数のルールがある場合、最も長い時間のルールが優先されます
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 割引併用設定 */}
      <Card>
        <CardHeader>
          <CardTitle>割引併用設定</CardTitle>
          <CardDescription>
            長時間割引とクーポン割引の併用方法を設定します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>割引の併用モード</Label>
            <Select
              value={formData.discountCombinationMode}
              onValueChange={(value: DiscountCombinationMode) =>
                setFormData({ ...formData, discountCombinationMode: value })
              }
              disabled={isPending}
            >
              <SelectTrigger className="w-full sm:w-[300px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DiscountCombinationMode.best}>
                  最もお得な割引のみ適用
                </SelectItem>
                <SelectItem value={DiscountCombinationMode.both}>
                  両方の割引を適用
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {formData.discountCombinationMode === DiscountCombinationMode.best
                ? '長時間割引とクーポンのうち、割引額が大きい方のみ適用されます'
                : '長時間割引とクーポンの両方が適用されます（クーポンの併用設定が優先されます）'}
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label>元の価格を表示</Label>
                <p className="text-xs text-muted-foreground">
                  割引適用時に元の価格を取り消し線で表示します
                </p>
              </div>
              <Switch
                checked={formData.showOriginalPrice}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, showOriginalPrice: checked })
                }
                disabled={isPending}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label>割引適用時に警告を表示</Label>
                <p className="text-xs text-muted-foreground">
                  割引が自動適用された際に警告メッセージを表示します
                </p>
              </div>
              <Switch
                checked={formData.discountWarningEnabled}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, discountWarningEnabled: checked })
                }
                disabled={isPending}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 保存ボタン */}
      <Button onClick={handleSave} disabled={isPending}>
        {isPending ? '保存中...' : '割引設定を保存'}
      </Button>
    </div>
  )
}
