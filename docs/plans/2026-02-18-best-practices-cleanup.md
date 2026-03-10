# Best Practices Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** コードベース全体から `console.error` / `useMemo` の不要使用 / 陳腐化した JSDoc コメントを除去し、プロジェクトルール（`error-handling.md`, `react-patterns.md`, `implementation-quality.md`）に完全準拠させる。

**Architecture:** 破壊的変更を許可。後方互換性ハック不要。すべての `console.error` を `logger.error`（`@/shared/lib/logger`）に置換し、不要な `useMemo` を削除し、誤ったコメントを修正する。各タスクは独立した単一変更＋即時 `bun run type-check` 検証で進める。

**Tech Stack:** TypeScript 6.0-beta, React 19.2 + React Compiler 1.0, Next.js 16, Bun 1.3.x

---

## 違反一覧

| ファイル                    | 行  | 違反                                                             | 対応             |
| --------------------------- | --- | ---------------------------------------------------------------- | ---------------- |
| `use-editor-core.ts`        | 7   | 陳腐化 JSDoc `（useCallback使用）`                               | コメント修正     |
| `LexicalEditor.tsx`         | 250 | `console.error('Lexical Error:', error)`                         | `logger.error`   |
| `HtmlInitializerPlugin.tsx` | 43  | `console.error('Failed to parse HTML content:', error)`          | `logger.error`   |
| `ReservationSection.tsx`    | 62  | `console.error('Failed to fetch cancellation policies:', error)` | `logger.error`   |
| `(dashboard)/error.tsx`     | 24  | `console.error('Admin error:', error)`                           | `logger.error`   |
| `posts/error.tsx`           | 15  | `console.error('Admin error:', error)`                           | `logger.error`   |
| `reservations/error.tsx`    | 15  | `console.error('Admin error:', error)`                           | `logger.error`   |
| `settings/error.tsx`        | 15  | `console.error('Admin error:', error)`                           | `logger.error`   |
| `spaces/error.tsx`          | 15  | `console.error('Admin error:', error)`                           | `logger.error`   |
| `staff/error.tsx`           | 15  | `console.error('Admin error:', error)`                           | `logger.error`   |
| `(public)/error.tsx`        | 23  | `console.error('Public page error:', error)`                     | `logger.error`   |
| `global-error.tsx`          | 28  | `console.error('Global error:', error)`                          | `logger.error`   |
| `ParticleField.tsx`         | 69  | `useMemo(() => generateParticles(...))`                          | プレーン式に変更 |

**除外（正当な例外）:**

- `ImageDistortion.tsx` の `useMemo`: Three.js ShaderMaterial がユニフォームオブジェクトの参照同一性を要求（`react-patterns.md` §外部ライブラリ例外）
- `ThreeCanvasInner.tsx` の `useCallback`: R3F PerformanceMonitor が関数の参照安定性を要求（同上）

---

## Task 1: 陳腐化 JSDoc の修正

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/hooks/shared/use-editor-core.ts:7`

**Step 1: ファイル確認**

```bash
head -10 src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/hooks/shared/use-editor-core.ts
```

Expected: 7行目に `* React Compiler対応（useCallback使用）` が見える。

**Step 2: JSDoc コメントを修正**

7行目の `（useCallback使用）` を削除。ファイル内に `useCallback` の import も使用もないため陳腐化している。

変更前:

```typescript
 * React Compiler対応（useCallback使用）
```

変更後:

```typescript
 * React Compiler対応
```

**Step 3: 型チェック**

```bash
bun run type-check
```

Expected: エラーなし（コメント変更のみ）。

**Step 4: Commit**

```bash
git add src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/hooks/shared/use-editor-core.ts
git commit -m "fix(editor): remove stale JSDoc comment about useCallback usage"
```

---

## Task 2: LexicalEditor.tsx の console.error 修正

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/LexicalEditor.tsx:250`

**Step 1: 現在の状態確認**

```bash
sed -n '245,260p' "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/LexicalEditor.tsx"
```

Expected: `console.error('Lexical Error:', error)` が 250 行付近に見える。

**Step 2: logger をインポートし console.error を置換**

`logger` が未 import の場合はインポート追加。`console.error` を `logger.error` に変更。

変更前:

```typescript
onError: (error: Error) => {
  console.error('Lexical Error:', error)
},
```

変更後:

```typescript
onError: (error: Error) => {
  logger.error('Lexical initialization error', { error: error.message })
},
```

インポート追加（既存 import 群の末尾に追加）:

```typescript
import { logger } from "@/shared/lib/logger";
```

**Step 3: 型チェック**

```bash
bun run type-check
```

Expected: エラーなし。

**Step 4: Commit**

```bash
git add "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/LexicalEditor.tsx"
git commit -m "fix(editor): replace console.error with logger.error in Lexical onError handler"
```

---

## Task 3: HtmlInitializerPlugin.tsx の console.error 修正

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/internal-plugins/HtmlInitializerPlugin.tsx:43`

**Step 1: 現在の状態確認**

```bash
cat "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/internal-plugins/HtmlInitializerPlugin.tsx"
```

Expected: 43行目に `console.error('Failed to parse HTML content:', error)` が見える。

**Step 2: logger をインポートし console.error を置換**

変更前:

```typescript
} catch (error) {
  console.error('Failed to parse HTML content:', error)
}
```

変更後:

```typescript
} catch (error) {
  logger.error('Failed to initialize editor from HTML', { error: error instanceof Error ? error.message : String(error) })
}
```

インポート追加:

```typescript
import { logger } from "@/shared/lib/logger";
```

**Step 3: 型チェック**

```bash
bun run type-check
```

Expected: エラーなし。

**Step 4: Commit**

```bash
git add "src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/internal-plugins/HtmlInitializerPlugin.tsx"
git commit -m "fix(editor): replace console.error with logger.error in HtmlInitializerPlugin"
```

---

## Task 4: ReservationSection.tsx の console.error 修正

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/settings/_components/sections/ReservationSection.tsx:62`

**Step 1: 現在の状態確認**

```bash
sed -n '55,70p' "src/app/(admin)/admin/(dashboard)/settings/_components/sections/ReservationSection.tsx"
```

Expected: 62行目に `console.error('Failed to fetch cancellation policies:', error)` が見える。

**Step 2: logger をインポートし console.error を置換**

変更前:

```typescript
} catch (error) {
  console.error('Failed to fetch cancellation policies:', error)
} finally {
```

変更後:

```typescript
} catch (error) {
  logger.error('Failed to fetch cancellation policies', { error: error instanceof Error ? error.message : String(error) })
} finally {
```

インポート追加:

```typescript
import { logger } from "@/shared/lib/logger";
```

**Step 3: 型チェック**

```bash
bun run type-check
```

Expected: エラーなし。

**Step 4: Commit**

```bash
git add "src/app/(admin)/admin/(dashboard)/settings/_components/sections/ReservationSection.tsx"
git commit -m "fix(settings): replace console.error with logger.error in ReservationSection"
```

---

## Task 5: 管理画面 error.tsx ファイル群の console.error 修正（6ファイル）

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/error.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/posts/error.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/reservations/error.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/settings/error.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/spaces/error.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/staff/error.tsx`

**Step 1: 全ファイルの現状確認**

```bash
grep -n "console.error" \
  "src/app/(admin)/admin/(dashboard)/error.tsx" \
  "src/app/(admin)/admin/(dashboard)/posts/error.tsx" \
  "src/app/(admin)/admin/(dashboard)/reservations/error.tsx" \
  "src/app/(admin)/admin/(dashboard)/settings/error.tsx" \
  "src/app/(admin)/admin/(dashboard)/spaces/error.tsx" \
  "src/app/(admin)/admin/(dashboard)/staff/error.tsx"
```

Expected: 各ファイルに `console.error('Admin error:', error)` が 1 箇所ずつ見える。

**Step 2: 各ファイルを修正**

全ファイルで同じパターン:

変更前:

```typescript
useEffect(() => {
  console.error("Admin error:", error);
}, [error]);
```

変更後:

```typescript
useEffect(() => {
  logger.error("Admin error boundary triggered", {
    error: error.message,
    digest: error.digest,
  });
}, [error]);
```

インポートを追加（`'use client'` の次の行の import 群に追加）:

```typescript
import { logger } from "@/shared/lib/logger";
```

**dashboard/error.tsx の注意**: このファイルは 24 行目が対象で、他のファイルよりもやや構造が異なる可能性がある。内容を確認してから修正する。

**Step 3: 型チェック**

```bash
bun run type-check
```

Expected: エラーなし。

**Step 4: Commit**

```bash
git add \
  "src/app/(admin)/admin/(dashboard)/error.tsx" \
  "src/app/(admin)/admin/(dashboard)/posts/error.tsx" \
  "src/app/(admin)/admin/(dashboard)/reservations/error.tsx" \
  "src/app/(admin)/admin/(dashboard)/settings/error.tsx" \
  "src/app/(admin)/admin/(dashboard)/spaces/error.tsx" \
  "src/app/(admin)/admin/(dashboard)/staff/error.tsx"
git commit -m "fix(admin): replace console.error with logger.error in all admin error boundaries"
```

---

## Task 6: 公開ページ error.tsx と global-error.tsx の修正

**Files:**

- Modify: `src/app/(public)/error.tsx`
- Modify: `src/app/global-error.tsx`

**注意**: `global-error.tsx` はスタンドアローンな html/body（Root Layout なし）のため、管理画面固有のライブラリをインポートしてはならない。`logger`（`@/shared/lib/logger`）のみ使用可。

**Step 1: ファイル確認**

```bash
cat src/app/(public)/error.tsx
cat src/app/global-error.tsx
```

**Step 2: public/error.tsx を修正**

変更前:

```typescript
useEffect(() => {
  console.error("Public page error:", error);
}, [error]);
```

変更後:

```typescript
useEffect(() => {
  logger.error("Public page error boundary triggered", {
    error: error.message,
    digest: error.digest,
  });
}, [error]);
```

インポート追加:

```typescript
import { logger } from "@/shared/lib/logger";
```

**Step 3: global-error.tsx を修正**

変更前:

```typescript
useEffect(() => {
  console.error("Global error:", error);
}, [error]);
```

変更後:

```typescript
useEffect(() => {
  logger.error("Global error boundary triggered", {
    error: error.message,
    digest: error.digest,
  });
}, [error]);
```

インポート追加:

```typescript
import { logger } from "@/shared/lib/logger";
```

**Step 4: 型チェック**

```bash
bun run type-check
```

Expected: エラーなし。

**Step 5: Commit**

```bash
git add src/app/(public)/error.tsx src/app/global-error.tsx
git commit -m "fix(error-boundary): replace console.error with logger.error in public and global error boundaries"
```

---

## Task 7: ParticleField.tsx の useMemo 除去

**Files:**

- Modify: `src/app/(public)/_shared/components/effects/three/ParticleField.tsx:69`

**Background:** React Compiler 1.0 は純粋な計算式を自動メモ化する。`generateParticles(count, spread)` は副作用のない純粋関数であり、React Compiler が `count`・`spread` の変化を追跡して自動的に結果をキャッシュする。明示的な `useMemo` は不要かつ `react-patterns.md` で禁止。

`ImageDistortion.tsx` の `useMemo` は除外: Three.js ShaderMaterial がユニフォームオブジェクトの参照同一性を要求するため、外部ライブラリ例外（`react-patterns.md` §例外）として正当。

**Step 1: 現在の状態確認**

```bash
sed -n '1,10p' src/app/(public)/_shared/components/effects/three/ParticleField.tsx
sed -n '65,90p' src/app/(public)/_shared/components/effects/three/ParticleField.tsx
```

Expected: `import { useRef, useMemo, useEffect } from 'react'` と `useMemo(() => generateParticles(count, spread), [count, spread])` が見える。

**Step 2: useMemo を除去**

変更前:

```typescript
import { useRef, useMemo, useEffect } from "react";
```

↓

```typescript
import { useRef, useEffect } from "react";
```

変更前:

```typescript
// 決定論的なパーティクル位置生成（React Compiler 互換）
const particles = useMemo(
  () => generateParticles(count, spread),
  [count, spread],
);
```

↓

```typescript
// 決定論的なパーティクル位置生成（React Compiler が自動メモ化）
const particles = generateParticles(count, spread);
```

**Step 3: 型チェック**

```bash
bun run type-check
```

Expected: エラーなし。

**Step 4: Commit**

```bash
git add src/app/(public)/_shared/components/effects/three/ParticleField.tsx
git commit -m "fix(three): remove useMemo from ParticleField - React Compiler auto-memoizes pure functions"
```

---

## Task 8: lexical-patterns.md のサンプルコード修正

**Files:**

- Modify: `.claude/rules/frontend/lexical-patterns.md`

**Background:** `lexical-patterns.md` の「エラーハンドリング」セクションに `console.error` を使ったサンプルコードが残っている。このドキュメントは他のルールに優先されないが、誤解を招くコード例を正す。

**Step 1: 対象箇所確認**

```bash
grep -n "console.error" .claude/rules/frontend/lexical-patterns.md
```

Expected: `console.error('Lexical Error:', error)` が見える。

**Step 2: サンプルコードを修正**

変更前:

```typescript
const initialConfig = {
  onError: (error: Error) => {
    // ログ記録（本番）またはスロー（開発）
    console.error("Lexical Error:", error);
    // 例外をスローしなければLexicalは自動回復
  },
};
```

変更後:

```typescript
const initialConfig = {
  onError: (error: Error) => {
    // logger.error で構造化ログ。例外をスローしなければLexicalは自動回復
    logger.error("Lexical initialization error", { error: error.message });
  },
};
```

**Step 3: Commit**

```bash
git add .claude/rules/frontend/lexical-patterns.md
git commit -m "docs(rules): update lexical-patterns onError example to use logger.error"
```

---

## Task 9: 最終検証

**Step 1: 全 console.error の除去確認**

```bash
grep -r "console\.error" src/ --include="*.tsx" --include="*.ts"
```

Expected: マッチなし（または意図的な残留のみ）。

**Step 2: type-check + lint の並列実行**

```bash
bun run validate
```

Expected: `type-check` と `lint` が両方ともエラーなし。

**Step 3: ビルド確認**

```bash
bun run build
```

Expected: ビルド成功。

---

## Task 10: 完了コミット

すべての変更が個別コミット済みであれば追加コミット不要。

最終状態確認:

```bash
git log --oneline -10
```

Expected: Task 1〜8 のコミットが積み重なっている。

```bash
git status
```

Expected: Working tree clean。
