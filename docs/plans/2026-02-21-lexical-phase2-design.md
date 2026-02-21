# Lexical エディタ Phase 2 設計ドキュメント

**日付**: 2026-02-21
**ステータス**: 設計承認済み
**方針**: 全網羅的・破壊的変更許可・公式ベストプラクティス（$config + NodeState API）準拠

---

## 背景

`feature/lexical-improvements` ブランチで Phase 1 の実装が完了し main にマージ済み。
Phase 2 では以下の 4 フェーズを並列設計して一括実装計画を作成する。

## 全体スコープ

| フェーズ | 内容               | タスク数  |
| -------- | ------------------ | --------- |
| Phase 1  | バグ修正・品質向上 | 3 タスク  |
| Phase 2  | 新規ノード（7種）  | 14 タスク |
| Phase 3  | 出力・変換強化     | 3 タスク  |
| Phase 4  | UX 改善            | 3 タスク  |

---

## Phase 1: バグ修正・品質向上

### 1-A: ImageNode キャプション表示バグ

**問題**: `ImageNode.decorate()` が `caption` を `ImageComponent` に渡しておらず、エディタ上でキャプションが非表示。

**修正**:

```tsx
// ImageComponent に caption prop を追加
function ImageComponent({
  src, alt, width, height, alignment, caption, nodeKey
}: {
  src: string
  alt: string
  width?: number
  height?: number
  alignment?: ImageAlignment
  caption?: string
  nodeKey: NodeKey
}) {
  // ...
  return (
    <figure ...>
      <img ... />
      {caption && (
        <figcaption className="text-sm text-muted-foreground text-center mt-2">
          {caption}
        </figcaption>
      )}
    </figure>
  )
}

// decorate() で caption を渡す
override decorate(): ReactElement {
  return (
    <ImageComponent
      src={$getState(this, srcState)}
      alt={$getState(this, altState)}
      width={$getState(this, widthState)}
      height={$getState(this, heightState)}
      alignment={$getState(this, alignmentState)}
      caption={$getState(this, captionState)}
      nodeKey={this.__key}
    />
  )
}
```

### 1-B: RubyNode importDOM ロジック改善

**問題**: `element.textContent?.replace(rt?.textContent ?? '', '')` は rt テキストが本文中に重複している場合、最初に出現した文字列を削除してしまう。

**修正**: ChildNodes を走査して Text ノードのみを収集する方式に変更:

```typescript
// Before (NG: rt テキストが本文に重複するとバグ)
const baseText = (element.textContent ?? "").replace(rtText, "").trim();

// After (OK: ChildNodes を走査して Text ノードのみ収集)
const baseText = Array.from(element.childNodes)
  .filter((n) => n.nodeType === Node.TEXT_NODE)
  .map((n) => n.textContent ?? "")
  .join("")
  .trim();
```

### 1-C: コードブロック言語セレクタ Inspector パネル

**現状**: `@lexical/code` の CodeNode は言語設定をサポートするが、Inspector パネルに言語セレクタがない。

**追加**: `CodeInspectorPanel.tsx` を新規作成。言語一覧（JavaScript, TypeScript, Python, HTML, CSS, JSON, Bash, SQL, Go, Rust 等）のセレクタを提供。

---

## Phase 2: 新規ノード

### 2-A: GalleryNode（画像ギャラリー）

**アーキテクチャ**: コンポジットノード（ElementNode 2種）

```
GalleryContainerNode  (ElementNode)
├── stateConfigs:
│   ├── columnsState: 2 | 3 | 4（デフォルト: 3）
│   └── styleState: 'grid' | 'masonry'（デフォルト: 'grid'）
└── 子: GalleryItemNode  (ElementNode)
    └── stateConfigs:
        ├── srcState: string
        ├── altState: string
        └── captionState: string
```

**登録箇所**: `config/nodes.ts`, `config/insert-items.ts`（category: 'media'）, `config/dialog-registry.ts`, `config/inspector-registry.ts`

**exportDOM**:

```html
<div data-gallery="true" data-gallery-columns="3" data-gallery-style="grid">
  <figure data-gallery-item="true">
    <img src="..." alt="..." />
    <figcaption>キャプション</figcaption>
  </figure>
  <!-- ... -->
</div>
```

**Dialog**: GalleryDialog（列数選択）→ 空のギャラリーを挿入。その後 InspectorPanel から画像追加・並び替え。

**ファクトリ**:

```typescript
export function $createGalleryContainerNode(
  columns: GalleryColumns = 3,
): GalleryContainerNode;
export function $createGalleryItemNode({
  src,
  alt,
  caption,
}: GalleryItemParams): GalleryItemNode;
```

---

### 2-B: AudioNode（音声プレイヤー）

**アーキテクチャ**: `DecoratorNode`（$config パターン）

**States**:

```typescript
export const audioUrlState = createState('url', { parse: (v): string => ... })
export const audioTitleState = createState('title', { parse: (v): string => ... })
export const audioArtistState = createState('artist', { parse: (v): string => ... })
```

**decorate()**: カスタム `AudioPlayerComponent`。Tailwind スタイリング、`<audio>` タグ内包。

**exportDOM**:

```html
<div
  data-audio="true"
  data-audio-title="タイトル"
  data-audio-artist="アーティスト"
>
  <audio src="..." controls preload="metadata"></audio>
</div>
```

**Dialog**: `AudioDialog`（URL + タイトル + アーティスト入力）

---

### 2-C: FileNode（ファイル添付）

**アーキテクチャ**: `DecoratorNode`（$config パターン）

**States**:

```typescript
export const fileUrlState = createState('url', { parse: (v): string => ... })
export const fileNameState = createState('filename', { parse: (v): string => ... })
export const fileSizeState = createState('filesize', { parse: (v): number => ... })  // bytes
export const fileMimeState = createState('mime', { parse: (v): string => ... })
```

**decorate()**: mime 判別でアイコン表示（PDF=赤・DOC=青・XLS=緑・ZIP=黄・その他=グレー）+ ファイル名 + サイズ（`formatFileSize(bytes)` ヘルパー）

**exportDOM**:

```html
<a
  data-file="true"
  href="..."
  download
  data-file-name="..."
  data-file-size="1234567"
  data-file-mime="application/pdf"
>
  ダウンロード: ファイル名.pdf (1.2 MB)
</a>
```

**Dialog**: `FileDialog`（URL + ファイル名（URL から自動抽出・上書き可能）+ mime 推測）

---

### 2-D: FigmaNode（Figma 埋め込み）

**アーキテクチャ**: `DecoratorNode`（$config パターン）

**URL 変換**:

```typescript
export function toFigmaEmbedUrl(url: string): string | null {
  // https://www.figma.com/file/xxx/... → https://www.figma.com/embed?embed_host=share&url=xxx
  // https://www.figma.com/proto/xxx/... → 同様
  // https://www.figma.com/design/xxx/... → 同様
}
```

**States**: `embedUrlState`, `labelState`（任意タイトル）

**exportDOM**:

```html
<div data-figma="true" data-figma-label="デザイン参照">
  <iframe
    src="https://www.figma.com/embed?embed_host=share&url=..."
    allow="fullscreen"
    loading="lazy"
  ></iframe>
</div>
```

---

### 2-E: SpotifyNode（音楽・Podcast 埋め込み）

**アーキテクチャ**: `DecoratorNode`（$config パターン）

**URL 変換**:

```typescript
export function toSpotifyEmbedUrl(url: string): string | null {
  // https://open.spotify.com/track/xxx → https://open.spotify.com/embed/track/xxx
  // track / album / playlist / episode / show 対応
}
```

**States**: `embedUrlState`, `spotifyTypeState`（'track'|'album'|'playlist'|'episode'|'show'）

**exportDOM**:

```html
<div data-spotify="true" data-spotify-type="track">
  <iframe
    src="https://open.spotify.com/embed/track/xxx"
    allow="encrypted-media"
    loading="lazy"
  ></iframe>
</div>
```

---

### 2-F: TimelineNode（水平/垂直タイムライン）

**アーキテクチャ**: コンポジットノード（ExtendedElementNode 2種）

```
TimelineContainerNode  (ElementNode)
├── stateConfigs:
│   ├── directionState: 'horizontal' | 'vertical'（デフォルト: 'vertical'）
│   └── colorState: AccentColor（デフォルト: 'default'）
└── 子: TimelineItemNode  (ElementNode)
    └── stateConfigs:
        ├── yearState: string（ラベル: 年/月/ステップ番号等）
        └── labelState: string（見出し）
    └── 子: コンテンツ（ParagraphNode 等）
```

**isShadowRoot()**: TimelineContainerNode, TimelineItemNode 共に `true`

**exportDOM**:

```html
<div data-timeline="true" data-direction="vertical" data-color="blue">
  <div data-timeline-item="true">
    <div data-timeline-year="2024">2024年</div>
    <div data-timeline-label>オープン</div>
    <div data-timeline-content>...</div>
  </div>
</div>
```

**AccentColor 対応**: `data-color` でタイムラインマーカー色を制御（`lexical-content.css` に追記）

---

### 2-G: PricingTableNode（料金比較表）

**アーキテクチャ**: コンポジットノード（ElementNode 3種）

```
PricingTableContainerNode  (ElementNode)
└── 子: PricingPlanNode  (ElementNode, 最大4列)
    └── stateConfigs:
        ├── nameState: string（プラン名）
        ├── priceState: string（価格文字列 "¥5,000〜"）
        ├── periodState: string（"/ 時間" 等）
        ├── featuredState: boolean（推奨プランハイライト）
        └── colorState: AccentColor
    └── 子: PricingFeatureNode  (ElementNode)
        └── stateConfigs:
            ├── textState: string（機能名）
            └── includedState: boolean（チェック/バツ）
```

**exportDOM**:

```html
<div data-pricing="true" data-pricing-columns="3">
  <div data-pricing-plan="true" data-featured="true" data-color="primary">
    <div data-pricing-name>スタンダード</div>
    <div data-pricing-price>¥5,000<span data-pricing-period>/ 時間</span></div>
    <ul data-pricing-features>
      <li data-included="true">最大10名</li>
      <li data-included="false">ケータリング</li>
    </ul>
  </div>
</div>
```

---

## Phase 3: 出力・変換強化

### 3-A: Markdown インポート

**実装**: `$convertFromMarkdownString(TRANSFORMERS, text)` を使用。

**UI**: ToolbarPlugin の Export/Import メニューに「Markdown をインポート」を追加。Textarea ダイアログで Markdown を貼り付けて「変換」ボタン押下でエディタに適用。

**警告**: 変換後は Undo できないため、確認ダイアログを表示する。

### 3-B: エクスポートメニュー強化

**ToolbarPlugin の Export メニュー項目統一**:

- Markdown をコピー（既存機能を踏襲）
- HTML をコピー（`$generateHtmlFromNodes` 使用）
- プレーンテキストをコピー（`$getRoot().getTextContent()` 使用）
- ── セパレータ ──
- Markdown をインポート（3-A）

### 3-C: プリントプレビューモード

**実装**: `isPrintPreview` state を追加。A4縦向きのラッパー（`max-w-[21cm]` + 適切な余白）に切り替え。`window.print()` で印刷実行。

---

## Phase 4: UX 改善

### 4-A: Link ホバープレビュー

**実装**: `LinkPlugin` に `hovered` state を追加。リンクホバー時に Popover で URL + ドメイン + 外部リンクアイコンを表示。`FloatingToolbarPlugin` の Popover パターンを流用。

### 4-B: ブロック移動ボタン（Up/Down）

**実装**: `DraggableBlockPlugin` のドラッグハンドル横に `↑` / `↓` ボタンを追加。`node.getPreviousSibling()?.insertBefore(node)` / `node.getNextSibling()?.insertAfter(node)` で実装。

### 4-C: ショートカットヘルプモーダル

**実装**: ToolbarPlugin に `?` ボタン（または `Ctrl+/`）を追加。`KeyboardShortcutsPlugin` で登録済みのショートカット一覧をモーダルで表示。

---

## 技術的制約・共通ルール

- `$config()` + NodeState API 必須（`static getType()`, `static clone()` 等のレガシーパターン禁止）
- `createDOM` / `exportDOM` では CSS クラス不使用・data-attributes のみ
- `useCallback` / `useMemo` / `React.memo` 禁止（React Compiler が自動メモ化）
- `as` 型アサーション禁止
- コンポジットノードの Container / Content / Item / Panel ノードに `isShadowRoot(): true` 必須
- AccentColor システム対応ノードは `colorState` + `lexical-content.css` への `[data-color]` 追記

## 検証コマンド

```bash
bun run validate         # type-check + lint
bun run validate && bun run build  # 完全検証
```

## 新規ノード登録チェックリスト（全 9 箇所）

| ファイル                               | 対象               |
| -------------------------------------- | ------------------ |
| `config/nodes.ts`                      | 全ノード           |
| `nodes/index.ts`                       | barrel export      |
| `config/dialog-registry.ts`            | Dialog 使用時      |
| `config/insert-items.ts`               | ToolbarPicker 表示 |
| `plugins/index.ts`                     | Plugin export      |
| `config/inspector-registry.ts`         | Inspector あり     |
| `inspector/hooks/inspectable-nodes.ts` | Inspector あり     |
| `inspector/InspectorSidebar.tsx`       | Inspector あり     |
| `inspector/panels/index.ts`            | Panel export       |
