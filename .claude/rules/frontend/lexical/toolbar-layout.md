---
description: Lexical エディタレイアウト（DraggableBlock・プレースホルダー・Floating Toolbar 責務分離・グループ化操作）
paths:
  - "src/shared/lib/lexical/**"
  - "src/**/editor/**"
  - "src/**/*lexical*"
  - "src/app/(admin)/**/lexical/**"
---

# Lexical ツールバー・レイアウトパターン

## LexicalEditor（メイン）のレイアウト・DraggableBlock・プレースホルダー

[Lexical React 公式](https://lexical.dev/docs/getting-started/react) では **`ContentEditable` に `placeholder` を渡す**。`@lexical/react` の [`ContentEditable` 実装](https://github.com/facebook/lexical/blob/main/packages/lexical-react/src/LexicalContentEditable.tsx) では、プレースホルダーは **編集ルートの兄弟ノード**として描画されるため、`ContentEditable` に付けた `prose` / `prose-p:leading-relaxed` は **プレースホルダーには継承されない**。本文と揃えるには `LexicalEditor.tsx` 側で **`text-base leading-relaxed lg:text-lg`** 等を明示する（`top-6` / `left-10` は `py-6` / `pl-10` と一致）。

### レイアウト定数（単一正本）

| ファイル                     | 内容                                                                                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `editor-layout-constants.ts` | `EDITOR_PADDING_LEFT`（40）、`EDITOR_PADDING_RIGHT`（24）、`EDITOR_PADDING_HORIZONTAL`（64）。`LexicalEditor` の `ContentEditable` の `pl-10` / `pr-6` と **同値**に保つ。 |

`contentWidth` の `maxWidth` は `contentWidth + EDITOR_PADDING_HORIZONTAL` で計算する（`CLAUDE.md` のコンテンツ幅節と同じ）。

### DraggableBlockPlugin（ローカルフォーク）

`@lexical/react` の `DraggableBlockPlugin_EXPERIMENTAL` は内部で固定パディング（例: `TEXT_BOX_HORIZONTAL_PADDING = 28`）を使う。当プロジェクトの **左 40px / 右 24px** と一致しないため、**`plugins/lexical-draggable-block-plugin.ts` にフォーク**し、`editor-layout-constants` と `getBlockLineHeightPx`（unitless `line-height` 対応）を組み込む。メインエディタは **`plugins/DraggableBlockPlugin.tsx` 経由のみ** — **`@lexical/react/LexicalDraggableBlockPlugin` を直接 import しない**。

- ドラッグ UI の横位置はフォークが付与する **`transform` のみ**。メニュー／ドロップライン用 DOM に **`left-*` を重ねない**（`left-1` + `translate` や `left-6` + `translate` は二重オフセットになる）。
- `@lexical/react` を上げたら **`node_modules/.../LexicalDraggableBlockPlugin` と差分マージ**し、必要ならフォークを更新する。
- `eslint.config.mjs` の `lexical-draggable-fork` が当該ファイル用のルール緩和を担う。フォークを大きく変えたら **要否を再確認**する。

### エディタ外枠 chrome — フル画面は `flush`、埋め込みは角丸カード

`LexicalEditor` の外枠 `div` は既定で `border border-border rounded-lg overflow-hidden`（角丸カード）。**`flush` prop（`LexicalEditorProps.flush`）で角丸・枠線を外し edge-to-edge** にできる。判定:

- **フル画面インライン編集（`InlineEditorShell` 配下 = Post / News）は `flush` 必須** — 画面全幅・全高で表示されるため、角丸カードだと四角い `EditorHeader` 直下で上部左右が内側にカーブし不格好（`overflow-hidden` が全幅ツールバー上部をクリップ）。
- **タブ/ダイアログ・フォーム内の埋め込み（Events / Spaces / Pages / Terms の `<Card>` 内）は既定（`flush` 無し）** — 角丸カードで「ここが本文編集領域」と視覚的に区切る（WordPress / Sanity 標準）。
- `isFullscreen` 時は `flush` の有無に関わらず `rounded-none border-0`（既存挙動）。

新規にエディタを配置するときは「フル画面か埋め込みか」で `flush` を選ぶ（参照: `PostEditor` / `NewsEditor` が `flush`、`TermsForm` / `SpaceEditForm` / `EventPublishFields` が既定）。

### 右パネル（Inspector / Comment 等）は in-flow 帯で統一

エディタ右の追加パネルは **`InspectorSidebar` と同じ in-flow `<aside>` モデルに揃える**（fixed オーバーレイ禁止）。共通契約:

- `shrink-0 h-full min-h-0`（ツールバー下〜カード下端の同じ帯。fixed `top-16` でビューポート全高に被せると Inspector と高さ不一致になる）
- 展開幅 `w-[420px]`、`border-l border-border`、ヘッダーは `border-b px-2 py-1.5 text-xs`（Inspector と同帯様式）
- 開閉は `transition-[width]`（0↔420px）でスライド感を出す。閉時は **`inert`** で focusable 子への Tab 漏れを防ぐ（→ `frontend/accessibility/focus-keyboard.md`）
- **`trailingPanel` は `EditorInner` 内＝`LexicalComposer` 配下で描画される** ため、パネル側で `useLexicalComposerContext()` を呼びコマンドを直接 dispatch できる（新規 prop 不要）。`CommentPanel` の本文マーク同期（`SCROLL_TO_MARK_COMMAND`）がこの経路を使う

参照実装: `comment-panel/CommentPanel.tsx`（Google Docs 型コメントパネル）。新規右パネルは本契約を踏襲し、独自の fixed overlay を作らない。

### メイン toolbar 外枠は CSS Grid `[1fr_auto_1fr]`（中央配置 + 右固定）

`ToolbarPlugin` の外枠は「左 spacer + 中央ツール群 + 右 InspectorControls」の 3 列構成。**flex 3-spacer は禁止**（右 spacer 内に `shrink-0` な InspectorControls を持つと min-content が圧縮できず、中央の `max-w-full` と衝突して overlap する silent bug）。canonical:

```tsx
// OK: CSS Grid で 3 列を物理分離（WordPress Gutenberg / Notion 同型）
<div
  role="toolbar"
  className="grid min-h-10 min-w-0 grid-cols-[1fr_auto_1fr] items-stretch border-b border-border bg-muted/40"
>
  <div aria-hidden="true" />
  <div className="flex min-w-0 max-w-full items-center justify-center gap-0.5 overflow-x-auto scrollbar-hide">
    {/* tools */}
  </div>
  <div className="flex items-center justify-end">
    <InspectorControls ... />
  </div>
</div>
```

- `1fr / auto / 1fr` で左右余白を等分、中央は intrinsic content + `overflow-x-auto`
- 中央 `min-w-0` が grid track の min-content を 0 に下げ、超過時は内部 horizontal scroll に逃がす
- 右 InspectorControls は `auto` track で固定幅維持（侵食されない）

**禁止**: `<div className="flex ...">` + `<div className="flex-1 basis-0 shrink" />` × 2 で挟む構成（中央 `max-w-full` と右 `shrink-0` 子の min が衝突して overlap）。

## Floating Toolbar 責務分離（Text FT / Block FT）

公開 API は**2 種類のフローティングツールバーに責務分離**する（WordPress Gutenberg 流の UX と Lexical 公式 `FloatingTextFormatToolbarPlugin` パターンを両立させるための設計）。

| プラグイン                            | 表示条件                               | 責務                                                                  |
| ------------------------------------- | -------------------------------------- | --------------------------------------------------------------------- |
| `FloatingTextFormatToolbarPlugin`     | 単一 top-level ブロック内の range 選択 | インラインフォーマット（bold / italic / link / color / font-size 等） |
| `FloatingBlockSelectionToolbarPlugin` | 複数 top-level ブロックを跨ぐ範囲選択  | ブロックレベル操作（グループ化 / 将来: Callout / Collapsible 変換）   |

**排他制御の SSoT**: `lexical/lib/selection-helpers.ts` の **`$isMultiBlockSelection()`**。両 FT の `updatePopup` で判定し、

- Text FT: `$isMultiBlockSelection()` が `true` のとき `setIsText(false)` で非表示
- Block FT: `$isMultiBlockSelection()` が `true` のときのみ `setIsMultiBlock(true)` で表示

**`$getSelectionBlockNodes()` も同ファイルの正本**。`GroupPlugin` など、選択の「ブロック粒度」を取得が必要なプラグインは **必ずこのヘルパー経由**（ローカル再実装禁止）。アルゴリズムは WordPress Gutenberg の `getCommonRootClientID` 相当で、**deepest common ancestor の直接 block-level 子**を返す。Group ネストに自動対応する（Root 直下選択 → Root 子、Group 内選択 → Group 子）。

### Floating Toolbar 位置計算と scroller 制約（`setFloatingElemPosition` SSoT）

両 FT が共有する `floating-toolbar/positioning.ts` の `setFloatingElemPosition` は以下の規律で実装する:

1. **scroller 有効幅は `clientWidth` で取得** — `getBoundingClientRect().width` は vertical scrollbar 幅 (~17px) を含むため、`overflow-y: auto` でスクロールバーが出る長文編集中は floating toolbar 右端がバー裏に隠れる silent bug の原因になる。`scrollerElem.clientWidth` (scrollbar / border 除外) を maxWidth 上限と右 clamp の両方で使う
2. **`floatingElem.style.maxWidth` は計測前に確定** — `clientWidth - (horizontalOffset * 2 + 4)` で設定。`+4` は `shadow-lg` の visual はみ出し許容。設定後に `getBoundingClientRect()` を取って left/top を計算する
3. **wrapper は `flex flex-wrap`** — natural width が maxWidth を超えた場合に自動多段化（Notion / Google Docs 同 UX）。`flex` 単独だとアイテムが overflow して clip される

```typescript
// canonical
const scrollerInnerWidth = scrollerElem.clientWidth;
const scrollerInnerRight = editorScrollerRect.left + scrollerInnerWidth;
const safetyBuffer = horizontalOffset * 2 + 4;
floatingElem.style.maxWidth = `${Math.max(0, scrollerInnerWidth - safetyBuffer)}px`;

const floatingElemRect = floatingElem.getBoundingClientRect();
// ... position 計算 ...

if (left + floatingElemRect.width > scrollerInnerRight) {
  left = scrollerInnerRight - floatingElemRect.width - horizontalOffset;
}
```

**禁止**:

- 右 clamp で `editorScrollerRect.right`（scrollbar 込み）を使う（scrollbar 幅だけ右端が見切れる）
- `flex-wrap` なし wrapper で多数アイテム配置（scroller 幅超過時 horizontal clip）
- `maxWidth` 設定を `getBoundingClientRect()` 後に行う（rect が古い値で clamp 計算が破綻）

### グループ化操作のエントリポイント（WordPress Gutenberg reference 準拠）

すべて **`OPEN_GROUP_DIALOG_COMMAND` 経由**で装飾バリアント選択ダイアログを開く（作成時スタイル固定の silent default 禁止）:

1. **Insert メニュー / スラッシュコマンド** — `INSERT_ITEMS` の `group` エントリがダイアログを起動
2. **`FloatingBlockSelectionToolbarPlugin`** — 複数ブロック選択時にツールバーで「グループ化」ボタン → ダイアログ起動
3. **`DraggableBlockPlugin` の ⋮⋮ メニュー** — 単一ブロックを「グループで囲む」→ ダイアログ起動（`targetNodeKeys: [nodeKey]`）
4. **キーボードショートカット** — `Ctrl+Shift+G` でダイアログ起動、`Ctrl+Shift+Alt+G` で現在のグループを解除

**コマンド 3 種**:

| コマンド                    | payload                                   | 役割                                                                                                                                                                               |
| --------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPEN_GROUP_DIALOG_COMMAND` | `{ targetNodeKeys? }`                     | 全 UI 経路の共通入口。ダイアログを開く前に呼び出し側で `$getSelectionBlockNodes()` のキーをスナップショット（ダイアログフォーカスで editor の選択が失われるため必須）              |
| `INSERT_GROUP_COMMAND`      | `{ groupStyle, color?, targetNodeKeys? }` | ダイアログ確定時 or code path から直接ラップ。`targetNodeKeys` 指定時は選択無視、未指定かつ選択ブロックがあればそれをラップ、選択なしなら空 Group を最近接ルートに挿入             |
| `UNGROUP_GROUP_COMMAND`     | `{ targetNodeKey? }`                      | `targetNodeKey` 指定時はそれを解除、未指定時は `$findMatchingParent($isGroupNode)` で選択中の最も近い Group を解除。全子ノードを順序保持で親階層に展開（Gutenberg の unwrap 相当） |

**選択スナップショット必須パターン**: Insert / FT / Keyboard いずれも `editor.dispatchCommand(OPEN_GROUP_DIALOG_COMMAND, ...)` を呼ぶ前に `editor.getEditorState().read(() => $getSelectionBlockNodes())` で現在の block node キーを取得し、`targetNodeKeys` に積むこと。ダイアログが開いた後は focus が editor から離れるため `$getSelection()` 由来の情報は失われる。

**Unwrap SSoT**: `$ungroupNode(group)`（`nodes/GroupNode.tsx` で export）。`UNGROUP_GROUP_COMMAND` ハンドラと `GroupNode.collapseAtStart()`（Backspace at start）の両方から呼ばれる単一実装。旧 `collapseAtStart` の「1 番目の子だけ paragraph に flatten」する lossy 実装は廃止。

**ネスト許可**（WordPress Gutenberg 互換）: Group 内での更に内側 Group 作成、複数 Group の outer Group ラップ、いずれも可能。二重ネスト防止チェックは設けない（Gutenberg と同じく運用者が構造を制御する設計）。
