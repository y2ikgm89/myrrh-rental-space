# Lexical カスタムプラグイン作成

Lexicalエディタ用のカスタムプラグインを作成します。

## 使い方

```
/lexical-plugin <プラグイン名> [タイプ]
```

- `プラグイン名`: PascalCase（例: `Mention`, `Emoji`）
- `タイプ`: `dialog`（ダイアログ付き）、`command`（コマンドのみ）、`listener`（リスナーのみ）

## 実行手順

### 1. 要件確認

ユーザーに以下を確認:
- プラグインの目的
- 関連するノードがあるか
- UI（ダイアログ）が必要か

### 2. プラグインファイル作成

パス: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/${プラグイン名}Plugin.tsx`

**ダイアログ付きプラグイン テンプレート:**

```typescript
/**
 * ${プラグイン名} Plugin
 *
 * ${説明}
 */

'use client'

import { useCallback, useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $insertNodes } from 'lexical'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/admin/components/ui/dialog'
import { Button } from '@/admin/components/ui/button'
import { Input } from '@/admin/components/ui/input'
import { Label } from '@/admin/components/ui/label'
import { $create${プラグイン名}Node } from '../nodes/${プラグイン名}Node'

type ${プラグイン名}PluginProps = {
  isOpen: boolean
  onClose: () => void
}

export function ${プラグイン名}Plugin({ isOpen, onClose }: ${プラグイン名}PluginProps) {
  const [editor] = useLexicalComposerContext()
  const [formData, setFormData] = useState<FormState>({
    // フォーム初期値
  })

  // 直接更新パターン（コマンド登録不要）
  const handleSubmit = useCallback(() => {
    if (!formData./* validation */) return

    editor.update(() => {
      const node = $create${プラグイン名}Node(formData)
      $insertNodes([node])
    })
    onClose()
    setFormData({/* reset */})
  }, [editor, formData, onClose])

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>${表示名}を挿入</DialogTitle>
          <DialogDescription>
            ${説明文}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="field">フィールド名</Label>
            <Input
              id="field"
              value={formData.field}
              onChange={(e) => setFormData(prev => ({ ...prev, field: e.target.value }))}
              placeholder="入力..."
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              キャンセル
            </Button>
            <Button type="button" onClick={handleSubmit}>
              挿入
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ダイアログ状態管理フック（useCallback使用でReact Compiler最適化）
export function use${プラグイン名}Dialog() {
  const [isOpen, setIsOpen] = useState(false)

  const open${プラグイン名}Dialog = useCallback(() => {
    setIsOpen(true)
  }, [])

  const close${プラグイン名}Dialog = useCallback(() => {
    setIsOpen(false)
  }, [])

  return {
    is${プラグイン名}DialogOpen: isOpen,
    open${プラグイン名}Dialog,
    close${プラグイン名}Dialog,
  }
}
```

**コマンドのみプラグイン テンプレート:**

```typescript
/**
 * ${プラグイン名} Plugin
 *
 * ${説明}
 */

'use client'

import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getSelection,
  $isRangeSelection,
  createCommand,
  COMMAND_PRIORITY_EDITOR,
} from 'lexical'

export const ${プラグイン名.toUpperCase()}_COMMAND = createCommand<${Payload型}>('${プラグイン名.toUpperCase()}')

export function ${プラグイン名}Plugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerCommand(
      ${プラグイン名.toUpperCase()}_COMMAND,
      (payload) => {
        editor.update(() => {
          const selection = $getSelection()
          if (!$isRangeSelection(selection)) return false

          // コマンド処理
        })
        return true
      },
      COMMAND_PRIORITY_EDITOR
    )
  }, [editor])

  return null
}
```

**リスナーのみプラグイン テンプレート:**

```typescript
/**
 * ${プラグイン名} Plugin
 *
 * ${説明}
 */

'use client'

import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister } from '@lexical/utils'

export function ${プラグイン名}Plugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          // 状態変更時の処理
        })
      }),
      editor.registerMutationListener(
        ${ノード名}Node,
        (mutatedNodes) => {
          for (const [nodeKey, mutation] of mutatedNodes) {
            if (mutation === 'created') {
              // ノード作成時
            } else if (mutation === 'destroyed') {
              // ノード削除時
            }
          }
        }
      )
    )
  }, [editor])

  return null
}
```

### 3. エクスポート追加

`plugins/index.ts` に追加:

```typescript
export { ${プラグイン名}Plugin, use${プラグイン名}Dialog } from './${プラグイン名}Plugin'
// または
export { ${プラグイン名}Plugin, ${プラグイン名.toUpperCase()}_COMMAND } from './${プラグイン名}Plugin'
```

### 4. LexicalEditor.tsx 統合

**ダイアログ付きの場合:**

```typescript
// EditorInner内
const {
  is${プラグイン名}DialogOpen,
  open${プラグイン名}Dialog,
  close${プラグイン名}Dialog,
} = use${プラグイン名}Dialog()

// JSX内
<${プラグイン名}Plugin isOpen={is${プラグイン名}DialogOpen} onClose={close${プラグイン名}Dialog} />
```

**コマンドのみの場合:**

```typescript
// JSX内
<${プラグイン名}Plugin />
```

### 5. ToolbarPlugin連携（必要な場合）

```typescript
// ToolbarPluginProps に追加
type ToolbarPluginProps = {
  // 既存props...
  onInsert${プラグイン名}?: () => void
}

// ボタン追加
{onInsert${プラグイン名} && (
  <Button onClick={onInsert${プラグイン名}} title="${表示名}を挿入">
    <${アイコン}Icon className="h-4 w-4" />
  </Button>
)}
```

### 6. メインindex.ts エクスポート

```typescript
export {
  ${プラグイン名}Plugin,
  use${プラグイン名}Dialog,
  // または INSERT_${プラグイン名.toUpperCase()}_COMMAND
} from './plugins'
```

## 注意事項

- `.claude/rules/lexical-patterns.md` のパターンに従う
- リスナーは必ず `mergeRegister` でまとめて登録解除
- updateListener内で `editor.update()` は禁止（Node Transforms使用）
