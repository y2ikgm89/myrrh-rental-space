'use client'

/**
 * ヘッダー設定セクション
 *
 * ヘッダーのスクロール動作と背景モードを設定
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
} from '@/admin/components/ui'
import { updateHeaderSettings } from '@/admin/actions/settings'
import type { SelectionBoxOption } from '@/admin/components/ui'
import {
  HeaderScrollBehavior,
  HeaderBackgroundMode,
  isValidHeaderScrollBehavior,
  isValidHeaderBackgroundMode,
  getValidHeaderScrollBehavior,
  getValidHeaderBackgroundMode,
} from '@/shared/lib/validations/enums'

// =============================================================================
// Constants
// =============================================================================

const SCROLL_BEHAVIOR_OPTIONS: SelectionBoxOption[] = [
  {
    value: HeaderScrollBehavior.auto_hide,
    label: '自動非表示',
    description: '下スクロール150px蓄積で非表示、上スクロールで復帰',
  },
  {
    value: HeaderScrollBehavior.always_visible,
    label: '常時表示',
    description: 'スクロールしてもヘッダーは常に表示（背景のみ変化）',
  },
  {
    value: HeaderScrollBehavior.hide_on_scroll,
    label: 'スクロールで即非表示',
    description: '下スクロール開始で即座に非表示、上スクロールで復帰',
  },
]

const BACKGROUND_MODE_OPTIONS: SelectionBoxOption[] = [
  {
    value: HeaderBackgroundMode.solid,
    label: '不透明',
    description: 'ヘッダーの下にコンテンツが配置される通常レイアウト',
  },
  {
    value: HeaderBackgroundMode.transparent,
    label: '透明',
    description: 'ヒーロー画像がヘッダー背後に広がる透過レイアウト',
  },
]

// =============================================================================
// Types
// =============================================================================

interface HeaderSectionProps {
  settings: {
    headerScrollBehavior: string
    headerBackgroundMode: string
  }
}

// =============================================================================
// Component
// =============================================================================

export function HeaderSection({ settings }: HeaderSectionProps) {
  const [isPending, startTransition] = useTransition()

  const [behavior, setBehavior] = useState<HeaderScrollBehavior>(
    getValidHeaderScrollBehavior(settings.headerScrollBehavior)
  )
  const [backgroundMode, setBackgroundMode] = useState<HeaderBackgroundMode>(
    getValidHeaderBackgroundMode(settings.headerBackgroundMode)
  )

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateHeaderSettings({
        headerScrollBehavior: behavior,
        headerBackgroundMode: backgroundMode,
      })

      if (result.success) {
        toast.success('ヘッダー設定を保存しました')
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>ヘッダー設定</CardTitle>
        <CardDescription>
          ヘッダーのスクロール時の動作と背景モードを設定します
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <Label>背景モード</Label>
          <SelectionBox
            options={BACKGROUND_MODE_OPTIONS}
            value={backgroundMode}
            onChange={(value) => {
              if (isValidHeaderBackgroundMode(value)) {
                setBackgroundMode(value)
              }
            }}
            columns={1}
            name="ヘッダー背景モード"
          />
        </div>

        <div className="space-y-3">
          <Label>スクロール動作</Label>
          <SelectionBox
            options={SCROLL_BEHAVIOR_OPTIONS}
            value={behavior}
            onChange={(value) => {
              if (isValidHeaderScrollBehavior(value)) {
                setBehavior(value)
              }
            }}
            columns={1}
            name="ヘッダースクロール動作"
          />
        </div>

        <div className="rounded-md border border-muted bg-muted/50 p-4">
          <p className="text-sm text-muted-foreground">
            {backgroundMode === HeaderBackgroundMode.transparent
              ? 'ヒーロー画像がヘッダー背後に広がります。テキストが見にくい場合は「不透明」に変更してください。'
              : '予約導線を常時表示したい場合は「常時表示」がおすすめです。'}
          </p>
        </div>

        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? '保存中...' : '保存'}
        </Button>
      </CardContent>
    </Card>
  )
}
