'use client'

/**
 * パーマリンク設定セクション
 *
 * 投稿記事のURL構造とプレフィックス表示を設定
 */

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
  Button,
  SelectionBox,
  Switch,
} from '@/admin/components/ui'
import { updatePermalinkSettings } from '@/admin/actions/settings'
import { PostPermalinkStructure } from '@/shared/db/enums'
import { isValidPostPermalinkStructure, getValidPostPermalinkStructure } from '@/shared/lib/validations/enums'
import type { SelectionBoxOption } from '@/admin/components/ui'

// =============================================================================
// Types
// =============================================================================

type PermalinkSectionProps = {
  settings: {
    postPermalinkStructure: PostPermalinkStructure | null
    postUrlPrefixEnabled: boolean
  }
}

// =============================================================================
// Constants
// =============================================================================

const PERMALINK_OPTIONS: SelectionBoxOption[] = [
  {
    value: PostPermalinkStructure.post_name,
    label: 'シンプル',
    description: '記事名のみのシンプルなURL',
  },
  {
    value: PostPermalinkStructure.date_name,
    label: '日付+記事名',
    description: '公開日が含まれるURL',
  },
  {
    value: PostPermalinkStructure.category_name,
    label: 'カテゴリ+記事名',
    description: 'カテゴリ階層を含むURL',
  },
]

// =============================================================================
// Component
// =============================================================================

export function PermalinkSection({ settings }: PermalinkSectionProps) {
  const [isPending, startTransition] = useTransition()

  const [structure, setStructure] = useState<PostPermalinkStructure>(
    () => getValidPostPermalinkStructure(settings.postPermalinkStructure)
  )
  const [prefixEnabled, setPrefixEnabled] = useState(settings.postUrlPrefixEnabled)

  const handleSave = () => {
    startTransition(async () => {
      const result = await updatePermalinkSettings({
        postPermalinkStructure: structure,
        postUrlPrefixEnabled: prefixEnabled,
      })

      if (result.success) {
        toast.success('パーマリンク設定を保存しました')
      } else {
        toast.error(result.error)
      }
    })
  }

  const getPreviewUrl = () => {
    const prefix = prefixEnabled ? '/posts' : ''
    switch (structure) {
      case PostPermalinkStructure.date_name:
        return `${prefix}/2026/01/article-title`
      case PostPermalinkStructure.category_name:
        return `${prefix}/technology/article-title`
      case PostPermalinkStructure.post_name:
      default:
        return `${prefix}/article-title`
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>パーマリンク設定</CardTitle>
        <CardDescription>
          投稿記事のURL構造を設定します
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* URLプレフィックス設定 */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label className="text-base">/posts/ プレフィックス</Label>
            <p className="text-sm text-muted-foreground">
              URLに /posts/ を含める（推奨）
            </p>
          </div>
          <Switch
            checked={prefixEnabled}
            onCheckedChange={setPrefixEnabled}
          />
        </div>

        {/* プレフィックス無効時の警告 */}
        {!prefixEnabled && (
          <div className="rounded-md border border-warning/20 bg-warning/10 p-4">
            <p className="text-sm text-warning-foreground">
              プレフィックスを無効にすると、投稿のスラッグがルートレベルで使用されます。
              既存の静的ページ（about, contact 等）や予約パスと衝突しないよう注意してください。
            </p>
          </div>
        )}

        {/* URL構造選択 */}
        <div className="space-y-3">
          <Label>URL構造</Label>
          <SelectionBox
            options={PERMALINK_OPTIONS}
            value={structure}
            onChange={(value) => {
              if (isValidPostPermalinkStructure(value)) {
                setStructure(value)
              }
            }}
            columns={1}
            name="パーマリンク構造"
          />
        </div>

        {/* プレビュー */}
        <div className="rounded-md bg-muted p-4">
          <Label className="text-sm font-medium">プレビュー</Label>
          <code className="mt-2 block text-sm font-mono">
            {getPreviewUrl()}
          </code>
        </div>

        {/* 注意事項 */}
        <div className="rounded-md border border-muted bg-muted/50 p-4">
          <p className="text-sm text-muted-foreground">
            予約済みパス（about, contact, news, spaces, admin など）と同名のスラッグは使用できません。
          </p>
        </div>

        {/* 保存ボタン */}
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? '保存中...' : '保存'}
        </Button>
      </CardContent>
    </Card>
  )
}
