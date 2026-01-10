'use client'

/**
 * Stripe設定セクション
 *
 * Stripe APIキーの設定と接続テスト
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/admin/ui/select'
import {
  updateStripeSettings,
  testStripeConnectionAction,
  clearStripeKeys,
} from '@/actions/admin/settings'
import type { SettingsData } from '@/actions/admin/settings'
import { SUPPORTED_CURRENCIES } from '@/lib/stripe'

// =============================================================================
// Types
// =============================================================================

interface StripeSectionProps {
  settings: SettingsData
  onUpdate: () => void
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

export function StripeSection({ settings, onUpdate }: StripeSectionProps) {
  const [isPending, startTransition] = useTransition()
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
    mode?: 'test' | 'live'
  } | null>(null)

  const [formData, setFormData] = useState({
    stripeEnabled: settings.stripeEnabled,
    stripeTestMode: settings.stripeTestMode,
    stripePublishableKey: settings.stripePublishableKey || '',
    stripeSecretKey: '', // 常に空から開始（セキュリティ）
    stripeWebhookSecret: '', // 常に空から開始（セキュリティ）
    stripeCurrency: settings.stripeCurrency as 'jpy' | 'usd' | 'eur',
  })

  const [showSecretKeyInput, setShowSecretKeyInput] = useState(false)
  const [showWebhookSecretInput, setShowWebhookSecretInput] = useState(false)

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateStripeSettings({
        stripeEnabled: formData.stripeEnabled,
        stripeTestMode: formData.stripeTestMode,
        stripePublishableKey: formData.stripePublishableKey || null,
        stripeSecretKey: formData.stripeSecretKey || null,
        stripeWebhookSecret: formData.stripeWebhookSecret || null,
        stripeCurrency: formData.stripeCurrency,
      })
      if (!result.success) {
        alert(result.error)
      } else {
        // 入力フィールドをリセット
        setFormData((prev) => ({
          ...prev,
          stripeSecretKey: '',
          stripeWebhookSecret: '',
        }))
        setShowSecretKeyInput(false)
        setShowWebhookSecretInput(false)
        onUpdate()
      }
    })
  }

  const handleConnectionTest = async () => {
    if (!formData.stripeSecretKey) {
      setTestResult({
        success: false,
        message: 'シークレットキーを入力してください',
      })
      return
    }

    setIsTesting(true)
    setTestResult(null)

    try {
      const result = await testStripeConnectionAction(formData.stripeSecretKey)
      if (result.success) {
        setTestResult({
          success: true,
          message: `接続成功 (アカウントID: ${result.accountId})`,
          mode: result.mode,
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
    if (!confirm('Stripeの全てのキーをクリアしますか？')) return

    startTransition(async () => {
      const result = await clearStripeKeys()
      if (!result.success) {
        alert(result.error)
      } else {
        setFormData((prev) => ({
          ...prev,
          stripePublishableKey: '',
          stripeSecretKey: '',
          stripeWebhookSecret: '',
        }))
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
            className="h-5 w-5 text-[#635BFF]"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z" />
          </svg>
          Stripe設定
        </CardTitle>
        <CardDescription>
          オンライン決済のためのStripe設定を行います
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 有効/無効 */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="stripeEnabled">Stripe決済を有効にする</Label>
            <p className="text-sm text-muted-foreground">
              予約時にオンライン決済を受け付けます
            </p>
          </div>
          <Switch
            id="stripeEnabled"
            checked={formData.stripeEnabled}
            onCheckedChange={(checked) =>
              setFormData({ ...formData, stripeEnabled: checked })
            }
            disabled={isPending}
          />
        </div>

        {/* テストモード */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="stripeTestMode">テストモード</Label>
            <p className="text-sm text-muted-foreground">
              {formData.stripeTestMode
                ? 'テストキーを使用します（実際の決済は行われません）'
                : '本番キーを使用します（実際の決済が行われます）'}
            </p>
          </div>
          <Switch
            id="stripeTestMode"
            checked={formData.stripeTestMode}
            onCheckedChange={(checked) =>
              setFormData({ ...formData, stripeTestMode: checked })
            }
            disabled={isPending}
          />
        </div>

        {/* APIキー */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium">APIキー</h4>

          {/* 公開可能キー */}
          <div className="space-y-2">
            <Label htmlFor="stripePublishableKey">公開可能キー</Label>
            <Input
              id="stripePublishableKey"
              type="text"
              value={formData.stripePublishableKey}
              onChange={(e) =>
                setFormData({ ...formData, stripePublishableKey: e.target.value })
              }
              placeholder={
                formData.stripeTestMode ? 'pk_test_...' : 'pk_live_...'
              }
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              Stripeダッシュボードの「開発者」&gt;「APIキー」から取得できます
            </p>
          </div>

          {/* シークレットキー */}
          <div className="space-y-2">
            <Label htmlFor="stripeSecretKey">シークレットキー</Label>
            {settings.stripeSecretKeyMasked && !showSecretKeyInput ? (
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  value={settings.stripeSecretKeyMasked}
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
                id="stripeSecretKey"
                type="text"
                autoComplete="off"
                data-lpignore="true"
                data-form-type="other"
                className="font-mono [&:not(:placeholder-shown)]:[-webkit-text-security:disc]"
                value={formData.stripeSecretKey}
                onChange={(e) =>
                  setFormData({ ...formData, stripeSecretKey: e.target.value })
                }
                placeholder={
                  formData.stripeTestMode ? 'sk_test_...' : 'sk_live_...'
                }
                disabled={isPending}
              />
            )}
            <p className="text-xs text-muted-foreground">
              シークレットキーは暗号化して保存されます
            </p>
          </div>

          {/* Webhookシークレット */}
          <div className="space-y-2">
            <Label htmlFor="stripeWebhookSecret">Webhookシークレット（任意）</Label>
            {settings.stripeWebhookSecretMasked && !showWebhookSecretInput ? (
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  value={settings.stripeWebhookSecretMasked}
                  disabled
                  className="font-mono"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowWebhookSecretInput(true)}
                >
                  変更
                </Button>
              </div>
            ) : (
              <Input
                id="stripeWebhookSecret"
                type="text"
                autoComplete="off"
                data-lpignore="true"
                data-form-type="other"
                className="font-mono [&:not(:placeholder-shown)]:[-webkit-text-security:disc]"
                value={formData.stripeWebhookSecret}
                onChange={(e) =>
                  setFormData({ ...formData, stripeWebhookSecret: e.target.value })
                }
                placeholder="whsec_..."
                disabled={isPending}
              />
            )}
            <p className="text-xs text-muted-foreground">
              Webhook署名の検証に使用します（将来の機能用）
            </p>
          </div>
        </div>

        {/* 通貨設定 */}
        <div className="space-y-2">
          <Label htmlFor="stripeCurrency">通貨</Label>
          <Select
            value={formData.stripeCurrency}
            onValueChange={(value: 'jpy' | 'usd' | 'eur') =>
              setFormData({ ...formData, stripeCurrency: value })
            }
            disabled={isPending}
          >
            <SelectTrigger id="stripeCurrency" className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_CURRENCIES.map((currency) => (
                <SelectItem key={currency.value} value={currency.value}>
                  {currency.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 接続ステータス */}
        {settings.stripeConnectionStatus && (
          <StatusBanner success={settings.stripeConnectionStatus === 'connected'}>
            <div className="flex items-center gap-2">
              {settings.stripeConnectionStatus === 'connected' ? (
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
            {settings.stripeAccountId && (
              <p className="mt-1 text-xs text-muted-foreground">
                アカウントID: {settings.stripeAccountId}
              </p>
            )}
            {settings.stripeLastTestedAt && (
              <p className="text-xs text-muted-foreground">
                最終テスト: {new Date(settings.stripeLastTestedAt).toLocaleString('ja-JP')}
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
            {testResult.mode && (
              <p className="mt-1 text-xs text-muted-foreground">
                モード: {testResult.mode === 'test' ? 'テスト' : '本番'}
              </p>
            )}
          </StatusBanner>
        )}

        {/* アクションボタン */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? '保存中...' : 'Stripe設定を保存'}
          </Button>
          {formData.stripeSecretKey && (
            <Button
              variant="outline"
              onClick={handleConnectionTest}
              disabled={isPending || isTesting}
            >
              {isTesting ? 'テスト中...' : '接続テスト'}
            </Button>
          )}
          {(settings.stripeSecretKeyMasked || settings.stripePublishableKey) && (
            <Button
              variant="destructive"
              onClick={handleClearKeys}
              disabled={isPending}
            >
              キーをクリア
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
