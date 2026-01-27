# Lexical ツールバー拡張

Lexicalエディタのツールバーに新規ボタンを追加します。

## 使い方

```
/lexical-toolbar <機能名>
```

- `機能名`: 追加する機能（例: `Table`, `Code`, `Divider`）

## 実行手順

### 1. 要件確認

ユーザーに以下を確認:
- ボタンの動作（ダイアログ表示 / 直接挿入 / フォーマット変更）
- アイコン（lucide-reactから選択）
- ツールチップテキスト

### 2. ボタンタイプ別実装

#### A. ダイアログ表示タイプ（画像/YouTube風）

**1. フック追加（既存プラグインに追加 or 新規作成）:**

```typescript
// plugins/${機能名}Plugin.tsx
import { useCallback, useState } from 'react'

// useCallback使用でReact Compiler最適化
export function use${機能名}Dialog() {
  const [isOpen, setIsOpen] = useState(false)

  const open${機能名}Dialog = useCallback(() => {
    setIsOpen(true)
  }, [])

  const close${機能名}Dialog = useCallback(() => {
    setIsOpen(false)
  }, [])

  return {
    is${機能名}DialogOpen: isOpen,
    open${機能名}Dialog,
    close${機能名}Dialog,
  }
}
```

**2. EditorInner更新:**

```typescript
// LexicalEditor.tsx の EditorInner
const {
  is${機能名}DialogOpen,
  open${機能名}Dialog,
  close${機能名}Dialog,
} = use${機能名}Dialog()

// ToolbarPluginに渡す
<ToolbarPlugin
  onInsertImage={openImageDialog}
  onInsertYouTube={openYouTubeDialog}
  onInsert${機能名}={open${機能名}Dialog}  // 追加
/>

// ダイアログ追加
<${機能名}Plugin isOpen={is${機能名}DialogOpen} onClose={close${機能名}Dialog} />
```

**3. ToolbarPlugin更新:**

```typescript
// ToolbarPlugin.tsx
import { ${アイコン} } from 'lucide-react'

type ToolbarPluginProps = {
  onInsertImage?: () => void
  onInsertYouTube?: () => void
  onInsert${機能名}?: () => void  // 追加
}

// ボタン追加
{onInsert${機能名} && (
  <Button
    type="button"
    variant="ghost"
    size="icon"
    className="h-8 w-8"
    onClick={onInsert${機能名}}
    title="${ツールチップ}"
  >
    <${アイコン} className="h-4 w-4" />
  </Button>
)}
```

#### B. 直接挿入タイプ（Divider風）

**1. コマンド定義:**

```typescript
// 新規ファイル or 既存プラグインに追加
import { createCommand } from 'lexical'

export const INSERT_${機能名.toUpperCase()}_COMMAND = createCommand('INSERT_${機能名.toUpperCase()}')
```

**2. ToolbarPlugin更新:**

```typescript
// インポート
import { INSERT_${機能名.toUpperCase()}_COMMAND } from './${機能名}Plugin'

// ボタン追加
<Button
  type="button"
  variant="ghost"
  size="icon"
  className="h-8 w-8"
  onClick={() => editor.dispatchCommand(INSERT_${機能名.toUpperCase()}_COMMAND, undefined)}
  title="${ツールチップ}"
>
  <${アイコン} className="h-4 w-4" />
</Button>
```

#### C. フォーマット変更タイプ（見出し/引用風）

**既存コマンド使用:**

```typescript
// 太字/斜体等のテキストフォーマット
editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')

// ブロックタイプ変更
editor.update(() => {
  const selection = $getSelection()
  if ($isRangeSelection(selection)) {
    $setBlocksType(selection, () => $create${ブロック}Node())
  }
})
```

### 3. ボタン配置ガイド

現在のツールバー構造:

```
[Undo][Redo] | [B][I][U][S] | [見出し▼][箇条書き][番号][引用] | [Link] | [画像][YouTube]
```

新規ボタンの推奨配置:
- メディア系: `[画像][YouTube]` の後
- フォーマット系: `[B][I][U][S]` の後
- ブロック系: `[見出し▼]...[引用]` の後

セパレータ追加:

```typescript
<Separator orientation="vertical" className="h-6 mx-1" />
```

### 4. アイコン一覧（lucide-react）

よく使うアイコン:

| 機能 | アイコン |
|------|----------|
| テーブル | `Table2` |
| コードブロック | `Code` |
| 水平線 | `Minus` |
| 絵文字 | `Smile` |
| カラー | `Palette` |
| ファイル | `FileText` |
| カード | `Square` |
| コールアウト | `AlertCircle` |

### 5. 状態表示（アクティブ状態）

選択位置に応じたボタンハイライト:

```typescript
// 状態管理
const [is${機能名}Active, setIs${機能名}Active] = useState(false)

// updateToolbarで更新
const updateToolbar = useCallback(() => {
  const selection = $getSelection()
  if ($isRangeSelection(selection)) {
    // カスタムノードのチェック
    const node = selection.anchor.getNode()
    setIs${機能名}Active($is${機能名}Node(node) || $is${機能名}Node(node.getParent()))
  }
}, [])

// ボタンのvariant
<Button
  variant={is${機能名}Active ? 'secondary' : 'ghost'}
  // ...
/>
```

### 6. ドロップダウンメニュー追加

複数のサブ機能がある場合:

```typescript
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button type="button" variant="ghost" size="sm" className="h-8 gap-1">
      <${アイコン} className="h-4 w-4" />
      <span className="text-xs">${ラベル}</span>
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem onClick={() => handle${オプション1}()}>
      <${アイコン1} className="h-4 w-4 mr-2" />
      ${オプション1名}
    </DropdownMenuItem>
    <DropdownMenuItem onClick={() => handle${オプション2}()}>
      <${アイコン2} className="h-4 w-4 mr-2" />
      ${オプション2名}
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

## 注意事項

- ボタンには必ず `type="button"` を指定（フォーム内での意図しない送信防止）
- アイコンサイズは `h-4 w-4` で統一
- ボタンサイズは `h-8 w-8`（アイコンのみ）または `h-8`（テキスト付き）
- 必ず `title` 属性でツールチップを設定
