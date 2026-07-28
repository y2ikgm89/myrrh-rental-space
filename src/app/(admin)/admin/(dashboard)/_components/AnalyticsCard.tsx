/**
 * Analytics Card Component
 *
 * ダッシュボードに表示するGA4統計カード
 * Server Componentとして動作
 */

import { connection } from "next/server";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/admin/components/ui/card";
import {
  getAnalyticsStats,
  isAnalyticsApiAvailable,
} from "@/shared/lib/analytics/ga-data-api";
import { getAnalyticsConfig } from "@/shared/domain/settings/queries/analytics";
import { DashboardSectionError } from "./DashboardSectionError";
import { settleDashboardLoad } from "./settle-dashboard-load";

/**
 * 平均セッション時間をフォーマット
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}秒`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}分${remainingSeconds}秒`;
}

type AnalyticsView =
  | { kind: "credentials-missing" }
  | { kind: "property-missing" }
  | { kind: "api-error"; message: string; code: string }
  | {
      kind: "stats";
      pageViews: number;
      users: number;
      sessions: number;
      averageSessionDuration: number;
      topPages: ReadonlyArray<{
        path: string;
        title: string | null;
        views: number;
      }>;
    };

export async function AnalyticsCard() {
  await connection();

  const result = await settleDashboardLoad(async (): Promise<AnalyticsView> => {
    if (!isAnalyticsApiAvailable()) {
      return { kind: "credentials-missing" };
    }

    const config = await getAnalyticsConfig();

    if (!config.gaPropertyId) {
      return { kind: "property-missing" };
    }

    const statsResult = await getAnalyticsStats(config.gaPropertyId);

    if (!statsResult.success) {
      return {
        kind: "api-error",
        message: statsResult.error.message,
        code: statsResult.error.code,
      };
    }

    return {
      kind: "stats",
      pageViews: statsResult.data.pageViews,
      users: statsResult.data.users,
      sessions: statsResult.data.sessions,
      averageSessionDuration: statsResult.data.averageSessionDuration,
      topPages: statsResult.data.topPages,
    };
  });

  if (!result.ok) {
    return <DashboardSectionError title="アクセス解析" />;
  }

  const view = result.value;

  switch (view.kind) {
    case "credentials-missing":
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
              環境変数{" "}
              <code className="bg-muted px-1 rounded">
                GOOGLE_APPLICATION_CREDENTIALS_JSON
              </code>{" "}
              を設定してください。
            </p>
          </CardContent>
        </Card>
      );
    case "property-missing":
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
              href="/admin/settings/site?tab=seo"
              className="text-sm text-primary hover:underline mt-2 inline-block"
            >
              設定画面でGA4プロパティIDを設定する
            </Link>
          </CardContent>
        </Card>
      );
    case "api-error":
      return (
        <Card>
          <CardHeader>
            <CardTitle>アクセス解析</CardTitle>
            <CardDescription>Google Analytics Data API</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-destructive">{view.message}</p>
            {view.code === "API_ERROR" && (
              <p className="text-xs text-muted-foreground mt-2">
                サービスアカウントにGA4プロパティへのアクセス権があることを確認してください。
              </p>
            )}
          </CardContent>
        </Card>
      );
    case "stats":
      return (
        <Card>
          <CardHeader>
            <CardTitle>アクセス解析（過去30日）</CardTitle>
            <CardDescription>Google Analytics Data API</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 @md/main:grid-cols-4">
              <div>
                <p className="text-sm text-muted-foreground">PV数</p>
                <p className="text-2xl font-bold">
                  {view.pageViews.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">ユーザー数</p>
                <p className="text-2xl font-bold">
                  {view.users.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">セッション数</p>
                <p className="text-2xl font-bold">
                  {view.sessions.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">平均滞在時間</p>
                <p className="text-2xl font-bold">
                  {formatDuration(view.averageSessionDuration)}
                </p>
              </div>
            </div>

            {view.topPages.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">人気ページ Top 5</p>
                <ul className="space-y-1">
                  {view.topPages.map((page) => (
                    <li
                      key={page.path}
                      className="flex justify-between text-sm"
                    >
                      <span
                        className="truncate flex-1 mr-2"
                        title={page.title || page.path}
                      >
                        {page.title || page.path}
                      </span>
                      <span className="text-muted-foreground">
                        {page.views.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      );
    default: {
      const _exhaustive: never = view;
      return _exhaustive;
    }
  }
}
