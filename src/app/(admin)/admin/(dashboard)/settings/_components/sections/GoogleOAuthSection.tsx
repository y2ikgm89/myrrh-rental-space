'use client'

/**
 * Google OAuth設定セクション
 *
 * Google OAuth Client ID / Client Secret の設定と接続テスト
 * Google ログインと Google カレンダー連携の両方で使用
 */

import { useState, useTransition } from 'react'
import { useConfirm } from '@/admin/contexts/confirm-context'
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
  updateGoogleOAuthSettings,
  testGoogleOAuthConnectionAction,
  clearGoogleOAuthKeys,
} from '@/admin/actions/api-keys'
import type { GoogleOAuthConfig } from '@/admin/types/api-keys'
import { StatusBanner } from '../shared'
import { useRefreshOnSuccess } from '../hooks'
import { formatDateTimeShort } from '@/shared/lib/utils'

// =============================================================================
// Types
// =============================================================================

interface GoogleOAuthSectionProps {
  config: GoogleOAuthConfig
}

// =============================================================================
// Main Component
// =============================================================================

export function GoogleOAuthSection({ config }: GoogleOAuthSectionProps) {
  const confirm = useConfirm()
  const { handleResult, refresh } = useRefreshOnSuccess()
  const [isPending, startTransition] = useTransition()
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
  } | null>(null)

  const [formData, setFormData] = useState({
    googleOAuthClientId: '',
    googleOAuthClientSecret: '',
  })

  const [showSecretInput, setShowSecretInput] = useState(false)

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateGoogleOAuthSettings({
        googleOAuthClientId: formData.googleOAuthClientId || null,
        googleOAuthClientSecret: formData.googleOAuthClientSecret || null,
      })
      if (result.success) {
        setFormData({ googleOAuthClientId: '', googleOAuthClientSecret: '' })
        setShowSecretInput(false)
      }
      handleResult(result)
    })
  }

  const handleConnectionTest = async () => {
    const clientId = formData.googleOAuthClientId || config.clientId
    const clientSecret = formData.googleOAuthClientSecret

    if (!clientId || !clientSecret) {
      setTestResult({
        success: false,
        message: 'Client IDとClient Secretの両方を入力してください',
      })
      return
    }

    setIsTesting(true)
    setTestResult(null)

    try {
      const result = await testGoogleOAuthConnectionAction(
        clientId,
        clientSecret
      )
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

  const handleClearKeys = async () => {
    const confirmed = await confirm({
      title: '設定をクリアしますか？',
      description: 'Google OAuth設定をクリアしますか？環境変数のフォールバックに戻ります。',
      confirmLabel: 'クリア',
      variant: 'destructive',
    })
    if (!confirmed) return

    startTransition(async () => {
      const result = await clearGoogleOAuthKeys()
      if (result.success) {
        setFormData({ googleOAuthClientId: '', googleOAuthClientSecret: '' })
        setTestResult(null)
      }
      handleResult(result)
    })
  }

  const hasExistingConfig = config.clientId || config.clientSecretMasked

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <svg
            className="h-5 w-5 text-primary"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Google OAuth
        </CardTitle>
        <CardDescription>
          Google ログインとカレンダー連携に使用するOAuth認証情報
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Client ID */}
        <div className="space-y-2">
          <Label htmlFor="googleOAuthClientId">Client ID</Label>
          {config.clientId && !formData.googleOAuthClientId ? (
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={config.clientId}
                disabled
                className="font-mono text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setFormData((prev) => ({
                    ...prev,
                    googleOAuthClientId: config.clientId || '',
                  }))
                }
              >
                変更
              </Button>
            </div>
          ) : (
            <Input
              id="googleOAuthClientId"
              type="text"
              autoComplete="off"
              data-lpignore="true"
              data-form-type="other"
              className="font-mono text-sm"
              value={formData.googleOAuthClientId}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  googleOAuthClientId: e.target.value,
                }))
              }
              placeholder="xxxxxxxxxxxx.apps.googleusercontent.com"
              disabled={isPending}
            />
          )}
          <p className="text-xs text-muted-foreground">
            Google Cloud Console &gt; 認証情報 &gt; OAuth 2.0 クライアント ID
          </p>
        </div>

        {/* Client Secret */}
        <div className="space-y-2">
          <Label htmlFor="googleOAuthClientSecret">Client Secret</Label>
          {config.clientSecretMasked && !showSecretInput ? (
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={config.clientSecretMasked}
                disabled
                className="font-mono"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSecretInput(true)}
              >
                変更
              </Button>
            </div>
          ) : (
            <Input
              id="googleOAuthClientSecret"
              type="text"
              autoComplete="off"
              data-lpignore="true"
              data-form-type="other"
              className="font-mono [&:not(:placeholder-shown)]:[-webkit-text-security:disc]"
              value={formData.googleOAuthClientSecret}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  googleOAuthClientSecret: e.target.value,
                }))
              }
              placeholder="GOCSPX-..."
              disabled={isPending}
            />
          )}
          <p className="text-xs text-muted-foreground">
            OAuth クライアントのシークレットキー（暗号化して保存されます）
          </p>
        </div>

        {/* 接続ステータス */}
        {config.connectionStatus && (
          <StatusBanner success={config.connectionStatus === 'connected'}>
            <div className="flex items-center gap-2">
              {config.connectionStatus === 'connected' ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-success" />
                  <span className="text-sm font-medium text-success">
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
              className={`text-sm ${testResult.success ? 'text-success' : 'text-destructive'}`}
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
          {formData.googleOAuthClientSecret && (
            <Button
              variant="outline"
              onClick={handleConnectionTest}
              disabled={isPending || isTesting}
            >
              {isTesting ? 'テスト中...' : '接続テスト'}
            </Button>
          )}
          {hasExistingConfig && (
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
