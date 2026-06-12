---
description: React Compiler 1.0 自動メモ化（useCallback / useMemo / React.memo 廃止）+ useCallback + ref.current 衝突 + useEffectEvent
paths:
  - "src/**/*.tsx"
  - "src/**/use-*.ts"
  - "src/**/use[A-Z]*.ts"
  - "src/**/hooks.ts"
  - "src/**/hooks/**/*.ts"
  - "src/**/_hooks/**/*.ts"
  - "src/**/editor/**/*.ts"
  - "src/shared/lib/conform/**"
---

# React Compiler 1.0 自動メモ化

> Next.js 16 デフォルト有効。手動メモ化は原則禁止。

## 廃止パターン

| 廃止           | React Compiler が自動処理  |
| -------------- | -------------------------- |
| `useCallback`  | 関数参照の同一性を自動保持 |
| `useMemo`      | 計算結果の自動キャッシュ   |
| `React.memo()` | 不要な子再レンダリング防止 |

**例外**: `useSyncExternalStore` の subscribe（参照同一性が必須）、外部ライブラリが明示要求する場合。

## useCallback + ref.current の衝突（重要）

`useCallback` 内で `ref.current` を参照すると `react-hooks/preserve-manual-memoization` エラー。

```typescript
// NG: ref.current が依存配列に不足 → Compiler エラー
const handleMove = useCallback((e) => {
  if (!stateRef.current) return;
}, []);

// OK: useCallback を除去してプレーン関数（Compiler が自動メモ化）
const handleMove = (e: React.MouseEvent) => {
  if (!stateRef.current) return;
};
```

GSAP アニメーション系イベントハンドラで特に頻出（→ `gsap/matchmedia/events-and-stagger.md`）。

## useEffectEvent — コールバックを deps から除外

イベントハンドラのような「最新値を読む副作用」は `useEffectEvent` でラップして deps 配列から除外（stable）:

```typescript
import { useEffect, useEffectEvent } from "react";

const handleEsc = useEffectEvent(() => {
  onClose();
});
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.key === "Escape") handleEsc();
  };
  document.addEventListener("keydown", handler);
  return () => document.removeEventListener("keydown", handler);
}, [isOpen]); // onClose を deps に含めない
```

**GSAP カルーセル典型例**: `useEffectEvent(() => startTimer())` で `crossfadeTo` / `count` を読みつつ effect は `[hasMultiple, count]` のみ。

**Anti-pattern**: state を deps に含む effect 内での `useEffectEvent` は抽象化コストのみ — effect 内で直接処理する。

**注意**: `eslint-disable react-hooks/exhaustive-deps` は `@eslint-react/exhaustive-deps` が残るため不完全。`useEffectEvent` で根本解決する。
