# Lexical カスタムプラグイン作成

Lexicalエディタ用のカスタムプラグインを作成します。

## 引数

- `PluginName`: PascalCase（例: `Mention`, `Emoji`）
- `タイプ`: `dialog`（ダイアログ付き）、`command`（コマンドのみ）、`listener`（リスナーのみ）

## 実行手順

### 1. 要件確認

ユーザーに以下を確認:

- プラグインの目的
- 関連するノードがあるか
- UI（ダイアログ）が必要か

### 2. 既存実装の確認

参照実装を読み込む:

- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/ImagePlugin.tsx`
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/YouTubePlugin.tsx`

**補足**: プラグインは `LexicalEditor` 内の **`InspectorSidebarProvider`** 配下で動く。**キーボードショートカットでパネル開閉に触れる場合**は `KeyboardShortcutsPlugin` の **Ctrl+Shift+0** ハンドラと衝突しないようにする（別モディファイア組み合わせを検討）。インスペクター状態が必要なら `useInspectorSidebar()` を参照（`lexical-patterns.md`「ブロック設定パネル」）。**メインシェルのレイアウト**（`editor-layout-constants`、DraggableBlock フォーク）を変える変更は同ファイルの **「LexicalEditor（メイン）のレイアウト・DraggableBlock・プレースホルダー」** を必ず読んでから行う。

### 3. プラグインファイル作成

パス: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/${PluginName}Plugin.tsx`

**ダイアログ付きプラグイン テンプレート:**

```typescript
/**
 * ${PluginName} Plugin
 *
 * ${説明}
 */

'use client'

import { useState } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $insertNodeToNearestRoot } from '@lexical/utils'
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
import { $create${PluginName}Node } from '../nodes/${PluginName}Node'

type ${PluginName}PluginProps = {
  isOpen: boolean
  onClose: () => void
}

export function ${PluginName}Plugin({ isOpen, onClose }: ${PluginName}PluginProps) {
  const [editor] = useLexicalComposerContext()
  const [formData, setFormData] = useState({
    // フォーム初期値
  })

  // 直接更新パターン（コマンド登録不要）
  const handleSubmit = () => {
    if (!formData./* validation */) return

    editor.update(() => {
      const node = $create${PluginName}Node(formData)
      $insertNodeToNearestRoot(node)
    })
    onClose()
    setFormData({/* reset */})
  }

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

// ダイアログ状態管理フック（React Compilerが自動メモ化）
export function use${PluginName}Dialog() {
  const [isOpen, setIsOpen] = useState(false)

  const open${PluginName}Dialog = () => {
    setIsOpen(true)
  }

  const close${PluginName}Dialog = () => {
    setIsOpen(false)
  }

  return {
    is${PluginName}DialogOpen: isOpen,
    open${PluginName}Dialog,
    close${PluginName}Dialog,
  }
}
```

**コマンドのみプラグイン テンプレート:**

```typescript
/**
 * ${PluginName} Plugin
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

export const ${PLUGIN_NAME}_COMMAND = createCommand<PayloadType>('${PLUGIN_NAME}')

export function ${PluginName}Plugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerCommand(
      ${PLUGIN_NAME}_COMMAND,
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
 * ${PluginName} Plugin
 *
 * ${説明}
 */

'use client'

import { useEffect } from 'react'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister } from 'lexical'  // Lexical 0.40+: canonical import (@lexical/utils も re-export しているが 'lexical' が正規)

export function ${PluginName}Plugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          // 状態変更時の処理（ここでeditor.update()は禁止）
        })
      }),
      editor.registerNodeTransform(TargetNode, (node) => {
        // Node Transforms（推奨: updateListenerの代わり）
      })
    )
  }, [editor])

  return null
}
```

### 4. エクスポート追加

`plugins/index.ts` に追加:

```typescript
export { ${PluginName}Plugin, use${PluginName}Dialog } from './${PluginName}Plugin'
// または
export { ${PluginName}Plugin, ${PLUGIN_NAME}_COMMAND } from './${PluginName}Plugin'
```

### 5. LexicalEditor.tsx 統合

**ダイアログ付きの場合:**

```typescript
// EditorInner内
const {
  is${PluginName}DialogOpen,
  open${PluginName}Dialog,
  close${PluginName}Dialog,
} = use${PluginName}Dialog()

// JSX内
<${PluginName}Plugin isOpen={is${PluginName}DialogOpen} onClose={close${PluginName}Dialog} />
```

**コマンドのみの場合:**

```typescript
// JSX内
<${PluginName}Plugin />
```

## 重要なルール

詳細は `docs/reference/codex-rules/lexical-patterns.md` を参照。

- **React Compiler互換**: `.claude/rules/react-patterns.md` 準拠
- **updateListener内でのeditor.update()禁止**: Node Transforms使用
- **リスナー登録解除**: mergeRegister使用必須
- **$関数**: read/update クロージャ内でのみ使用可能
- **型アサーション禁止**: `.claude/rules/type-safety.md` 準拠

## Definition of Done

- [ ] `bun run type-check` 通過
- [ ] `bun run lint` 通過
- [ ] `bun run test:all` で既存テストが通過
- [ ] 既存テストが壊れていないこと
- [ ] `plugins/index.ts` にエクスポート追加
- [ ] `LexicalEditor.tsx` に統合（JSX + フック）
- [ ] リスナー登録に `mergeRegister` 使用（解除漏れ防止）
