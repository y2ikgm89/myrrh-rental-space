'use client'

/**
 * Google Calendar設定セクション
 *
 * サービスアカウント連携、OAuth連携、iCal/Add to Calendar設定
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
} from '@/components/admin/ui'
import { Switch } from '@/components/admin/ui/switch'
import { Textarea } from '@/components/admin/ui/textarea'
import {
  updateGoogleCalendarSettings,
  testGoogleCalendarConnectionAction,
  clearGoogleCalendarServiceAccount,
  type SettingsData,
} from '@/actions/admin/settings'
import { useRefreshOnSuccess } from '../hooks'

// =============================================================================
// Types
// =============================================================================

interface GoogleCalendarSectionProps {
  settings: SettingsData
}

interface StatusBannerProps {
  success: boolean
  children: React.ReactNode
}

// =============================================================================
// Status Banner Component
// =============================================================================

function StatusBanner({ success, children }: StatusBannerProps): React.ReactElement {
  const borderColor = success ? 'border-green-200' : 'border-red-200'
  const bgColor = success ? 'bg-green-50' : 'bg-red-50'

  return (
    <div className={`rounded-lg border p-4 ${borderColor} ${bgColor}`}>
      {children}
    </div>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export function GoogleCalendarSection({ settings }: GoogleCalendarSectionProps) {
  const { handleResult, refresh } = useRefreshOnSuccess()
  const [isPending, startTransition] = useTransition()
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
    calendarName?: string
  } | null>(null)

  const [formData, setFormData] = useState({
    googleCalendarEnabled: settings.googleCalendarEnabled,
    googleCalendarId: settings.googleCalendarId || '',
    serviceAccountJson: '',
    icalAttachmentEnabled: settings.icalAttachmentEnabled,
    addToCalendarLinksEnabled: settings.addToCalendarLinksEnabled,
  })

  const [showServiceAccountInput, setShowServiceAccountInput] = useState(false)

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateGoogleCalendarSettings({
        googleCalendarEnabled: formData.googleCalendarEnabled,
        googleCalendarId: formData.googleCalendarId || null,
        serviceAccountJson: formData.serviceAccountJson || null,
        icalAttachmentEnabled: formData.icalAttachmentEnabled,
        addToCalendarLinksEnabled: formData.addToCalendarLinksEnabled,
      })
      if (result.success) {
        setFormData((prev) => ({
          ...prev,
          serviceAccountJson: '',
        }))
        setShowServiceAccountInput(false)
      }
      handleResult({ ...result, message: result.success ? 'Google Calendar設定を更新しました' : undefined })
    })
  }

  const handleConnectionTest = async () => {
    if (!formData.serviceAccountJson || !formData.googleCalendarId) {
      setTestResult({
        success: false,
        message: 'サービスアカウントJSONとカレンダーIDを入力してください',
      })
      return
    }

    setIsTesting(true)
    setTestResult(null)

    try {
      const result = await testGoogleCalendarConnectionAction({
        serviceAccountJson: formData.serviceAccountJson,
        calendarId: formData.googleCalendarId,
      })
      if (result.success) {
        setTestResult({
          success: true,
          message: '接続成功',
          calendarName: result.calendarName,
        })
        refresh()
      } else {
        setTestResult({
          success: false,
          message: result.error || '接続に失敗しました',
        })
      }
    } catch {
      setTestResult({
        success: false,
        message: '接続テストでエラーが発生しました',
      })
    } finally {
      setIsTesting(false)
    }
  }

  const handleClearCredentials = () => {
    if (!confirm('サービスアカウント認証情報をクリアしますか？')) return

    startTransition(async () => {
      const result = await clearGoogleCalendarServiceAccount()
      if (result.success) {
        setFormData((prev) => ({
          ...prev,
          serviceAccountJson: '',
        }))
        setTestResult(null)
      }
      handleResult({ ...result, message: result.success ? '認証情報をクリアしました' : undefined })
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          Google Calendar連携
        </CardTitle>
        <CardDescription>
          予約をGoogle Calendarに自動登録し、予約者にカレンダー追加リンクを提供します
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* サービスアカウント連携セクション */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium">サービスアカウント連携（共有カレンダー）</h4>

          {/* 有効/無効 */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="googleCalendarEnabled">Google Calendar同期を有効にする</Label>
              <p className="text-sm text-muted-foreground">
                予約作成時に自動でカレンダーに登録します
              </p>
            </div>
            <Switch
              id="googleCalendarEnabled"
              checked={formData.googleCalendarEnabled}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, googleCalendarEnabled: checked })
              }
              disabled={isPending}
            />
          </div>

          {/* カレンダーID */}
          <div className="space-y-2">
            <Label htmlFor="googleCalendarId">カレンダーID</Label>
            <Input
              id="googleCalendarId"
              type="text"
              value={formData.googleCalendarId}
              onChange={(e) =>
                setFormData({ ...formData, googleCalendarId: e.target.value })
              }
              placeholder="example@group.calendar.google.com"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              Google Calendarの「設定」→「カレンダーの統合」からIDをコピーしてください
            </p>
          </div>

          {/* サービスアカウントJSON */}
          <div className="space-y-2">
            <Label htmlFor="serviceAccountJson">サービスアカウント認証情報（JSON）</Label>
            {settings.googleCalendarServiceAccountEmailMasked && !showServiceAccountInput ? (
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  value={settings.googleCalendarServiceAccountEmailMasked}
                  disabled
                  className="font-mono"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowServiceAccountInput(true)}
                >
                  変更
                </Button>
              </div>
            ) : (
              <Textarea
                id="serviceAccountJson"
                value={formData.serviceAccountJson}
                onChange={(e) =>
                  setFormData({ ...formData, serviceAccountJson: e.target.value })
                }
                placeholder='{"type": "service_account", ...}'
                rows={6}
                className="font-mono text-xs"
                disabled={isPending}
              />
            )}
            <p className="text-xs text-muted-foreground">
              Google Cloud ConsoleでサービスアカウントのJSONキーをダウンロードしてください
            </p>
          </div>

          {/* 接続ステータス */}
          {settings.googleCalendarConnectionStatus && (
            <StatusBanner success={settings.googleCalendarConnectionStatus === 'connected'}>
              <div className="flex items-center gap-2">
                {settings.googleCalendarConnectionStatus === 'connected' ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    <span className="text-sm font-medium text-green-700">接続済み</span>
                  </>
                ) : (
                  <>
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                    <span className="text-sm font-medium text-red-700">エラー</span>
                  </>
                )}
              </div>
              {settings.googleCalendarLastTestedAt && (
                <p className="text-xs text-muted-foreground">
                  最終テスト: {new Date(settings.googleCalendarLastTestedAt).toLocaleString('ja-JP')}
                </p>
              )}
            </StatusBanner>
          )}

          {/* 接続テスト結果 */}
          {testResult && (
            <StatusBanner success={testResult.success}>
              <p className={`text-sm ${testResult.success ? 'text-green-700' : 'text-red-700'}`}>
                {testResult.message}
              </p>
              {testResult.calendarName && (
                <p className="mt-1 text-xs text-muted-foreground">
                  カレンダー名: {testResult.calendarName}
                </p>
              )}
            </StatusBanner>
          )}
        </div>

        {/* 予約者向け設定 */}
        <div className="space-y-4 border-t pt-4">
          <h4 className="text-sm font-medium">予約者向けカレンダー追加</h4>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="icalAttachmentEnabled">iCalファイルをメールに添付</Label>
              <p className="text-sm text-muted-foreground">
                予約確認メールにiCal (.ics) ファイルを添付します
              </p>
            </div>
            <Switch
              id="icalAttachmentEnabled"
              checked={formData.icalAttachmentEnabled}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, icalAttachmentEnabled: checked })
              }
              disabled={isPending}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="addToCalendarLinksEnabled">「カレンダーに追加」リンクを表示</Label>
              <p className="text-sm text-muted-foreground">
                Google Calendar、Outlook、Apple Calendarへの追加リンクを表示します
              </p>
            </div>
            <Switch
              id="addToCalendarLinksEnabled"
              checked={formData.addToCalendarLinksEnabled}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, addToCalendarLinksEnabled: checked })
              }
              disabled={isPending}
            />
          </div>
        </div>

        {/* アクションボタン */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? '保存中...' : '設定を保存'}
          </Button>
          {formData.serviceAccountJson && formData.googleCalendarId && (
            <Button
              variant="outline"
              onClick={handleConnectionTest}
              disabled={isPending || isTesting}
            >
              {isTesting ? 'テスト中...' : '接続テスト'}
            </Button>
          )}
          {settings.googleCalendarServiceAccountEmailMasked && (
            <Button
              variant="destructive"
              onClick={handleClearCredentials}
              disabled={isPending}
            >
              認証情報をクリア
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
