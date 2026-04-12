# エディタサイドパネルのインラインレイアウト化

> 記事設定パネルをブロック設定パネルと横並び配置に変更

## 概要

現状、記事設定パネル（UnifiedSidePanel / SidePanelShell）は `fixed right-0` のオーバーレイで、ブロック設定パネル（InspectorSidebar）に重なる。これを、デスクトップでは両パネルを**横並びインライン配置**に変更する。

目標レイアウト（デスクトップ、両パネル開）:

```
┌─────────────────────────────────────────────────────────────┐
│ EditorHeader (h-14, fixed)                                  │
├─────────────────────┬────────────────┬──────────────────────┤
│                     │                │                      │
│  本文エディタ       │ ブロック設定   │ 記事設定             │
│  (flex-1, min-w-0)  │ 420px          │ 420px                │
│                     │ (InlineEditor) │ (UnifiedSidePanel)   │
│                     │                │                      │
└─────────────────────┴────────────────┴──────────────────────┘
```

モバイル（< 1024px）は現状維持（両パネルともオーバーレイ）。

## スコープ

- **変更**: `InlineEditorShell.tsx`, `SidePanelShell.tsx`
- **変更なし**: `UnifiedSidePanel.tsx`, `PostEditor.tsx`, `NewsEditor.tsx`, `TermsInlineEditor.tsx`, `FaqItemInlineEditor.tsx`, `LexicalEditor.tsx`, `InspectorSidebar.tsx`
- **削除**: `SIDE_PANEL_WIDTH` 定数（後方互換なし）

## 現状の問題

### 1. `SIDE_PANEL_WIDTH` を使った幅計算が破綻する

`InlineEditorShell.tsx:61-64` で `isDesktop && isPanelOpen` のとき `calc(100% - 420px)` を記事設定用に確保する。しかし `LexicalEditor` 内の `InspectorSidebar`（420px）は別枠で常に存在するため、記事設定パネルは結局 `InspectorSidebar` の上に重なる。

### 2. `SidePanelShell` が `fixed right-0`

デスクトップでも `fixed` 配置のため、flex レイアウトに参加できない。`z-[editorSidePanel]` で InspectorSidebar の前面に乗る。

## 変更内容

### 1. `SidePanelShell.tsx` をインラインパネル化

**現状（fixed 配置）:**

```tsx
const styles = tv({
  slots: {
    overlay: ["fixed inset-0 z-[overlay] bg-overlay-light ...", "lg:hidden"],
    panel: ["fixed right-0 z-[editorSidePanel] bg-background border-l", ...],
  },
  variants: {
    isFullscreen: {
      true: { panel: "top-14 h-[calc(100vh-3.5rem)]" },
      false: { panel: "top-16 h-[calc(100vh-4rem)]" },
    },
  },
});
```

**変更後（レスポンシブ切替）:**

```tsx
const styles = tv({
  slots: {
    // モバイル: 従来のオーバーレイ / デスクトップ: 非表示
    overlay: [
      "fixed inset-0 z-[overlay] bg-overlay-light transition-opacity duration-300",
      "lg:hidden",
    ],
    // パネル本体
    panel: [
      "bg-background border-l flex flex-col",
      // モバイル: fixed オーバーレイ
      "fixed right-0 z-[editorSidePanel] transform transition-transform duration-300 ease-in-out",
      "w-full sm:w-[420px]",
      // デスクトップ: インライン flex 子（InlineEditorShell の flex コンテナ内）
      "lg:static lg:z-auto lg:translate-x-0 lg:transform-none lg:w-[420px] lg:shrink-0 lg:transition-none",
    ],
    header: "flex items-center justify-between p-4 border-b flex-shrink-0",
    title: "text-lg font-semibold",
    content: "flex-1 overflow-y-auto p-4",
  },
  variants: {
    isOpen: {
      true: {
        overlay: "opacity-100",
        panel: "translate-x-0",
      },
      false: {
        overlay: "opacity-0 pointer-events-none",
        // モバイル: スライドアウト / デスクトップ: display: none
        panel: "translate-x-full lg:hidden",
      },
    },
    width: {
      default: { panel: "lg:w-[420px]" },
      narrow: { panel: "lg:w-96" },
    },
    isFullscreen: {
      // モバイル top 位置制御（デスクトップでは無関係）
      true: { panel: "top-14 h-[calc(100vh-3.5rem)] lg:top-auto lg:h-auto" },
      false: { panel: "top-16 h-[calc(100vh-4rem)] lg:top-auto lg:h-auto" },
    },
  },
});
```

**重要ポイント:**

- `lg:static` でデスクトップは fixed → 静的配置に切替
- `lg:hidden` を `isOpen: false` のデスクトップに適用（非表示）
- `lg:translate-x-0 lg:transform-none` でモバイル用スライドアニメをデスクトップで無効化
- `lg:top-auto lg:h-auto` でモバイル用 top/height をデスクトップで解除（flex 親から高さ取得）

### 2. `InlineEditorShell.tsx` の幅計算を削除

**現状:**

```tsx
import { SIDE_PANEL_WIDTH } from "./SidePanelShell";
import { useMediaQuery } from "@/shared/hooks";

const isDesktop = useMediaQuery("(min-width: 1024px)");
const editorWidth =
  isDesktop && isPanelOpen
    ? `calc(100% - ${SIDE_PANEL_WIDTH.default}px)`
    : "100%";

return (
  <form className="h-screen flex flex-col pt-14">
    {header}
    <div className="flex flex-1 overflow-hidden">
      <div
        className="h-full overflow-auto transition-[width] duration-300"
        style={{ width: editorWidth }}
      >
        {children}
      </div>
      {panel}
    </div>
  </form>
);
```

**変更後:**

```tsx
return (
  <form className="h-screen flex flex-col pt-14">
    {header}
    <div className="flex flex-1 overflow-hidden">
      <div className="flex-1 min-w-0 h-full overflow-auto">{children}</div>
      {panel}
    </div>
  </form>
);
```

**削除:**

- `SIDE_PANEL_WIDTH` の import
- `useMediaQuery` の import と `isDesktop` 変数
- `editorWidth` の計算
- `isPanelOpen` prop（後方互換なし - 呼び出し元から prop を削除）
- `transition-[width] duration-300` アニメーション（flex-1 に統一されるため不要）

**理由:** `SidePanelShell` の `lg:static` + `lg:hidden`（非表示時）により、flex レイアウトが自動的に適切な幅を計算する。

### 3. `SIDE_PANEL_WIDTH` 定数の削除

`SidePanelShell.tsx:115-118` と `editor/inline/index.ts:36` の export を削除。

```diff
- export const SIDE_PANEL_WIDTH = {
-   default: 420,
-   narrow: 384,
- } as const;
```

### 4. 呼び出し元から `isPanelOpen` を削除

`PostEditor.tsx`, `NewsEditor.tsx`, `TermsInlineEditor.tsx`, `FaqItemInlineEditor.tsx` で `<InlineEditorShell isPanelOpen={...}>` を渡している場合、削除する。

## 影響範囲

| ファイル                                                 | 変更内容                                        |
| -------------------------------------------------------- | ----------------------------------------------- |
| `_shared/components/editor/inline/SidePanelShell.tsx`    | tv スタイル修正、`SIDE_PANEL_WIDTH` 削除        |
| `_shared/components/editor/inline/InlineEditorShell.tsx` | `editorWidth` 計算削除、`isPanelOpen` prop 削除 |
| `_shared/components/editor/inline/index.ts`              | `SIDE_PANEL_WIDTH` export 削除                  |
| `posts/_components/PostEditor.tsx`                       | `isPanelOpen` prop 削除                         |
| `news/_components/NewsEditor.tsx`                        | `isPanelOpen` prop 削除                         |
| `terms/_components/TermsInlineEditor.tsx`                | `isPanelOpen` prop 削除（渡していれば）         |
| `faq/_components/FaqItemInlineEditor.tsx`                | `isPanelOpen` prop 削除（渡していれば）         |

## CommentPanel について

PostEditor / NewsEditor では `CommentPanel` も `panel` slot に渡されている。`CommentPanel` は独自の `fixed` 配置なので、そのままだと InspectorSidebar と重なる。

**推奨:** CommentPanel も `SidePanelShell` ベースに統一、または同じ `lg:static` パターンに変更する。ただし**本計画のスコープ外**とし、CommentPanel は当面現状維持（既知の制限として記録）。

## Z-index 整理

`Z_INDEX.editorSidePanel` はモバイルのみで使用されるようになる。デスクトップは flex レイアウトなので z-index 不要。定数自体は削除しない（モバイルで必要）。

## テスト

自動テストなし（ビジュアルレイアウト変更のため）。以下を手動確認:

1. **デスクトップ（≥ 1024px）**:
   - 記事設定を開く → エディタ本文が縮み、InspectorSidebar と記事設定が横並びに
   - 記事設定を閉じる → エディタ本文が広がる
   - InspectorSidebar を折りたたむ / 展開する → レイアウト追従
2. **モバイル（< 1024px）**:
   - 記事設定を開く → オーバーレイで表示（従来通り）
   - InspectorSidebar は MobileEditorFallback により非表示
3. **影響ページ**:
   - `/admin/posts/[id]`
   - `/admin/news/[id]`
   - `/admin/terms/[id]/edit`
   - `/admin/faq/items/[id]/edit`
4. **検証**: `bun run validate && bun run build`

## 非目標

- CommentPanel の同様化（別タスク）
- ブロック設定 / 記事設定 / コメントの3パネル同時対応
- パネル幅のユーザーカスタマイズ
- パネル順序の入れ替え

## 後方互換性

**破壊的変更**:

- `SIDE_PANEL_WIDTH` 定数が削除される
- `InlineEditorShell` から `isPanelOpen` prop が削除される

プロジェクト外で使われていないことを前提とする（内部モジュール）。
