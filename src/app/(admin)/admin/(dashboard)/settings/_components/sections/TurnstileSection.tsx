'use client'

/**
 * Cloudflare Turnstile設定セクション
 *
 * Bot対策のためのTurnstile設定
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
  updateTurnstileSettings,
  testTurnstileConnectionAction,
  clearTurnstileKeys,
} from '@/admin/actions/api-keys'
import type { TurnstileConfig } from '@/admin/types/api-keys'
import { StatusBanner } from '../shared'
import { useRefreshOnSuccess } from '../hooks'
import { formatDateTimeShort } from '@/shared/lib/utils'

// =============================================================================
// Types
// =============================================================================

interface TurnstileSectionProps {
  config: TurnstileConfig
}

// =============================================================================
// Main Component
// =============================================================================

export function TurnstileSection({ config }: TurnstileSectionProps) {
  const { handleResult, refresh } = useRefreshOnSuccess()
  const [isPending, startTransition] = useTransition()
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
    note?: string
  } | null>(null)

  const [formData, setFormData] = useState({
    turnstileSiteKey: config.siteKey || '',
    turnstileSecretKey: '',
  })

  const [showSecretKeyInput, setShowSecretKeyInput] = useState(false)

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateTurnstileSettings({
        turnstileSiteKey: formData.turnstileSiteKey || null,
        turnstileSecretKey: formData.turnstileSecretKey || null,
      })
      if (result.success) {
        setFormData((prev) => ({
          ...prev,
          turnstileSecretKey: '',
        }))
        setShowSecretKeyInput(false)
      }
      handleResult(result)
    })
  }

  const handleConnectionTest = async () => {
    if (!formData.turnstileSiteKey || !formData.turnstileSecretKey) {
      setTestResult({
        success: false,
        message: 'Site KeyとSecret Keyの両方を入力してください',
      })
      return
    }

    setIsTesting(true)
    setTestResult(null)

    try {
      const result = await testTurnstileConnectionAction(
        formData.turnstileSiteKey,
        formData.turnstileSecretKey
      )
      if (result.success) {
        setTestResult({
          success: true,
          message: result.data?.message || '検証成功',
          note: result.data?.note,
        })
        refresh()
      } else {
        setTestResult({
          success: false,
          message: result.error || '検証に失敗しました',
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
    if (!confirm('Turnstileキーをクリアしますか？')) return

    startTransition(async () => {
      const result = await clearTurnstileKeys()
      if (result.success) {
        setFormData({ turnstileSiteKey: '', turnstileSecretKey: '' })
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
            className="h-5 w-5 text-orange-500"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
          </svg>
          Cloudflare Turnstile
        </CardTitle>
        <CardDescription>Bot対策・CAPTCHA設定</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Site Key */}
        <div className="space-y-2">
          <Label htmlFor="turnstileSiteKey">Site Key</Label>
          <Input
            id="turnstileSiteKey"
            type="text"
            value={formData.turnstileSiteKey}
            onChange={(e) =>
              setFormData({ ...formData, turnstileSiteKey: e.target.value })
            }
            placeholder="0x..."
            disabled={isPending}
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            公開キー（クライアント側で使用）
          </p>
        </div>

        {/* Secret Key */}
        <div className="space-y-2">
          <Label htmlFor="turnstileSecretKey">Secret Key</Label>
          {config.secretKeyMasked && !showSecretKeyInput ? (
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={config.secretKeyMasked}
                disabled
                className="font-mono"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSecretKeyInput(true)}
              >
                変更
              </Button>
            </div>
          ) : (
            <Input
              id="turnstileSecretKey"
              type="text"
              autoComplete="off"
              data-lpignore="true"
              data-form-type="other"
              className="font-mono [&:not(:placeholder-shown)]:[-webkit-text-security:disc]"
              value={formData.turnstileSecretKey}
              onChange={(e) =>
                setFormData({ ...formData, turnstileSecretKey: e.target.value })
              }
              placeholder="0x..."
              disabled={isPending}
            />
          )}
          <p className="text-xs text-muted-foreground">
            シークレットキー（サーバー側で使用）
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
                    検証済み
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
                最終検証: {formatDateTimeShort(config.lastTestedAt)}
              </p>
            )}
          </StatusBanner>
        )}

        {/* テスト結果 */}
        {testResult && (
          <StatusBanner success={testResult.success}>
            <p
              className={`text-sm ${testResult.success ? 'text-green-700' : 'text-destructive'}`}
            >
              {testResult.message}
            </p>
            {testResult.note && (
              <p className="mt-1 text-xs text-muted-foreground">
                {testResult.note}
              </p>
            )}
          </StatusBanner>
        )}

        {/* アクションボタン */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? '保存中...' : '保存'}
          </Button>
          {formData.turnstileSiteKey && formData.turnstileSecretKey && (
            <Button
              variant="outline"
              onClick={handleConnectionTest}
              disabled={isPending || isTesting}
            >
              {isTesting ? 'テスト中...' : '形式検証'}
            </Button>
          )}
          {(config.siteKey || config.secretKeyMasked) && (
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
