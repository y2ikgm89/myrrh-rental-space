/**
 * Analytics Card Component
 *
 * ダッシュボードに表示するGA4統計カード
 * Server Componentとして動作
 */

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/admin/ui/card'
import { getAnalyticsStats, isAnalyticsApiAvailable } from '@/lib/analytics/ga-data-api'
import { getAnalyticsConfig } from '@/lib/analytics/config'
import Link from 'next/link'

/**
 * 平均セッション時間をフォーマット
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}秒`
  }
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.round(seconds % 60)
  return `${minutes}分${remainingSeconds}秒`
}

export async function AnalyticsCard() {
  // APIが利用可能かチェック
  if (!isAnalyticsApiAvailable()) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>アクセス解析</CardTitle>
          <CardDescription>Google Analytics Data API</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            GA Data APIのクレデンシャルが設定されていません。
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            環境変数 <code className="bg-muted px-1 rounded">GOOGLE_APPLICATION_CREDENTIALS_JSON</code> を設定してください。
          </p>
        </CardContent>
      </Card>
    )
  }

  // 設定からGA4プロパティIDを取得
  const config = await getAnalyticsConfig()

  if (!config.gaPropertyId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>アクセス解析</CardTitle>
          <CardDescription>Google Analytics Data API</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            GA4プロパティIDが設定されていません。
          </p>
          <Link
            href="/admin/settings?tab=seo"
            className="text-sm text-primary hover:underline mt-2 inline-block"
          >
            設定画面でGA4プロパティIDを設定する
          </Link>
        </CardContent>
      </Card>
    )
  }

  // GA Data APIから統計を取得
  const result = await getAnalyticsStats(config.gaPropertyId)

  if (!result.success) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>アクセス解析</CardTitle>
          <CardDescription>Google Analytics Data API</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{result.error.message}</p>
          {result.error.code === 'API_ERROR' && (
            <p className="text-xs text-muted-foreground mt-2">
              サービスアカウントにGA4プロパティへのアクセス権があることを確認してください。
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  const stats = result.data

  return (
    <Card>
      <CardHeader>
        <CardTitle>アクセス解析（過去30日）</CardTitle>
        <CardDescription>Google Analytics Data API</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 基本統計 */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-sm text-muted-foreground">PV数</p>
            <p className="text-2xl font-bold">{stats.pageViews.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">ユーザー数</p>
            <p className="text-2xl font-bold">{stats.users.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">セッション数</p>
            <p className="text-2xl font-bold">{stats.sessions.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">平均滞在時間</p>
            <p className="text-2xl font-bold">{formatDuration(stats.averageSessionDuration)}</p>
          </div>
        </div>

        {/* 人気ページ */}
        {stats.topPages.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">人気ページ Top 5</p>
            <ul className="space-y-1">
              {stats.topPages.map((page, i) => (
                <li key={i} className="flex justify-between text-sm">
                  <span className="truncate flex-1 mr-2" title={page.title || page.path}>
                    {page.title || page.path}
                  </span>
                  <span className="text-muted-foreground">{page.views.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
