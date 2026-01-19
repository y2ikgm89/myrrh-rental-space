'use client'

/**
 * SEO設定セクション
 *
 * メタ情報、Analytics設定、検索エンジン検証の3カード構成
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
  Textarea,
} from '@/admin/components/ui'
import { updateSeoSettings } from '@/admin/actions/settings'
import type { SettingsData } from '@/admin/actions/settings'
import { useRefreshOnSuccess } from '../hooks'

interface SeoSectionProps {
  settings: SettingsData
}

type AnalyticsType = 'ga4' | 'gtm' | null

const VALID_ANALYTICS_TYPES = new Set<string>(['ga4', 'gtm'])

function isValidAnalyticsType(value: unknown): value is 'ga4' | 'gtm' {
  return typeof value === 'string' && VALID_ANALYTICS_TYPES.has(value)
}

function parseAnalyticsType(value: unknown): AnalyticsType {
  return isValidAnalyticsType(value) ? value : null
}

export function SeoSection({ settings }: SeoSectionProps) {
  const { handleResult } = useRefreshOnSuccess()
  const [isPending, startTransition] = useTransition()
  const [formData, setFormData] = useState({
    // Meta settings
    defaultMetaDescription: settings.defaultMetaDescription || '',
    defaultMetaKeywords: settings.defaultMetaKeywords || '',
    defaultOgpTitle: settings.defaultOgpTitle || '',
    defaultOgpDescription: settings.defaultOgpDescription || '',
    // Analytics settings
    analyticsType: parseAnalyticsType(settings.analyticsType),
    googleAnalyticsId: settings.googleAnalyticsId || '',
    googleTagManagerId: settings.googleTagManagerId || '',
    gaPropertyId: settings.gaPropertyId || '',
    // Webmaster settings
    googleSearchConsoleId: settings.googleSearchConsoleId || '',
    bingWebmasterToolsId: settings.bingWebmasterToolsId || '',
  })

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateSeoSettings({
        defaultMetaDescription: formData.defaultMetaDescription || null,
        defaultMetaKeywords: formData.defaultMetaKeywords || null,
        defaultOgpTitle: formData.defaultOgpTitle || null,
        defaultOgpDescription: formData.defaultOgpDescription || null,
        analyticsType: formData.analyticsType,
        googleAnalyticsId: formData.googleAnalyticsId || null,
        googleTagManagerId: formData.googleTagManagerId || null,
        gaPropertyId: formData.gaPropertyId || null,
        googleSearchConsoleId: formData.googleSearchConsoleId || null,
        bingWebmasterToolsId: formData.bingWebmasterToolsId || null,
      })
      handleResult(result)
    })
  }

  return (
    <div className="space-y-6">
      {/* Card 1: Meta Information */}
      <Card>
        <CardHeader>
          <CardTitle>メタ情報設定</CardTitle>
          <CardDescription>
            検索エンジンやSNSシェア時に表示される情報を設定します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="defaultMetaDescription">デフォルトメタディスクリプション</Label>
            <Textarea
              id="defaultMetaDescription"
              value={formData.defaultMetaDescription}
              onChange={(e) =>
                setFormData({ ...formData, defaultMetaDescription: e.target.value })
              }
              placeholder="サイトのデフォルト説明文（160文字以内推奨）"
              rows={2}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              現在 {formData.defaultMetaDescription.length} 文字（推奨: 120〜160文字）
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="defaultMetaKeywords">デフォルトメタキーワード</Label>
            <Input
              id="defaultMetaKeywords"
              value={formData.defaultMetaKeywords}
              onChange={(e) => setFormData({ ...formData, defaultMetaKeywords: e.target.value })}
              placeholder="レンタルスペース, 会議室, イベント会場"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">カンマ区切りで入力</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="defaultOgpTitle">OGPタイトル</Label>
              <Input
                id="defaultOgpTitle"
                value={formData.defaultOgpTitle}
                onChange={(e) => setFormData({ ...formData, defaultOgpTitle: e.target.value })}
                placeholder="サイト名 | キャッチコピー"
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="defaultOgpDescription">OGP説明</Label>
              <Input
                id="defaultOgpDescription"
                value={formData.defaultOgpDescription}
                onChange={(e) =>
                  setFormData({ ...formData, defaultOgpDescription: e.target.value })
                }
                placeholder="SNSシェア時の説明文"
                disabled={isPending}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Card 2: Analytics Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Analytics設定</CardTitle>
          <CardDescription>
            Google AnalyticsまたはGoogle Tag Managerを設定します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <Label>トラッキング方式</Label>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="analyticsType"
                  checked={formData.analyticsType === 'ga4'}
                  onChange={() => setFormData({ ...formData, analyticsType: 'ga4' })}
                  disabled={isPending}
                  className="w-4 h-4 text-primary"
                />
                <span>Google Analytics 4 (GA4)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="analyticsType"
                  checked={formData.analyticsType === 'gtm'}
                  onChange={() => setFormData({ ...formData, analyticsType: 'gtm' })}
                  disabled={isPending}
                  className="w-4 h-4 text-primary"
                />
                <span>Google Tag Manager (GTM)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="analyticsType"
                  checked={formData.analyticsType === null}
                  onChange={() => setFormData({ ...formData, analyticsType: null })}
                  disabled={isPending}
                  className="w-4 h-4 text-primary"
                />
                <span>無効</span>
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              GA4とGTMは排他選択です。GTM経由でGA4を使う場合はGTMを選択してください。
            </p>
          </div>

          {formData.analyticsType === 'ga4' && (
            <div className="space-y-2">
              <Label htmlFor="googleAnalyticsId">GA4 Measurement ID</Label>
              <Input
                id="googleAnalyticsId"
                value={formData.googleAnalyticsId}
                onChange={(e) => setFormData({ ...formData, googleAnalyticsId: e.target.value })}
                placeholder="G-XXXXXXXXXX"
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                GA4管理画面 &gt; データストリーム &gt; 測定IDから取得
              </p>
            </div>
          )}

          {formData.analyticsType === 'gtm' && (
            <div className="space-y-2">
              <Label htmlFor="googleTagManagerId">GTM Container ID</Label>
              <Input
                id="googleTagManagerId"
                value={formData.googleTagManagerId}
                onChange={(e) => setFormData({ ...formData, googleTagManagerId: e.target.value })}
                placeholder="GTM-XXXXXXX"
                disabled={isPending}
              />
              <p className="text-xs text-muted-foreground">
                GTM管理画面のコンテナIDから取得
              </p>
            </div>
          )}

          <div className="space-y-2 pt-2 border-t">
            <Label htmlFor="gaPropertyId">GA4 プロパティID（ダッシュボード統計用）</Label>
            <Input
              id="gaPropertyId"
              value={formData.gaPropertyId}
              onChange={(e) => setFormData({ ...formData, gaPropertyId: e.target.value })}
              placeholder="123456789"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              GA4管理画面 &gt; プロパティ設定 &gt; プロパティIDから取得（数値のみ）。
              ダッシュボードでのアクセス解析表示に必要です。
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Card 3: Search Engine Verification */}
      <Card>
        <CardHeader>
          <CardTitle>検索エンジン検証</CardTitle>
          <CardDescription>
            Google Search ConsoleやBing Webmaster Toolsの所有権確認用メタタグを設定します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="googleSearchConsoleId">Google Search Console</Label>
            <Input
              id="googleSearchConsoleId"
              value={formData.googleSearchConsoleId}
              onChange={(e) =>
                setFormData({ ...formData, googleSearchConsoleId: e.target.value })
              }
              placeholder="verification-code-here"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              &lt;meta name=&quot;google-site-verification&quot; content=&quot;...&quot; /&gt;
              のcontent属性値を入力
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bingWebmasterToolsId">Bing Webmaster Tools</Label>
            <Input
              id="bingWebmasterToolsId"
              value={formData.bingWebmasterToolsId}
              onChange={(e) =>
                setFormData({ ...formData, bingWebmasterToolsId: e.target.value })
              }
              placeholder="verification-code-here"
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              &lt;meta name=&quot;msvalidate.01&quot; content=&quot;...&quot; /&gt;
              のcontent属性値を入力
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isPending} size="lg">
          {isPending ? '保存中...' : 'SEO・Analytics設定を保存'}
        </Button>
      </div>
    </div>
  )
}
