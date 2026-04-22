# Lexical ツールバー拡張

Lexicalエディタのツールバーに新規ボタンを追加します。

## 引数

- `FeatureName`: 追加する機能名（例: `Table`, `Code`, `Divider`）

## 実行手順

### 1. 要件確認

ユーザーに以下を確認:

- ボタンの動作（ダイアログ表示 / 直接挿入 / フォーマット変更）
- アイコン（lucide-reactから選択）
- ツールチップテキスト

### 2. 既存実装の確認

参照実装を読み込む:

- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/ToolbarPlugin.tsx`
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/LexicalEditor.tsx`

**補足**: `ToolbarPlugin` は `InspectorSidebarProvider` 内でマウントされる。右ブロック設定パネルの開閉と連動させる場合は **`useInspectorSidebar()`**（`inspector/inspector-sidebar-context.tsx`）を使う。既存のパネルトグル（`PanelRightOpen` / `PanelRightClose`・**Ctrl+Shift+0**）と役割が被るボタンを足さないこと。詳細は `docs/reference/codex-rules/lexical-patterns.md` の「ブロック設定パネル」。

### 3. ボタンタイプ別実装

#### A. ダイアログ表示タイプ（画像/YouTube風）

**1. フック追加（プラグインに追加）:**

```typescript
// plugins/${FeatureName}Plugin.tsx
import { useState } from 'react'

// React Compiler が自動メモ化するため useCallback 不要
export function use${FeatureName}Dialog() {
  const [isOpen, setIsOpen] = useState(false)

  const open${FeatureName}Dialog = () => {
    setIsOpen(true)
  }

  const close${FeatureName}Dialog = () => {
    setIsOpen(false)
  }

  return {
    is${FeatureName}DialogOpen: isOpen,
    open${FeatureName}Dialog,
    close${FeatureName}Dialog,
  }
}
```

**2. EditorInner更新:**

```typescript
// LexicalEditor.tsx の EditorInner
const {
  is${FeatureName}DialogOpen,
  open${FeatureName}Dialog,
  close${FeatureName}Dialog,
} = use${FeatureName}Dialog()

// ToolbarPluginに渡す
<ToolbarPlugin
  onInsertImage={openImageDialog}
  onInsertYouTube={openYouTubeDialog}
  onInsert${FeatureName}={open${FeatureName}Dialog}  // 追加
/>

// ダイアログ追加
<${FeatureName}Plugin isOpen={is${FeatureName}DialogOpen} onClose={close${FeatureName}Dialog} />
```

**3. ToolbarPlugin更新:**

```typescript
// ToolbarPlugin.tsx
import { ${Icon} } from 'lucide-react'

type ToolbarPluginProps = {
  onInsertImage?: () => void
  onInsertYouTube?: () => void
  onInsert${FeatureName}?: () => void  // 追加
}

// ボタン追加
{onInsert${FeatureName} && (
  <Button
    type="button"
    variant="ghost"
    size="icon"
    className="h-8 w-8"
    onClick={onInsert${FeatureName}}
    title="${Tooltip}"
  >
    <${Icon} className="h-4 w-4" />
  </Button>
)}
```

#### B. 直接挿入タイプ（Divider風）

**1. コマンド定義:**

```typescript
// 新規ファイル or 既存プラグインに追加
import { createCommand } from 'lexical'

export const INSERT_${FEATURE_NAME}_COMMAND = createCommand('INSERT_${FEATURE_NAME}')
```

**2. ToolbarPlugin更新:**

```typescript
// インポート
import { INSERT_${FEATURE_NAME}_COMMAND } from './${FeatureName}Plugin'

// ボタン追加
<Button
  type="button"
  variant="ghost"
  size="icon"
  className="h-8 w-8"
  onClick={() => editor.dispatchCommand(INSERT_${FEATURE_NAME}_COMMAND, undefined)}
  title="${Tooltip}"
>
  <${Icon} className="h-4 w-4" />
</Button>
```

#### C. フォーマット変更タイプ（見出し/引用風）

**既存コマンド使用:**

```typescript
// 太字/斜体等のテキストフォーマット
editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold");

// ブロックタイプ変更
editor.update(() => {
  const selection = $getSelection();
  if ($isRangeSelection(selection)) {
    $setBlocksType(selection, () => $createBlockNode());
  }
});
```

### 4. ボタン配置ガイド

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

### 5. アイコン一覧（lucide-react）

よく使うアイコン:

| 機能           | アイコン      |
| -------------- | ------------- |
| テーブル       | `Table2`      |
| コードブロック | `Code`        |
| 水平線         | `Minus`       |
| 絵文字         | `Smile`       |
| カラー         | `Palette`     |
| ファイル       | `FileText`    |
| カード         | `Square`      |
| コールアウト   | `AlertCircle` |

### 6. 状態表示（アクティブ状態）

選択位置に応じたボタンハイライト:

```typescript
// 状態管理
const [is${FeatureName}Active, setIs${FeatureName}Active] = useState(false)

// updateToolbarで更新
// React Compiler が自動メモ化するため useCallback 不要
const updateToolbar = () => {
  const selection = $getSelection()
  if ($isRangeSelection(selection)) {
    const node = selection.anchor.getNode()
    setIs${FeatureName}Active($is${FeatureName}Node(node) || $is${FeatureName}Node(node.getParent()))
  }
}

// ボタンのvariant
<Button
  variant={is${FeatureName}Active ? 'secondary' : 'ghost'}
  // ...
/>
```

## 重要なルール

詳細は `docs/reference/codex-rules/lexical-patterns.md` を参照。

- **type="button"必須**: フォーム内での意図しない送信防止
- **アイコンサイズ**: `h-4 w-4` で統一
- **ボタンサイズ**: `h-8 w-8`（アイコンのみ）または `h-8`（テキスト付き）
- **title属性必須**: ツールチップ設定
- **React Compiler互換**: `.claude/rules/react-patterns.md` 準拠
- **型アサーション禁止**: `.claude/rules/type-safety.md` 準拠

## Definition of Done

- [ ] `bun run type-check` 通過
- [ ] `bun run lint` 通過
- [ ] `bun run test:all` で既存テストが通過
- [ ] 既存テストが壊れていないこと
- [ ] ツールバーボタンに `type="button"` 設定
- [ ] ツールバーボタンに `title` 属性（ツールチップ）設定
- [ ] アイコンサイズ `h-4 w-4`、ボタンサイズ `h-8 w-8` 統一
