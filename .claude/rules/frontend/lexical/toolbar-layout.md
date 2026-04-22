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
