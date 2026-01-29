'use client'

/**
 * レイアウト設定セクション
 *
 * サイト全体の幅と記事コンテンツ幅を設定
 * リアルタイムプレビュー付き
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/admin/components/ui'
import { updateLayoutSettings } from '@/admin/actions/settings'
import type { SettingsData } from '@/admin/actions/settings'
import {
  LayoutWidth,
  isValidLayoutWidth,
  getValidLayoutWidth,
} from '@/shared/lib/validations/enums'
import { getContentStyles } from '@/shared/lib/styles/layout-mapper'
import { LazyLexicalEditor } from '@/admin/components/editor/lexical'
import { EDITOR_PROSE_CLASSES } from '@/shared/lib/styles/prose'
import { LayoutWidth as LayoutWidthEnum } from '@/shared/types/prisma'

// =============================================================================
// Types
// =============================================================================

interface LayoutSectionProps {
  settings: SettingsData
}

// =============================================================================
// Constants
// =============================================================================

const SITE_WIDTH_OPTIONS: Array<{
  value: LayoutWidth
  label: string
  description: string
}> = [
  { value: 'SM', label: '小 (1000px)', description: 'コンパクト' },
  { value: 'MD', label: '中 (1100px)', description: 'スタンダード' },
  { value: 'LG', label: '大 (1200px)', description: 'ワイド' },
  { value: 'XL', label: '特大 (1400px)', description: 'エクストラワイド' },
  { value: 'FULL', label: '全幅', description: '画面幅いっぱい' },
  { value: 'CUSTOM', label: 'カスタム', description: '任意の幅を指定' },
]

const CONTENT_WIDTH_OPTIONS: Array<{
  value: LayoutWidth
  label: string
  description: string
}> = [
  { value: 'XS', label: '極小 (640px)', description: '長文テキスト向け' },
  { value: 'SM', label: '小 (720px)', description: 'コンパクト' },
  { value: 'MD', label: '中 (800px)', description: 'スタンダード' },
  { value: 'LG', label: '大 (900px)', description: 'ワイド' },
  { value: 'XL', label: '特大 (1024px)', description: '画像・ギャラリー向け' },
  { value: 'CUSTOM', label: 'カスタム', description: '任意の幅を指定' },
]

// =============================================================================
// Component
// =============================================================================

export function LayoutSection({ settings }: LayoutSectionProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [containerWidth, setContainerWidth] = useState<LayoutWidth>(
    getValidLayoutWidth(settings.containerWidth, 'LG')
  )
  const [containerWidthCustom, setContainerWidthCustom] = useState<string>(
    settings.containerWidthCustom?.toString() || ''
  )
  const [contentWidth, setContentWidth] = useState<LayoutWidth>(
    getValidLayoutWidth(settings.contentWidth, 'MD')
  )
  const [contentWidthCustom, setContentWidthCustom] = useState<string>(
    settings.contentWidthCustom?.toString() || ''
  )

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateLayoutSettings({
        containerWidth,
        containerWidthCustom: containerWidth === 'CUSTOM'
          ? parseInt(containerWidthCustom, 10) || null
          : null,
        contentWidth,
        contentWidthCustom: contentWidth === 'CUSTOM'
          ? parseInt(contentWidthCustom, 10) || null
          : null,
      })

      if (!result.success) {
        toast.error(result.error)
      } else {
        toast.success('レイアウト設定を保存しました')
        router.refresh()
      }
    })
  }

  const handlePreview = () => {
    window.open('/posts', '_blank')
  }

  // リアルタイムプレビュー用スタイル計算（React Compilerが自動メモ化）
  const parsedCustomWidth = contentWidthCustom
    ? parseInt(contentWidthCustom, 10)
    : null
  const validCustomWidth =
    parsedCustomWidth !== null && !Number.isNaN(parsedCustomWidth)
      ? parsedCustomWidth
      : null

  const previewStyles = getContentStyles({
    containerWidth: LayoutWidthEnum.LG,
    containerWidthCustom: null,
    contentWidth: contentWidth as LayoutWidthEnum,
    contentWidthCustom: validCustomWidth,
  })

  // サンプルコンテンツ（HTMLを直接生成）
  const sampleContent = `<p>これはコンテンツ幅のプレビューです。設定を変更すると、このエディタの幅がリアルタイムで変わります。</p><p>実際のブログ記事やお知らせは、ここに表示されるのと同じ幅で公開ページに表示されます。</p>`

  return (
    <Card>
      <CardHeader>
        <CardTitle>レイアウト設定</CardTitle>
        <CardDescription>
          サイト全体の幅と記事コンテンツの表示幅を設定します
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 幅設定 */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* サイト全体の幅 */}
          <div className="space-y-4 rounded-lg border p-4">
            <div className="space-y-1">
              <h4 className="text-sm font-medium">サイト全体の幅</h4>
              <p className="text-xs text-muted-foreground">
                ヘッダー、フッター、コンテンツ領域全体の最大幅
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="containerWidth">サイト幅</Label>
              <Select
                value={containerWidth}
                onValueChange={(value) => {
                  if (isValidLayoutWidth(value)) setContainerWidth(value)
                }}
                disabled={isPending}
              >
                <SelectTrigger id="containerWidth">
                  <SelectValue placeholder="幅を選択" />
                </SelectTrigger>
                <SelectContent>
                  {SITE_WIDTH_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex flex-col">
                        <span>{option.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {containerWidth === 'CUSTOM' && (
              <div className="space-y-2">
                <Label htmlFor="containerWidthCustom">カスタム幅 (px)</Label>
                <Input
                  id="containerWidthCustom"
                  type="number"
                  min="320"
                  max="2560"
                  value={containerWidthCustom}
                  onChange={(e) => setContainerWidthCustom(e.target.value)}
                  placeholder="例: 1400"
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">
                  320px〜2560pxの範囲で入力
                </p>
              </div>
            )}
          </div>

          {/* 記事コンテンツの幅 */}
          <div className="space-y-4 rounded-lg border p-4">
            <div className="space-y-1">
              <h4 className="text-sm font-medium">記事コンテンツの幅</h4>
              <p className="text-xs text-muted-foreground">
                ブログ記事、お知らせ、静的ページの表示幅
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contentWidth">コンテンツ幅</Label>
              <Select
                value={contentWidth}
                onValueChange={(value) => {
                  if (isValidLayoutWidth(value)) setContentWidth(value)
                }}
                disabled={isPending}
              >
                <SelectTrigger id="contentWidth">
                  <SelectValue placeholder="幅を選択" />
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_WIDTH_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex flex-col">
                        <span>{option.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {contentWidth === 'CUSTOM' && (
              <div className="space-y-2">
                <Label htmlFor="contentWidthCustom">カスタム幅 (px)</Label>
                <Input
                  id="contentWidthCustom"
                  type="number"
                  min="320"
                  max="1920"
                  value={contentWidthCustom}
                  onChange={(e) => setContentWidthCustom(e.target.value)}
                  placeholder="例: 900"
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">
                  320px〜1920pxの範囲で入力
                </p>
              </div>
            )}
          </div>
        </div>

        {/* コンテンツ幅プレビュー */}
        <div className="space-y-3">
          <div className="space-y-1">
            <h4 className="text-sm font-medium">コンテンツ幅プレビュー</h4>
            <p className="text-xs text-muted-foreground">
              設定した幅でエディタがどのように表示されるか確認できます
            </p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-4 overflow-x-auto">
            <LazyLexicalEditor
              content={sampleContent}
              disabled
              className={EDITOR_PROSE_CLASSES}
              showToolbar={false}
              height="120px"
              contentWidthClassName={previewStyles.className}
              contentWidthStyle={previewStyles.style}
            />
          </div>
        </div>

        {/* アクションボタン */}
        <div className="flex items-center gap-4">
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? '保存中...' : '保存'}
          </Button>
          <Button variant="outline" onClick={handlePreview} disabled={isPending}>
            プレビュー
          </Button>
        </div>

        {/* ヒント */}
        <div className="rounded-lg bg-muted/50 p-4">
          <h4 className="font-medium mb-2">ヒント</h4>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
            <li>設定を保存すると、サイト全体に即時反映されます</li>
            <li>個別の記事やページで幅を上書きすることもできます</li>
            <li>長文の記事は狭めの幅（720〜800px程度）が読みやすいです</li>
            <li>画像ギャラリーなどは広めの幅が適しています</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
