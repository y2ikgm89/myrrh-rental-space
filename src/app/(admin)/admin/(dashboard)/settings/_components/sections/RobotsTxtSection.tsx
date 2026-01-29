'use client'

import { useState, useTransition, useEffect } from 'react'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
  Switch,
  Textarea,
} from '@/admin/components/ui'
import {
  getRobotsTxtSettings,
  updateRobotsTxtSettings,
  resetRobotsTxtToDefault,
  type RobotsTxtData,
} from '@/admin/actions/settings'
import { checkRobotsTxtWarnings } from '@/admin/actions/settings/schemas'
import { useRefreshOnSuccess } from '../hooks'
import { AlertTriangle, RotateCcw, Info } from 'lucide-react'

export function RobotsTxtSection() {
  const { handleResult } = useRefreshOnSuccess()
  const [isPending, startTransition] = useTransition()
  const [isLoading, setIsLoading] = useState(true)
  const [data, setData] = useState<RobotsTxtData | null>(null)
  const [formData, setFormData] = useState({ robotsTxtEnabled: false, robotsTxtCustom: '' })
  const [warnings, setWarnings] = useState<string[]>([])

  useEffect(() => {
    getRobotsTxtSettings().then((result) => {
      if (result) {
        setData(result)
        setFormData({
          robotsTxtEnabled: result.robotsTxtEnabled,
          robotsTxtCustom: result.robotsTxtCustom ?? result.defaultRobotsTxt,
        })
        setWarnings(result.warnings)
      }
      setIsLoading(false)
    })
  }, [])

  function handleTextChange(text: string) {
    setFormData({ ...formData, robotsTxtCustom: text })
    setWarnings(checkRobotsTxtWarnings(text))
  }

  function handleSave() {
    startTransition(async () => {
      const result = await updateRobotsTxtSettings({
        robotsTxtEnabled: formData.robotsTxtEnabled,
        robotsTxtCustom: formData.robotsTxtEnabled ? formData.robotsTxtCustom : null,
      })
      handleResult(result)
      if (result.success && result.data) {
        setWarnings(result.data.warnings)
      }
    })
  }

  function handleReset() {
    if (!data) return
    if (!confirm('robots.txtをデフォルトに戻しますか？カスタム設定は削除されます。')) return

    startTransition(async () => {
      const result = await resetRobotsTxtToDefault()
      handleResult(result)
      if (result.success) {
        setFormData({ robotsTxtEnabled: false, robotsTxtCustom: data.defaultRobotsTxt })
        setWarnings([])
      }
    })
  }

  function handleToggle(checked: boolean) {
    if (checked && !formData.robotsTxtCustom && data) {
      setFormData({ robotsTxtEnabled: checked, robotsTxtCustom: data.defaultRobotsTxt })
    } else {
      setFormData({ ...formData, robotsTxtEnabled: checked })
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>robots.txt設定</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-muted rounded" />
            <div className="h-40 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>robots.txt設定</CardTitle>
        <CardDescription>検索エンジンのクローラーに対する指示を設定します</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className={`flex items-center justify-between rounded-lg border p-4 ${
            formData.robotsTxtEnabled ? 'border-primary bg-primary/5' : ''
          }`}
        >
          <div className="space-y-0.5">
            <Label htmlFor="robotsTxtEnabled" className="font-medium">
              カスタムrobots.txtを使用
            </Label>
            <p className="text-xs text-muted-foreground">
              無効の場合、デフォルトのrobots.txtが使用されます
            </p>
          </div>
          <Switch
            id="robotsTxtEnabled"
            checked={formData.robotsTxtEnabled}
            onCheckedChange={handleToggle}
            disabled={isPending}
          />
        </div>

        {formData.robotsTxtEnabled && warnings.length > 0 && (
          <div className="rounded-lg border border-amber-500/50 bg-amber-50 p-4 dark:bg-amber-950/20">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">設定に関する警告</p>
                <ul className="text-xs text-amber-700 dark:text-amber-300 list-disc list-inside space-y-1">
                  {warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="robotsTxtCustom">
              {formData.robotsTxtEnabled ? 'robots.txt内容' : 'デフォルトrobots.txt（参照用）'}
            </Label>
            {formData.robotsTxtEnabled && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleReset}
                disabled={isPending}
                className="h-7 text-xs"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                デフォルトに戻す
              </Button>
            )}
          </div>
          <Textarea
            id="robotsTxtCustom"
            value={formData.robotsTxtCustom}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder={data?.defaultRobotsTxt}
            rows={16}
            disabled={isPending || !formData.robotsTxtEnabled}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            {formData.robotsTxtCustom.length} 文字（最大 10,000 文字）
          </p>
        </div>

        <div className="rounded-lg border bg-muted/50 p-4">
          <div className="flex items-start gap-2">
            <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium">robots.txtについて</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li><code className="bg-muted px-1 rounded">User-agent: *</code> - すべてのクローラーに適用</li>
                <li><code className="bg-muted px-1 rounded">Disallow: /path/</code> - 指定パスのクロールを禁止</li>
                <li><code className="bg-muted px-1 rounded">Allow: /path/</code> - 指定パスのクロールを許可</li>
                <li><code className="bg-muted px-1 rounded">Sitemap:</code> - サイトマップのURLを指定</li>
              </ul>
            </div>
          </div>
        </div>

        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? '保存中...' : 'robots.txt設定を保存'}
        </Button>
      </CardContent>
    </Card>
  )
}
