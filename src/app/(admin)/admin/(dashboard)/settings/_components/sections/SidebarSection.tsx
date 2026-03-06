'use client'

/**
 * サイドバー設定セクション
 *
 * サイドバーの有効/無効、ウィジェット設定、表示件数設定
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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
} from '@/admin/components/ui'
import { Switch } from '@/admin/components/ui/switch'
import { updateSidebarSettings } from '@/admin/actions/settings'
import type { SettingsData } from '@/admin/actions/settings'
import { sidebarWidgetsSchema, type SidebarWidgets } from '@/shared/lib/validations/sidebar'

// =============================================================================
// Types
// =============================================================================

interface SidebarSectionProps {
  settings: SettingsData
}

// =============================================================================
// Component
// =============================================================================

export function SidebarSection({ settings }: SidebarSectionProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // デフォルト値の設定
  const defaultWidgets: SidebarWidgets = {
    search: true,
    recent: true,
    popular: true,
    categories: true,
    tags: true,
  }

  // JSONパースの安全な処理（Zodバリデーション）
  const parseWidgets = (widgetsData: unknown): SidebarWidgets => {
    const result = sidebarWidgetsSchema.safeParse(widgetsData)
    return result.success ? result.data : defaultWidgets
  }

  const [formData, setFormData] = useState(() => ({
    sidebarEnabled: settings.sidebarEnabled ?? true,
    sidebarWidgets: parseWidgets(settings.sidebarWidgets),
    sidebarRecentCount: settings.sidebarRecentCount ?? 5,
    sidebarPopularCount: settings.sidebarPopularCount ?? 5,
  }))

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateSidebarSettings({
        sidebarEnabled: formData.sidebarEnabled,
        sidebarWidgets: formData.sidebarWidgets,
        sidebarRecentCount: formData.sidebarRecentCount,
        sidebarPopularCount: formData.sidebarPopularCount,
      })

      if (!result.success) {
        toast.error(result.error)
      } else {
        toast.success('サイドバー設定を保存しました')
        router.refresh()
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>サイドバー設定</CardTitle>
        <CardDescription>
          ブログページのサイドバー表示とウィジェット設定を行います
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* サイドバー全体の有効/無効 */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="sidebarEnabled">サイドバーを表示する</Label>
            <p className="text-sm text-muted-foreground">
              ブログページでサイドバーを表示します
            </p>
          </div>
          <Switch
            id="sidebarEnabled"
            checked={formData.sidebarEnabled}
            onCheckedChange={(checked) =>
              setFormData({ ...formData, sidebarEnabled: checked })
            }
            disabled={isPending}
          />
        </div>

        {/* ウィジェット設定 */}
        {formData.sidebarEnabled && (
          <>
            <div className="space-y-4">
              <h4 className="text-sm font-medium">ウィジェット設定</h4>

              {/* 検索ウィジェット */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="widgetSearch">検索ウィジェット</Label>
                  <p className="text-sm text-muted-foreground">
                    記事検索フォームを表示します
                  </p>
                </div>
                <Switch
                  id="widgetSearch"
                  checked={formData.sidebarWidgets.search}
                  onCheckedChange={(checked) =>
                    setFormData({
                      ...formData,
                      sidebarWidgets: { ...formData.sidebarWidgets, search: checked },
                    })
                  }
                  disabled={isPending}
                />
              </div>

              {/* 新着記事ウィジェット */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="widgetRecent">新着記事ウィジェット</Label>
                  <p className="text-sm text-muted-foreground">
                    最新の記事一覧を表示します
                  </p>
                </div>
                <Switch
                  id="widgetRecent"
                  checked={formData.sidebarWidgets.recent}
                  onCheckedChange={(checked) =>
                    setFormData({
                      ...formData,
                      sidebarWidgets: { ...formData.sidebarWidgets, recent: checked },
                    })
                  }
                  disabled={isPending}
                />
              </div>

              {/* 人気記事ウィジェット */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="widgetPopular">人気記事ウィジェット</Label>
                  <p className="text-sm text-muted-foreground">
                    閲覧数の多い記事一覧を表示します
                  </p>
                </div>
                <Switch
                  id="widgetPopular"
                  checked={formData.sidebarWidgets.popular}
                  onCheckedChange={(checked) =>
                    setFormData({
                      ...formData,
                      sidebarWidgets: { ...formData.sidebarWidgets, popular: checked },
                    })
                  }
                  disabled={isPending}
                />
              </div>

              {/* カテゴリーウィジェット */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="widgetCategories">カテゴリーウィジェット</Label>
                  <p className="text-sm text-muted-foreground">
                    カテゴリー一覧を表示します
                  </p>
                </div>
                <Switch
                  id="widgetCategories"
                  checked={formData.sidebarWidgets.categories}
                  onCheckedChange={(checked) =>
                    setFormData({
                      ...formData,
                      sidebarWidgets: { ...formData.sidebarWidgets, categories: checked },
                    })
                  }
                  disabled={isPending}
                />
              </div>

              {/* タグウィジェット */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="widgetTags">タグウィジェット</Label>
                  <p className="text-sm text-muted-foreground">
                    タグクラウドを表示します
                  </p>
                </div>
                <Switch
                  id="widgetTags"
                  checked={formData.sidebarWidgets.tags}
                  onCheckedChange={(checked) =>
                    setFormData({
                      ...formData,
                      sidebarWidgets: { ...formData.sidebarWidgets, tags: checked },
                    })
                  }
                  disabled={isPending}
                />
              </div>
            </div>

            {/* 表示件数設定 */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium">表示件数設定</h4>

              {/* 新着記事の表示件数 */}
              {formData.sidebarWidgets.recent && (
                <div className="space-y-2">
                  <Label htmlFor="sidebarRecentCount">新着記事の表示件数</Label>
                  <Input
                    id="sidebarRecentCount"
                    type="number"
                    min="1"
                    max="20"
                    value={formData.sidebarRecentCount}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        sidebarRecentCount: parseInt(e.target.value, 10) || 5,
                      })
                    }
                    disabled={isPending}
                  />
                  <p className="text-xs text-muted-foreground">
                    1〜20件の範囲で指定してください
                  </p>
                </div>
              )}

              {/* 人気記事の表示件数 */}
              {formData.sidebarWidgets.popular && (
                <div className="space-y-2">
                  <Label htmlFor="sidebarPopularCount">人気記事の表示件数</Label>
                  <Input
                    id="sidebarPopularCount"
                    type="number"
                    min="1"
                    max="20"
                    value={formData.sidebarPopularCount}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        sidebarPopularCount: parseInt(e.target.value, 10) || 5,
                      })
                    }
                    disabled={isPending}
                  />
                  <p className="text-xs text-muted-foreground">
                    1〜20件の範囲で指定してください
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {/* 保存ボタン */}
        <div className="flex items-center gap-4">
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? '保存中...' : 'サイドバー設定を保存'}
          </Button>
        </div>

        {/* ヒント */}
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <h4 className="font-medium mb-2">ヒント</h4>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
              <li>サイドバーは記事一覧ページと記事詳細ページで表示されます</li>
              <li>モバイル表示では自動的に非表示になります</li>
              <li>各ウィジェットは個別にオン/オフできます</li>
              <li>表示件数は1〜20件の範囲で設定できます</li>
            </ul>
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  )
}
