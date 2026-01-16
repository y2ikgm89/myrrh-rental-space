'use client'

/**
 * レイアウト設定タブ
 *
 * サイト全体のContainer幅と記事コンテンツの幅を設定
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
} from '@/components/admin/ui'
import { updateLayoutSettings } from '@/actions/admin/settings'
import type { SettingsData } from '@/actions/admin/settings'
import {
  LayoutWidth,
  isValidLayoutWidth,
  getValidLayoutWidth,
} from '@/lib/validations/enums'

// =============================================================================
// Types
// =============================================================================

interface LayoutTabProps {
  settings: SettingsData
}

// =============================================================================
// Constants
// =============================================================================

const CONTAINER_WIDTH_OPTIONS: Array<{
  value: LayoutWidth
  label: string
  description: string
}> = [
  { value: 'SM', label: '小 (768px)', description: 'コンパクトなレイアウト' },
  { value: 'MD', label: '中 (1024px)', description: 'バランスの良い幅' },
  { value: 'LG', label: '大 (1280px)', description: '標準的なサイト幅（推奨）' },
  { value: 'XL', label: '特大 (1536px)', description: 'ワイドスクリーン向け' },
  { value: 'FULL', label: '全幅', description: '画面幅いっぱい' },
  { value: 'CUSTOM', label: 'カスタム', description: '任意の幅を指定' },
]

const CONTENT_WIDTH_OPTIONS: Array<{
  value: LayoutWidth
  label: string
  description: string
}> = [
  { value: 'XS', label: '極小 (640px)', description: '狭いコンテンツ向け' },
  { value: 'SM', label: '小 (768px)', description: '記事コンテンツ推奨' },
  { value: 'MD', label: '中 (1024px)', description: 'バランスの良い幅' },
  { value: 'LG', label: '大 (1280px)', description: '広めのコンテンツ' },
  { value: 'CUSTOM', label: 'カスタム', description: '任意の幅を指定' },
]

// =============================================================================
// Component
// =============================================================================

export function LayoutTab({ settings }: LayoutTabProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [containerWidth, setContainerWidth] = useState<LayoutWidth>(
    getValidLayoutWidth(settings.containerWidth, 'LG')
  )
  const [containerWidthCustom, setContainerWidthCustom] = useState<string>(
    settings.containerWidthCustom?.toString() || ''
  )
  const [contentWidth, setContentWidth] = useState<LayoutWidth>(
    getValidLayoutWidth(settings.contentWidth, 'SM')
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
    window.open('/blog', '_blank')
  }

  return (
    <div className="space-y-6">
      {/* Container幅設定 */}
      <Card>
        <CardHeader>
          <CardTitle>サイト全体の幅</CardTitle>
          <CardDescription>
            ヘッダー、フッター、コンテンツ領域全体の最大幅を設定します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="containerWidth">Container幅</Label>
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
                {CONTAINER_WIDTH_OPTIONS.map((option) => (
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
                320px〜2560pxの範囲で入力してください
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* コンテンツ幅設定 */}
      <Card>
        <CardHeader>
          <CardTitle>記事コンテンツの幅</CardTitle>
          <CardDescription>
            ブログ記事、お知らせ、静的ページのコンテンツ表示幅を設定します。
            読みやすさのため、768px程度が推奨です。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
                320px〜1920pxの範囲で入力してください
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* アクションボタン */}
      <div className="flex items-center gap-4">
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? '保存中...' : 'レイアウト設定を保存'}
        </Button>
        <Button variant="outline" onClick={handlePreview} disabled={isPending}>
          プレビュー
        </Button>
      </div>

      {/* ヒント */}
      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <h4 className="font-medium mb-2">ヒント</h4>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
            <li>設定を保存すると、サイト全体に即時反映されます</li>
            <li>個別の記事やページで幅を上書きすることもできます</li>
            <li>長文の記事は狭めの幅（768px程度）が読みやすいです</li>
            <li>画像ギャラリーなどは広めの幅が適しています</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
