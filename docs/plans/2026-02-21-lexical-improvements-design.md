# Lexical エディタ改善 設計ドキュメント

**日付**: 2026-02-21
**ステータス**: 設計承認済み
**方針**: 破壊的変更許可・後方互換性なし・公式ベストプラクティス準拠

---

## 背景と目的

Lexical 0.40.0 の NodeState API ・React 19 + React Compiler 1.0 ・CSS-first data-attribute パターンに完全準拠した上で、エディタに欠けている機能を追加する。既存 DB コンテンツの後方互換性は不要（完全クリーンリセット可）。デスクトップのみ対象（MobileEditorFallback は変更なし）。

---

## アーキテクチャ概要

```
lexical/
├── nodes/
│   ├── ImageNode.tsx         # キャプション追加（captionState）
│   ├── VimeoNode.tsx         # 新規: Vimeo 埋め込み
│   ├── MapEmbedNode.tsx      # 新規: Google Maps 埋め込み
│   ├── RubyNode.tsx          # 新規: 日本語ルビ（インライン）
│   └── TooltipNode.tsx       # 新規: ホバーツールチップ（インライン）
├── plugins/
│   ├── ToolbarPlugin.tsx     # Sub/Sup 追加・Markdown エクスポート・全画面ボタン
│   ├── FloatingToolbarPlugin.tsx  # ルビボタン追加
│   ├── VimeoPlugin.tsx       # 新規: Vimeo 挿入ダイアログ
│   ├── MapEmbedPlugin.tsx    # 新規: Maps 挿入ダイアログ
│   └── DraggableBlockPlugin.tsx   # ブロック複製（右クリックメニュー追加）
├── inspector/panels/
│   ├── ImageInspectorPanel.tsx    # 新規: alt + caption 編集
│   ├── VimeoInspectorPanel.tsx    # 新規
│   └── MapEmbedInspectorPanel.tsx # 新規
├── config/
│   └── insert-items.ts       # Vimeo・MapEmbed・Ruby・Tooltip 追加
├── LexicalEditor.tsx         # isFullscreen state + 全画面 CSS
└── StatusBar.tsx             # 読了時間表示追加
```

---

## Phase 1: クリーンアップ（BP 違反修正）

### 1.1 `YouTubeNode.createDOM` — theme 参照除去

```typescript
// Before (NG)
createDOM(config: EditorConfig) {
  const div = document.createElement('div')
  const className = config.theme['youtube']
  if (className) div.className = className
  return div
}

// After (OK: data-attribute のみ)
createDOM(): HTMLElement {
  const div = document.createElement('div')
  div.setAttribute('data-youtube', 'true')
  return div
}
```

### 1.2 `ImageNode.createDOM` — theme 参照除去

同様に `config.theme.image` 参照を除去し、data-attribute のみに統一。

### 1.3 `ToolbarPlugin` — Sub/Sup ボタン追加

Bold/Italic/Underline/Strikethrough 群の後に以下を追加:

- `SubscriptIcon` → `FORMAT_TEXT_COMMAND, 'subscript'`
- `SuperscriptIcon` → `FORMAT_TEXT_COMMAND, 'superscript'`

FloatingToolbar と機能を統一。

### 1.4 `docs/plans/README.md` — AccentColor 計画を完了マーク

2026-02-18 の AccentColor 実装計画はコード上で完全実装済み。README のステータスを「✅ 完了」に更新。

---

## Phase 2: ImageNode キャプション

### ノード変更

```typescript
// 追加する state
export const captionState = createState('caption', {
  parse: (v: unknown): string => typeof v === 'string' ? v : '',
})

// exportDOM 変更: div → figure
exportDOM(): DOMExportOutput {
  const figure = document.createElement('figure')
  figure.setAttribute('data-image', 'true')
  figure.setAttribute('data-image-alignment', $getState(this, alignmentState))

  const img = document.createElement('img')
  img.setAttribute('src', $getState(this, srcState))
  img.setAttribute('alt', $getState(this, altState))
  // ... width/height
  figure.appendChild(img)

  const caption = $getState(this, captionState)
  if (caption) {
    const figcaption = document.createElement('figcaption')
    figcaption.setAttribute('data-image-caption', 'true')
    figcaption.textContent = caption
    figure.appendChild(figcaption)
  }

  return { element: figure }
}
```

### ImageInspectorPanel（新規作成）

- Alt テキスト入力フィールド
- キャプション入力フィールド（Textarea）
- 配置選択（left / center / right）

---

## Phase 3: 新規ノード

### 3.1 VimeoNode

YouTubeNode を完全複製してパターン適用。

**URL 解析ロジック**:

```typescript
// vimeo.com/{id}
// vimeo.com/channels/xxx/{id}
// player.vimeo.com/video/{id}
function extractVimeoId(url: string): string | null {
  const match = url.match(
    /vimeo\.com(?:\/(?:channels\/\w+|groups\/[^/]+\/videos|video))?\/(\d+)/,
  );
  return match?.[1] ?? null;
}
```

**embed URL**: `https://player.vimeo.com/video/${videoId}`

**exportDOM**:

```html
<div data-vimeo="true">
  <iframe
    src="..."
    allow="autoplay; fullscreen; picture-in-picture"
    allowfullscreen
  ></iframe>
</div>
```

### 3.2 MapEmbedNode

**States**:

- `embedUrlState`: Google Maps embed URL
- `labelState`: 任意ラベル（例：「アクセスマップ」）

**URL 変換**:

```typescript
// https://maps.google.com/maps?q=xxx → https://maps.google.com/maps?q=xxx&output=embed
// https://www.google.com/maps/embed?pb=xxx → そのまま使用
function toEmbedUrl(url: string): string | null { ... }
```

**exportDOM**:

```html
<div data-map="true" data-map-label="アクセスマップ">
  <iframe
    src="..."
    loading="lazy"
    referrerpolicy="no-referrer-when-downgrade"
  ></iframe>
</div>
```

**MapEmbedPlugin**: URL 入力 → embed URL 自動変換 + iframe プレビュー表示

### 3.3 RubyNode（インラインDecoratorNode）

**States**:

- `baseTextState`: ベーステキスト
- `rubyTextState`: ルビ（ふりがな）

**exportDOM**:

```html
<ruby data-ruby="true">漢字<rt>かんじ</rt></ruby>
```

**importDOM**:

```typescript
static importDOM(): DOMConversionMap {
  return {
    ruby: () => ({ conversion: $convertRubyElement, priority: 1 }),
  }
}
```

**挿入方法**: FloatingToolbar の「ルビ」ボタン → テキスト選択中に押すと選択テキストがベースに入ったダイアログが開く。`$insertNodes` でインライン挿入。

### 3.4 TooltipNode（インラインDecoratorNode）

**States**:

- `baseTextState`: 表示テキスト
- `tooltipTextState`: ツールチップテキスト

**exportDOM**:

```html
<abbr data-tooltip="true" title="ツールチップ説明">表示テキスト</abbr>
```

**公開CSS** (`lexical-content.css` に追記):

```css
[data-tooltip] {
  text-decoration: underline dotted;
  cursor: help;
}
```

**挿入方法**: FloatingToolbar の「ツールチップ」ボタン → ダイアログ。`$insertNodes` でインライン挿入。

---

## Phase 4: UX 改善

### 4.1 全画面モード

**LexicalEditor.tsx**:

```typescript
const [isFullscreen, setIsFullscreen] = useState(false);

// Escape キー解除
const handleEsc = useEffectEvent(() => setIsFullscreen(false));
useEffect(() => {
  if (!isFullscreen) return;
  const handler = (e: KeyboardEvent) => {
    if (e.key === "Escape") handleEsc();
  };
  document.addEventListener("keydown", handler);
  return () => document.removeEventListener("keydown", handler);
}, [isFullscreen]);
```

**CSS**（ルートコンテナ）:

```tsx
<div className={cn(
  "flex flex-col border rounded-lg overflow-hidden",
  isFullscreen && "fixed inset-0 z-[100] rounded-none border-0"
)}>
```

**ToolbarPlugin**: `Maximize` / `Minimize` アイコンボタン。`isFullscreen` state は `LexicalEditor` から prop で渡す。

### 4.2 ブロック複製

`DraggableBlockPlugin` のドラッグハンドルボタンに `onContextMenu` を追加:

```tsx
<button
  onContextMenu={(e) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, nodeKey });
  }}
>
  ⠿
</button>
```

コンテキストメニュー（`<DropdownMenu>`）:

- **複製**: `editor.update(() => { const clone = $createNode(node); $insertNodeToNearestRoot(clone) })`
- **削除**: `editor.update(() => node.remove())`

### 4.3 読了時間表示

`StatusBar.tsx` に読了時間カラムを追加:

```typescript
// 日本語: 約500字/分
const readingTimeMin = Math.ceil(charCount / 500);
const readingTimeText = readingTimeMin <= 1 ? "約1分" : `約${readingTimeMin}分`;
```

表示: `文字数: 1,234 | 読了時間: 約3分`

### 4.4 Markdown エクスポート

**インストール**: `bun add @lexical/markdown`

**ToolbarPlugin の Insert メニューに追加**:

```typescript
import { $convertToMarkdownString, TRANSFORMERS } from "@lexical/markdown";

const handleMarkdownExport = () => {
  editor.getEditorState().read(() => {
    const md = $convertToMarkdownString(TRANSFORMERS);
    void navigator.clipboard.writeText(md).then(() => {
      toast.success("Markdown をコピーしました");
    });
  });
};
```

---

## Phase 5: テーブル強化

### 5.1 TablePlugin オプション有効化

```tsx
// LexicalEditor.tsx
<TablePlugin hasCellMerge={true} hasCellBackgroundColor={true} />
```

### 5.2 TableCellResizer 追加

```tsx
import { TableCellResizerPlugin } from "@lexical/react/LexicalTableCellResizerPlugin";

// LexicalEditor.tsx のプラグイン群に追加
<TableCellResizerPlugin />;
```

---

## 追加パッケージ

| パッケージ          | バージョン | 用途                  |
| ------------------- | ---------- | --------------------- |
| `@lexical/markdown` | `^0.40.0`  | Markdown エクスポート |

---

## 禁止事項（全 Phase 共通）

- `as` 型アサーション禁止（NodeState API の型ガードを使用）
- `createDOM` / `exportDOM` での CSS クラス使用禁止（data-attributes のみ）
- `useCallback` / `useMemo` / `React.memo` 禁止（React Compiler が自動最適化）
- `forwardRef` 禁止（ref を通常 prop として受け取る）
- getter/setter ラッパーメソッド禁止（`$getState` / `$setState` を直接使用）
- `collapseAtStart()` を子ノードに実装禁止

---

## 検証コマンド

```bash
bun run validate         # type-check + lint
bun run validate && bun run build  # 完全検証
```
