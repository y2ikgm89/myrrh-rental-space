# エディタサイドパネルのインラインレイアウト化 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** デスクトップ（≥1024px）で記事設定パネルをブロック設定パネル（InspectorSidebar）と横並びインライン配置にする

**Architecture:** `SidePanelShell` を `lg:static` + `lg:shrink-0` ベースに変更し、`InlineEditorShell` の `editorWidth` 計算を削除して `flex-1 min-w-0` に統一する。モバイル（<1024px）は既存の fixed オーバーレイ動作を維持。`SIDE_PANEL_WIDTH` 定数と `isPanelOpen` prop は削除（後方互換なし）。

**Tech Stack:** React 19 / tailwind-variants / Tailwind CSS 4 / Next.js 16

**Spec:** `docs/superpowers/specs/2026-04-12-editor-side-panel-inline-layout.md`

---

## ファイルマップ

| 操作   | パス                                                                                       | 責務                                              |
| ------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| Modify | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/SidePanelShell.tsx`    | `lg:static` インライン化、`SIDE_PANEL_WIDTH` 削除 |
| Modify | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/InlineEditorShell.tsx` | `editorWidth` 計算と `isPanelOpen` prop 削除      |
| Modify | `src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/index.ts`              | `SIDE_PANEL_WIDTH` export 削除                    |
| Modify | `src/app/(admin)/admin/(dashboard)/posts/_components/PostEditor.tsx`                       | `isPanelOpen={...}` 削除                          |
| Modify | `src/app/(admin)/admin/(dashboard)/news/_components/NewsEditor.tsx`                        | `isPanelOpen={...}` 削除                          |
| Modify | `src/app/(admin)/admin/(dashboard)/terms/_components/TermsInlineEditor.tsx`                | `isPanelOpen={...}` 削除                          |
| Modify | `src/app/(admin)/admin/(dashboard)/faq/_components/FaqItemInlineEditor.tsx`                | `isPanelOpen={...}` 削除                          |

**ベースパス（以降 `L/` と略記）:** `src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline`

---

### Task 1: SidePanelShell をインラインパネル化

**Files:**

- Modify: `L/SidePanelShell.tsx`

- [ ] **Step 1: SidePanelShell.tsx の tv スタイルを書き換え**

`styles` の `slots.panel` と `variants` を以下に置き換える。

Before (lines 20-59):

```typescript
const styles = tv({
  slots: {
    overlay: [
      `fixed inset-0 z-[${Z_INDEX.overlay}] bg-overlay-light transition-opacity duration-300`,
      "lg:hidden", // デスクトップではオーバーレイなし
    ],
    panel: [
      `fixed right-0 z-[${Z_INDEX.editorSidePanel}] bg-background border-l`,
      "transform transition-transform duration-300 ease-in-out",
      "flex flex-col",
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
        panel: "translate-x-full",
      },
    },
    width: {
      default: { panel: "w-full sm:w-[420px]" },
      narrow: { panel: "w-full sm:w-96" },
    },
    isFullscreen: {
      true: { panel: "top-14 h-[calc(100vh-3.5rem)]" }, // EditorHeader(h-14=56px)の下
      false: { panel: "top-16 h-[calc(100vh-4rem)]" }, // TopBar(h-16=64px)の下
    },
  },
  defaultVariants: {
    width: "default",
    isFullscreen: false,
  },
});
```

After:

```typescript
const styles = tv({
  slots: {
    // モバイルのみオーバーレイ（デスクトップでは lg:hidden）
    overlay: [
      `fixed inset-0 z-[${Z_INDEX.overlay}] bg-overlay-light transition-opacity duration-300`,
      "lg:hidden",
    ],
    // パネル本体
    // モバイル: fixed オーバーレイ（従来通り）
    // デスクトップ: lg:static で flex 子要素として配置
    panel: [
      "bg-background border-l flex flex-col",
      // モバイル用
      `fixed right-0 z-[${Z_INDEX.editorSidePanel}]`,
      "transform transition-transform duration-300 ease-in-out",
      "w-full sm:w-[420px]",
      // デスクトップ用オーバーライド
      "lg:static lg:z-auto lg:shrink-0 lg:transform-none lg:transition-none",
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
        // モバイル: スライドアウト、デスクトップ: 非表示
        panel: "translate-x-full lg:hidden",
      },
    },
    width: {
      default: { panel: "lg:w-[420px]" },
      narrow: { panel: "lg:w-96" },
    },
    isFullscreen: {
      // モバイルのみ top/height 制御、デスクトップは flex 親から高さ取得
      true: { panel: "top-14 h-[calc(100vh-3.5rem)] lg:top-auto lg:h-auto" },
      false: { panel: "top-16 h-[calc(100vh-4rem)] lg:top-auto lg:h-auto" },
    },
  },
  defaultVariants: {
    width: "default",
    isFullscreen: false,
  },
});
```

- [ ] **Step 2: `SIDE_PANEL_WIDTH` 定数を削除**

ファイル末尾（line 114-118）の以下を削除:

```typescript
/** サイドパネルの幅定数（コンテンツ側のマージン調整用） */
export const SIDE_PANEL_WIDTH = {
  default: 420,
  narrow: 384, // 96 * 4 = 384px (w-96)
} as const;
```

- [ ] **Step 3: コミット（検証は Task 8 で一括実施）**

```bash
git add 'src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/SidePanelShell.tsx'
git commit -m "refactor(editor): make SidePanelShell inline flex child on desktop"
```

---

### Task 2: InlineEditorShell の editorWidth 計算を削除

**Files:**

- Modify: `L/InlineEditorShell.tsx`

- [ ] **Step 1: InlineEditorShell.tsx を書き換え**

ファイル全体を以下に置き換える:

```typescript
"use client";

/**
 * InlineEditorShell
 *
 * インラインエディタの共通レイアウトシェル
 * - フルスクリーンモード管理
 * - キーボードショートカット（Ctrl+S）
 * - 離脱警告
 * - レイアウト（ヘッダー + エディタ + サイドパネル横並び）
 *
 * デスクトップ（≥1024px）では `panel` は flex 子要素としてインライン配置。
 * モバイル（<1024px）では `panel` 側（SidePanelShell）が fixed オーバーレイに切替。
 */

import type { FormEvent, ReactNode } from "react";
import {
  useFullscreenMode,
  useKeyboardShortcuts,
  useBeforeUnload,
} from "./hooks";

type InlineEditorShellProps = {
  /** フォーム送信ハンドラ */
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  /** Ctrl+S で呼ばれる保存ハンドラ */
  onSave?: () => void;
  /** 未保存の変更があるか */
  isDirty?: boolean;
  /** ヘッダー部分 */
  header: ReactNode;
  /** メインコンテンツ（LexicalEditor等） */
  children: ReactNode;
  /** サイドパネル（設定/コメント） */
  panel?: ReactNode;
};

export function InlineEditorShell({
  onSubmit,
  onSave,
  isDirty = false,
  header,
  children,
  panel,
}: InlineEditorShellProps) {
  // フルスクリーンモード（サイドバー・ヘッダー非表示）
  useFullscreenMode();

  // キーボードショートカット
  useKeyboardShortcuts(onSave ? { onSave } : {});

  // 離脱警告
  useBeforeUnload({ isDirty });

  return (
    <form onSubmit={onSubmit} className="h-screen flex flex-col pt-14">
      {/* ヘッダー（固定） */}
      {header}

      {/* メインエリア（エディタ + パネル） */}
      <div className="flex flex-1 overflow-hidden">
        {/* エディタ領域（伸縮） */}
        <div className="flex-1 min-w-0 h-full overflow-auto">{children}</div>

        {/* サイドパネル
            デスクトップ: SidePanelShell の lg:static により flex 子要素
            モバイル: SidePanelShell の fixed オーバーレイ（flex レイアウト外） */}
        {panel}
      </div>
    </form>
  );
}
```

**削除される要素:**

- `import { SIDE_PANEL_WIDTH } from "./SidePanelShell"`
- `import { useMediaQuery } from "@/shared/hooks"`
- `isPanelOpen?: boolean` prop と `isPanelOpen = false` デフォルト
- `const isDesktop = useMediaQuery("(min-width: 1024px)")`
- `const editorWidth = ...`
- `style={{ width: editorWidth }}` と `transition-[width] duration-300`

- [ ] **Step 2: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/InlineEditorShell.tsx'
git commit -m "refactor(editor): remove editorWidth calculation from InlineEditorShell"
```

---

### Task 3: barrel export から SIDE_PANEL_WIDTH を削除

**Files:**

- Modify: `L/index.ts`

- [ ] **Step 1: index.ts から `SIDE_PANEL_WIDTH` を削除**

Before (line 36):

```typescript
export { SidePanelShell, SIDE_PANEL_WIDTH } from "./SidePanelShell";
```

After:

```typescript
export { SidePanelShell } from "./SidePanelShell";
```

- [ ] **Step 2: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/index.ts'
git commit -m "refactor(editor): remove SIDE_PANEL_WIDTH from barrel export"
```

---

### Task 4: PostEditor から isPanelOpen を削除

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/posts/_components/PostEditor.tsx`

- [ ] **Step 1: `isPanelOpen={editor.isPanelOpen}` 行を削除**

line 201 の以下を削除:

```typescript
      isPanelOpen={editor.isPanelOpen}
```

変更後（lines 197-204）:

```typescript
  return (
    <InlineEditorShell
      onSubmit={editor.form.handleSubmit(editor.onSubmit)}
      onSave={editor.handleSave}
      isDirty={editor.isDirty}
      header={
        <EditorHeader
```

- [ ] **Step 2: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/posts/_components/PostEditor.tsx'
git commit -m "refactor(posts): drop isPanelOpen prop from InlineEditorShell usage"
```

---

### Task 5: NewsEditor から isPanelOpen を削除

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/news/_components/NewsEditor.tsx`

- [ ] **Step 1: `isPanelOpen={editor.isPanelOpen}` 行を削除**

line 137 の以下を削除:

```typescript
      isPanelOpen={editor.isPanelOpen}
```

- [ ] **Step 2: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/news/_components/NewsEditor.tsx'
git commit -m "refactor(news): drop isPanelOpen prop from InlineEditorShell usage"
```

---

### Task 6: TermsInlineEditor から isPanelOpen を削除

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/terms/_components/TermsInlineEditor.tsx`

- [ ] **Step 1: `isPanelOpen={isSidePanelOpen}` 行を削除**

line 656 の以下を削除:

```typescript
isPanelOpen = { isSidePanelOpen };
```

- [ ] **Step 2: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/terms/_components/TermsInlineEditor.tsx'
git commit -m "refactor(terms): drop isPanelOpen prop from InlineEditorShell usage"
```

---

### Task 7: FaqItemInlineEditor から isPanelOpen を削除

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/faq/_components/FaqItemInlineEditor.tsx`

- [ ] **Step 1: `isPanelOpen={isSidePanelOpen}` 行を削除**

line 339 の以下を削除:

```typescript
isPanelOpen = { isSidePanelOpen };
```

- [ ] **Step 2: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/faq/_components/FaqItemInlineEditor.tsx'
git commit -m "refactor(faq): drop isPanelOpen prop from InlineEditorShell usage"
```

---

### Task 8: validate + build 検証

- [ ] **Step 1: validate 実行**

Run: `bun run validate`
Expected: type-check + lint ともにエラーなし。`SIDE_PANEL_WIDTH` や `isPanelOpen` の未使用 import／未使用変数が残っていないことを確認する。

- [ ] **Step 2: build 実行**

Run: `bun run build:skip-env`
Expected: ビルド成功

- [ ] **Step 3: 自動修正が入った場合のみコミット**

validate / build のフック（Prettier / ESLint --fix）で変更が発生した場合のみ:

```bash
git add -A
git commit -m "fix(editor): address lint/format issues from inline panel refactor"
```
