# Lexical エディタ最適化 — 設計書

> 作成日: 2026-02-28
> 方針: 公式 Lexical best practices 準拠・後方互換性なし・クリーン実装
> 対象: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/`
> **ステータス (2026-04-15): 完了**

## 完了ステータス

| Phase | タスク                 | 状態                                                                                                                      |
| ----- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1-1   | TableActionMenuPlugin  | ✅ 実装済み (`plugins/TableActionMenuPlugin.tsx`)                                                                         |
| 1-2   | TableCellResizerPlugin | ❌ **不可** — @lexical/react 0.43.x に存在しない ([gotchas.md §Lexical](../../.claude/rules/gotchas.md) 禁止事項 item 21) |
| 1-3   | InlineImageNode        | ✅ 実装済み (`nodes/InlineImageNode.tsx` + `plugins/InlineImagePlugin.tsx`)                                               |
| 2-1   | TestimonialNode        | ✅ 実装済み (`nodes/TestimonialNode.tsx` + `plugins/TestimonialPlugin.tsx`)                                               |
| 2-2   | FeatureIconListNode    | ✅ 実装済み (`nodes/FeatureIconListNode.tsx` + `plugins/FeatureIconListPlugin.tsx`)                                       |
| 2-3   | CoverNode              | ✅ 実装済み (`nodes/CoverNode.tsx` + `plugins/CoverPlugin.tsx`)                                                           |
| 3-1   | PasteUrlPlugin         | ✅ 実装済み (`plugins/PasteUrlPlugin.tsx`)                                                                                |
| 3-2   | CharacterLimitPlugin   | ✅ 実装済み (`LexicalEditor.tsx:277` + `types.ts` `characterLimit?: number`)                                              |

Phase 1-2 を除き 7/8 完了。TableCellResizerPlugin は Lexical 側の削除により永続的に不可のため、本設計書はこれ以上の追跡対象外。

---

## 前提: 現状評価

技術監査結果 **A+（問題なし）**:

- NodeState API (`createState` / `$getState` / `$setState`): 全 40 ノードで統一済み
- `importDOM` / `exportDOM` ペア: 全ノードで完備
- `isShadowRoot()` 実装: 全 9 複合ノードグループで完備
- AccentColor システム: 統一的に適用済み
- `theme.ts`: デッドエントリなし

**不足点（公式 Lexical と対比）**:

| 項目                         | 種別                 | 影響                     |
| ---------------------------- | -------------------- | ------------------------ |
| `TableActionMenuPlugin`      | 公式 Playground 標準 | 行/列操作 UI が未整備    |
| `TableCellResizerPlugin`     | 公式 npm パッケージ  | 列幅変更不可             |
| `InlineImageNode`            | 公式 Playground 標準 | テキスト混在画像なし     |
| Testimonial ブロック         | プロジェクト固有     | 口コミ・レビュー掲載不可 |
| Feature Icon List ブロック   | プロジェクト固有     | 設備・特徴訴求に限界     |
| Cover ブロック               | プロジェクト固有     | 背景画像 + テキストなし  |
| URL ペースト → Bookmark 変換 | UX                   | 手動挿入のみ             |
| `CharacterLimitPlugin`       | UX                   | 文字数制限なし           |

---

## Phase 1: 公式 Playground 水準への整合

### 1-1. TableActionMenuPlugin

**背景**: 現在 `TablePlugin hasCellMerge={true} hasCellBackgroundColor={true}` は設定済みだが、セル選択時の行/列操作 UI が存在しない。公式 Playground では `TableActionMenuPlugin` がデフォルト装備。

**設計**:

- 公式 Lexical Playground の `TableActionMenuPlugin.tsx` パターンに準拠
- セル右クリック（またはセル選択時のフォーティングボタン）でコンテキストメニュー表示
- `@lexical/table` のユーティリティ関数を使用（`$getTableNodeFromLexicalNodeOrThrow` 等）

**提供操作**:
| 操作 | API |
|---|---|
| 上に行を挿入 | `$insertTableRow__EXPERIMENTAL` |
| 下に行を挿入 | `$insertTableRow__EXPERIMENTAL` |
| 左に列を挿入 | `$insertTableColumn__EXPERIMENTAL` |
| 右に列を挿入 | `$insertTableColumn__EXPERIMENTAL` |
| 行を削除 | `$deleteTableRow__EXPERIMENTAL` |
| 列を削除 | `$deleteTableColumn__EXPERIMENTAL` |
| セルを結合/分割 | `$mergeTableCells` / `$unmergeTableCell` |
| セル背景色変更 | `$setTableCellBackgroundColor` |

**実装ファイル**:

- `plugins/TableActionMenuPlugin.tsx` — 新規作成
- `LexicalEditor.tsx` — `<TableActionMenuPlugin anchorElem={anchorElem} />` を追加

### 1-2. TableCellResizerPlugin

**背景**: 公式 npm パッケージ `@lexical/react/LexicalTableCellResizerPlugin` として提供済み。追加のみで実装完了。

**実装**:

```tsx
// LexicalEditor.tsx に追加
import { TableCellResizerPlugin } from "@lexical/react/LexicalTableCellResizerPlugin";
// <TableCellResizerPlugin /> をプラグインリストに追加
```

**実装ファイル**: `LexicalEditor.tsx` のみ変更

### 1-3. InlineImageNode

**背景**: 現在の `ImageNode` はブロックレベル（段落占有）のみ。公式 Playground は `InlineImageNode` (float left/right でテキストと混在) を標準装備。用途: 記事内の小画像・アイコン的な使い方。

**ノード設計**:

```typescript
class InlineImageNode extends DecoratorNode<JSX.Element>
```

| State      | 型                            | デフォルト |
| ---------- | ----------------------------- | ---------- |
| `src`      | `string`                      | `''`       |
| `altText`  | `string`                      | `''`       |
| `position` | `'left' \| 'right' \| 'full'` | `'full'`   |
| `width`    | `number`                      | `200`      |

**DOM 出力**:

```html
<span data-inline-image data-position="left" style="width: 200px; float: left;">
  <img src="..." alt="..." />
</span>
```

**実装ファイル**:

- `nodes/InlineImageNode.tsx` — 新規作成
- `plugins/InlineImagePlugin.tsx` — 新規作成（画像選択ダイアログ）
- `inspectors/InlineImageInspector.tsx` — 新規作成
- `config/nodes.ts` — `InlineImageNode` を追加
- `config/insert-items.ts` — `inline-image` エントリを `media` カテゴリに追加

---

## Phase 2: レンタルスペース固有ブロック

すべて既存の複合ノードパターン（ElementNode + isShadowRoot + NodeState API + AccentColor）に完全準拠。

### 2-1. TestimonialNode（口コミ/レビュー）

**ユースケース**: 顧客レビューのカード型コンテンツ。引用テキストはエディタ内で直接編集可能。著者情報はインスペクターパネルで管理。

**ノード構造**:

```
TestimonialContainerNode extends ElementNode  // isShadowRoot: true
  States:
    - layout: 'list' | 'grid'  (default: 'grid')
    - columns: 1 | 2 | 3  (default: 2)
    - accentColor: AccentColor  (default: 'default')
  Can contain: TestimonialItemNode のみ
  collapseAtStart: コンテナを削除して通常段落に戻す

TestimonialItemNode extends ElementNode  // isShadowRoot: true
  States:
    - authorName: string  (default: '')
    - authorTitle: string  (default: '')
    - avatarUrl: string  (default: '')
    - rating: 1 | 2 | 3 | 4 | 5  (default: 5)
    - date: string  (default: '')
  Can contain: ParagraphNode（引用テキスト、エディタ内で直接編集）
  collapseAtStart: アイテムを削除、前のアイテムにフォーカス
```

**HTML 出力**:

```html
<div data-testimonial data-layout="grid" data-columns="2" data-color="default">
  <blockquote
    data-testimonial-item
    data-author-name="田中 様"
    data-author-title="ご利用企業"
    data-avatar-url="..."
    data-rating="5"
    data-date="2025-12-01"
  >
    <p>スペースが広く清潔で、設備も充実していました。</p>
    <!-- footer は JS/CSS で描画 -->
  </blockquote>
</div>
```

**実装ファイル**:

- `nodes/TestimonialNode.tsx` — 新規作成
- `plugins/TestimonialPlugin.tsx` — 新規作成
- `inspectors/TestimonialInspector.tsx` — 新規作成（コンテナ + アイテム）
- `config/nodes.ts` — 追加
- `config/insert-items.ts` — `layout` カテゴリに追加

### 2-2. FeatureIconListNode（設備・特徴アイコンリスト）

**ユースケース**: 設備・アメニティ・特徴をアイコン付きで表示するリスト。レンタルスペースの「キッチンあり」「プロジェクターあり」等。

**ノード構造**:

```
FeatureIconListContainerNode extends ElementNode  // isShadowRoot: true
  States:
    - columns: 1 | 2 | 3  (default: 2)
    - accentColor: AccentColor  (default: 'default')
    - iconSize: 'sm' | 'md' | 'lg'  (default: 'md')
    - showDescription: boolean  (default: true)

FeatureIconItemNode extends ElementNode  // isShadowRoot: true
  States:
    - iconName: string  (default: '')
    - iconLibrary: 'lucide' | 'simple-icons'  (default: 'lucide')
  Can contain: ParagraphNode × 1（タイトル）または × 2（タイトル + 説明）
  collapseAtStart: アイテムを削除
```

**アイコン選択**: 既存の Lucide + `@icons-pack/react-simple-icons` を再利用。
検索可能なアイコンピッカーダイアログを実装（インスペクターパネル内）。

**HTML 出力**:

```html
<ul
  data-feature-icon-list
  data-columns="2"
  data-color="default"
  data-icon-size="md"
>
  <li data-feature-icon-item data-icon-name="Wifi" data-icon-library="lucide">
    <p>無料 Wi-Fi</p>
    <p>最大 1Gbps の高速回線</p>
  </li>
</ul>
```

**実装ファイル**:

- `nodes/FeatureIconListNode.tsx` — 新規作成
- `plugins/FeatureIconListPlugin.tsx` — 新規作成
- `inspectors/FeatureIconListInspector.tsx` — 新規作成（アイコンピッカー含む）
- `config/nodes.ts` / `config/insert-items.ts` — 追加

### 2-3. CoverNode（背景画像＋テキストオーバーレイ）

**ユースケース**: スペース紹介ページのヒーロー的セクション。背景画像の上にタイトル・説明テキストを重ねて表示。

**ノード構造**:

```
CoverNode extends ElementNode  // isShadowRoot: true
  States:
    - backgroundImageUrl: string  (default: '')
    - overlayColor: AccentColor  (default: 'default')
    - overlayOpacity: 0 | 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80  (default: 40)
    - minHeight: 'sm' | 'md' | 'lg' | 'xl' | 'full'  (default: 'md')
      (sm=200px, md=300px, lg=400px, xl=500px, full=100vh)
    - contentAlign: 'left' | 'center' | 'right'  (default: 'center')
    - contentPosition: 'top' | 'center' | 'bottom'  (default: 'center')
  Can contain: HeadingNode + ParagraphNode（背景画像の上でエディタ内直接編集）
```

**DOM 設計**:

```html
<div
  data-cover
  data-overlay-color="default"
  data-overlay-opacity="40"
  data-min-height="md"
  data-content-align="center"
  data-content-position="center"
  style="background-image: url(...)"
>
  <!-- children: HeadingNode + ParagraphNode -->
</div>
```

背景画像は `updateDOM` で style 属性として更新。CSS は公開ページ側 (`public.css`) でも対応。

**実装ファイル**:

- `nodes/CoverNode.tsx` — 新規作成
- `plugins/CoverPlugin.tsx` — 新規作成（画像選択ダイアログを含む）
- `inspectors/CoverInspector.tsx` — 新規作成
- `config/nodes.ts` / `config/insert-items.ts` — 追加

---

## Phase 3: UX 改善

### 3-1. URL ペースト → Bookmark 自動変換

**背景**: Notion・Craft 等のモダンエディタの標準 UX。空行に URL を貼り付けると自動で OGP カード（BookmarkNode）に変換。

**実装設計**:

- `editor.registerCommand(PASTE_COMMAND, ...)` で URL テキストをインターセプト
- 判定条件:
  1. クリップボード内容が単一の URL 文字列（http/https）
  2. カーソルが空の段落上にある
- 条件合致 → `BookmarkNode` を挿入し、OGP フェッチ API を呼び出す
- 条件非合致 → デフォルトのペースト動作にフォールスルー

**実装ファイル**:

- `plugins/PasteUrlPlugin.tsx` — 新規作成
- `LexicalEditor.tsx` — `<PasteUrlPlugin />` を追加

### 3-2. CharacterLimitPlugin（インスタンス単位）

**背景**: SEO 用 meta description 入力欄など、文字数制限が必要なユースケースに対応。

**実装設計**:

- `LexicalEditor` の props に `characterLimit?: number` を追加
- `characterLimit` が指定された場合のみ `@lexical/react/LexicalCharacterLimitPlugin` をマウント
- UI: エディタ下部に残り文字数を表示（例: `87/160`）

**型変更**:

```typescript
// types.ts に追加
characterLimit?: number
```

**実装ファイル**:

- `LexicalEditor.tsx` — props 追加 + 条件付きプラグインマウント
- 既存の `types.ts` — `characterLimit` を追加

---

## 実装順序と依存関係

```
Phase 1
  └── 1-1 TableActionMenuPlugin    (独立)
  └── 1-2 TableCellResizerPlugin   (独立、1行追加のみ)
  └── 1-3 InlineImageNode          (独立)

Phase 2
  └── 2-1 TestimonialNode          (AccentColor, 複合ノードパターン)
  └── 2-2 FeatureIconListNode      (AccentColor, 複合ノードパターン)
  └── 2-3 CoverNode                (AccentColor, 複合ノードパターン)

Phase 3
  └── 3-1 PasteUrlPlugin           (BookmarkNode 依存 → Phase 1 完了後推奨)
  └── 3-2 CharacterLimitPlugin     (独立)
```

---

## 各フェーズの完了基準

| 確認事項             | コマンド                                    |
| -------------------- | ------------------------------------------- |
| 型エラーなし         | `bun run type-check`                        |
| Lint エラーなし      | `bun run validate`                          |
| Lexical パターン準拠 | `lexical-reviewer` エージェント             |
| ユニットテスト       | `test-writer` エージェント → `bun run test` |
| ビジュアル確認       | `playwright` ブラウザ確認                   |

---

## 破壊的変更サマリー

| 変更                                           | 影響                                                    |
| ---------------------------------------------- | ------------------------------------------------------- |
| 新規ノードの追加                               | 既存コンテンツへの影響なし                              |
| `LexicalEditor` props に `characterLimit` 追加 | 既存呼び出し元への影響なし（optional）                  |
| `TableCellResizerPlugin` 追加                  | テーブルの見た目に列幅リサイズ UI が追加                |
| URL ペーストの挙動変更                         | 空行でのURLペーストが Bookmark に変わる（意図的な変更） |

---

## 新規作成ファイル一覧（合計 ~20 ファイル）

```
nodes/
  InlineImageNode.tsx
  TestimonialNode.tsx
  FeatureIconListNode.tsx
  CoverNode.tsx

plugins/
  TableActionMenuPlugin.tsx
  InlineImagePlugin.tsx
  TestimonialPlugin.tsx
  FeatureIconListPlugin.tsx
  CoverPlugin.tsx
  PasteUrlPlugin.tsx

inspectors/
  InlineImageInspector.tsx
  TestimonialInspector.tsx          (Container + Item の 2 パネル)
  FeatureIconListInspector.tsx      (Container + Item の 2 パネル)
  CoverInspector.tsx

__tests__/
  InlineImageNode.test.ts
  TestimonialNode.test.ts
  FeatureIconListNode.test.ts
  CoverNode.test.ts
```

**変更ファイル**:

```
config/nodes.ts          (4 ノード追加)
config/insert-items.ts   (4 エントリ追加)
LexicalEditor.tsx        (3 プラグイン追加, props 拡張)
```
