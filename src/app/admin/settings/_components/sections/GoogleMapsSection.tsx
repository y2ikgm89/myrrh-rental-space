'use client'

/**
 * Google Maps設定セクション
 *
 * Google Maps APIキーの設定と接続テスト
 */

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
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
import {
  updateGoogleMapsSettings,
  testGoogleMapsConnectionAction,
  clearGoogleMapsKeys,
} from '@/actions/admin/api-keys'
import type { GoogleMapsConfig } from '@/types/api-keys'
import { StatusBanner } from '../shared'

// =============================================================================
// Types
// =============================================================================

interface GoogleMapsSectionProps {
  config: GoogleMapsConfig
  onUpdate: () => void
}

// =============================================================================
// Main Component
// =============================================================================

export function GoogleMapsSection({ config, onUpdate }: GoogleMapsSectionProps) {
  const [isPending, startTransition] = useTransition()
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
  } | null>(null)

  const [formData, setFormData] = useState({
    googleMapsApiKey: '',
  })

  const [showKeyInput, setShowKeyInput] = useState(false)

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateGoogleMapsSettings({
        googleMapsApiKey: formData.googleMapsApiKey || null,
      })
      if (!result.success) {
        toast.error(result.error)
      } else {
        setFormData({ googleMapsApiKey: '' })
        setShowKeyInput(false)
        onUpdate()
      }
    })
  }

  const handleConnectionTest = async () => {
    if (!formData.googleMapsApiKey) {
      setTestResult({
        success: false,
        message: 'APIキーを入力してください',
      })
      return
    }

    setIsTesting(true)
    setTestResult(null)

    try {
      const result = await testGoogleMapsConnectionAction(
        formData.googleMapsApiKey
      )
      if (result.success) {
        setTestResult({
          success: true,
          message: result.data?.message || '接続成功',
        })
        onUpdate()
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
    if (!confirm('Google Maps APIキーをクリアしますか？')) return

    startTransition(async () => {
      const result = await clearGoogleMapsKeys()
      if (!result.success) {
        toast.error(result.error)
      } else {
        setFormData({ googleMapsApiKey: '' })
        setTestResult(null)
        onUpdate()
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <svg
            className="h-5 w-5 text-green-600"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
          </svg>
          Google Maps
        </CardTitle>
        <CardDescription>地図表示のためのAPI設定</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* API Key */}
        <div className="space-y-2">
          <Label htmlFor="googleMapsApiKey">APIキー</Label>
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
              id="googleMapsApiKey"
              type="text"
              autoComplete="off"
              data-lpignore="true"
              data-form-type="other"
              className="font-mono [&:not(:placeholder-shown)]:[-webkit-text-security:disc]"
              value={formData.googleMapsApiKey}
              onChange={(e) =>
                setFormData({ googleMapsApiKey: e.target.value })
              }
              placeholder="AIza..."
              disabled={isPending}
            />
          )}
          <p className="text-xs text-muted-foreground">
            Google Cloud ConsoleのAPIとサービスから取得できます
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
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  <span className="text-sm font-medium text-red-700">
                    エラー
                  </span>
                </>
              )}
            </div>
            {config.lastTestedAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                最終テスト:{' '}
                {new Date(config.lastTestedAt).toLocaleString('ja-JP')}
              </p>
            )}
          </StatusBanner>
        )}

        {/* 接続テスト結果 */}
        {testResult && (
          <StatusBanner success={testResult.success}>
            <p
              className={`text-sm ${testResult.success ? 'text-green-700' : 'text-red-700'}`}
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
          {formData.googleMapsApiKey && (
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
