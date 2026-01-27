'use client'

/**
 * Resend設定セクション
 *
 * Resend APIキーの設定と接続テスト
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
} from '@/admin/components/ui'
import {
  updateResendSettings,
  testResendConnectionAction,
  clearResendKeys,
} from '@/admin/actions/api-keys'
import type { ResendConfig } from '@/admin/types/api-keys'
import { StatusBanner } from '../shared'
import { useRefreshOnSuccess } from '../hooks'
import { formatDateTimeShort } from '@/shared/lib/utils'

// =============================================================================
// Types
// =============================================================================

interface ResendSectionProps {
  config: ResendConfig
}

// =============================================================================
// Main Component
// =============================================================================

export function ResendSection({ config }: ResendSectionProps) {
  const { handleResult, refresh } = useRefreshOnSuccess()
  const [isPending, startTransition] = useTransition()
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
  } | null>(null)

  const [formData, setFormData] = useState({
    resendApiKey: '',
  })

  const [showKeyInput, setShowKeyInput] = useState(false)

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateResendSettings({
        resendApiKey: formData.resendApiKey || null,
      })
      if (result.success) {
        setFormData({ resendApiKey: '' })
        setShowKeyInput(false)
      }
      handleResult(result)
    })
  }

  const handleConnectionTest = async () => {
    if (!formData.resendApiKey) {
      setTestResult({
        success: false,
        message: 'APIキーを入力してください',
      })
      return
    }

    setIsTesting(true)
    setTestResult(null)

    try {
      const result = await testResendConnectionAction(formData.resendApiKey)
      if (result.success) {
        setTestResult({
          success: true,
          message: result.data?.message || '接続成功',
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

  const handleClearKeys = () => {
    if (!confirm('Resend APIキーをクリアしますか？')) return

    startTransition(async () => {
      const result = await clearResendKeys()
      if (result.success) {
        setFormData({ resendApiKey: '' })
        setTestResult(null)
      }
      handleResult(result)
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
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
          Resend
        </CardTitle>
        <CardDescription>メール配信サービスのAPI設定</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* API Key */}
        <div className="space-y-2">
          <Label htmlFor="resendApiKey">APIキー</Label>
          {config.apiKeyMasked && !showKeyInput ? (
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={config.apiKeyMasked}
                disabled
                className="font-mono"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowKeyInput(true)}
              >
                変更
              </Button>
            </div>
          ) : (
            <Input
              id="resendApiKey"
              type="text"
              autoComplete="off"
              data-lpignore="true"
              data-form-type="other"
              className="font-mono [&:not(:placeholder-shown)]:[-webkit-text-security:disc]"
              value={formData.resendApiKey}
              onChange={(e) =>
                setFormData({ resendApiKey: e.target.value })
              }
              placeholder="re_..."
              disabled={isPending}
            />
          )}
          <p className="text-xs text-muted-foreground">
            Resendダッシュボードの「API Keys」から取得できます
          </p>
        </div>

        {/* 接続ステータス */}
        {config.connectionStatus && (
          <StatusBanner success={config.connectionStatus === 'connected'}>
            <div className="flex items-center gap-2">
              {config.connectionStatus === 'connected' ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="text-sm font-medium text-green-700">
                    接続済み
                  </span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-destructive" />
                  <span className="text-sm font-medium text-destructive">
                    エラー
                  </span>
                </>
              )}
            </div>
            {config.lastTestedAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                最終テスト: {formatDateTimeShort(config.lastTestedAt)}
              </p>
            )}
          </StatusBanner>
        )}

        {/* 接続テスト結果 */}
        {testResult && (
          <StatusBanner success={testResult.success}>
            <p
              className={`text-sm ${testResult.success ? 'text-green-700' : 'text-destructive'}`}
            >
              {testResult.message}
            </p>
          </StatusBanner>
        )}

        {/* アクションボタン */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? '保存中...' : '保存'}
          </Button>
          {formData.resendApiKey && (
            <Button
              variant="outline"
              onClick={handleConnectionTest}
              disabled={isPending || isTesting}
            >
              {isTesting ? 'テスト中...' : '接続テスト'}
            </Button>
          )}
          {config.apiKeyMasked && (
            <Button
              variant="destructive"
              onClick={handleClearKeys}
              disabled={isPending}
            >
              クリア
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
