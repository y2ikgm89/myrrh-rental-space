---
description: React Compiler 1.0 自動メモ化（useCallback / useMemo / React.memo 廃止）+ useCallback + ref.current 衝突 + useEffectEvent
paths:
  - src/**/*.tsx
  - src/**/*.ts
---

# React Compiler 1.0 自動メモ化

> Next.js 16 デフォルト有効。手動メモ化は原則禁止。`ref.current` 衝突 + `useEffectEvent` パターン。

## 不要になった手動最適化

React Compiler が自動処理するため、以下は原則禁止:

| 廃止パターン   | React Compiler が自動処理                      |
| -------------- | ---------------------------------------------- |
| `useCallback`  | 関数参照の同一性を自動保持                     |
| `useMemo`      | 計算結果の自動キャッシュ                       |
| `React.memo()` | 親再レンダリング時の不要な子再レンダリング防止 |

```typescript
// NG: 不要なメモ化（React Compiler が自動処理）
const handleClick = useCallback(() => {
  doSomething(value)
}, [value])

const total = useMemo(() => items.reduce((s, i) => s + i.price, 0), [items])

const HeavyList = React.memo(function HeavyList({ data }: { data: Item[] }) {
  return <ul>{data.map((item) => <li key={item.id}>{item.name}</li>)}</ul>
})

// OK: プレーン関数・式で記述（Compiler が最適化）
const handleClick = () => {
  doSomething(value)
}

const total = items.reduce((s, i) => s + i.price, 0)

function HeavyList({ data }: { data: Item[] }) {
  return <ul>{data.map((item) => <li key={item.id}>{item.name}</li>)}</ul>
}
```

**例外: 明示的に使用してよい場合**

```typescript
// OK: useSyncExternalStore の subscribe（参照同一性が必須）
const subscribe = useCallback((callback: () => void) => {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}, []);

// OK: 外部ライブラリが関数の参照同一性を明示的に要求する場合
// OK: パフォーマンス計測で明確なボトルネックが確認された場合のみ
```

## useCallback + ref.current の衝突（重要）

`useCallback` 内で `ref.current` を参照すると、React Compiler が推論する依存（`ref.current`）と
手動の依存配列が一致せず `react-hooks/preserve-manual-memoization` エラーになる。

```typescript
// NG: React Compiler エラー — ref.current が依存配列に不足
const stateRef = useRef(true);
const handleMove = useCallback((e: React.MouseEvent) => {
  if (!stateRef.current) return;
  doSomething(e);
}, []);
// Compiler: "inferred dependency stateRef.current" でエラー

// OK: useCallback を除去してプレーン関数（Compiler が自動メモ化）
const stateRef = useRef(true);
const handleMove = (e: React.MouseEvent) => {
  if (!stateRef.current) return;
  doSomething(e);
};
```

**ルール**: `ref` を参照するイベントハンドラでは `useCallback` を使わずプレーン関数で定義する。
GSAP アニメーション系のイベントハンドラで特に頻出（→ `frontend/gsap/matchmedia/events-and-stagger.md` §パターン C）。

## useEffectEvent — コールバックを deps から除外

イベントハンドラのような「最新値を読む副作用」は `useEffectEvent` でラップすることで deps 配列から除外できる（stable、`react` からインポート）:

```typescript
import { useEffect, useEffectEvent } from "react";

// NG: コールバックが deps に入り、余分な re-subscribe が発生
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };
  document.addEventListener("keydown", handler);
  return () => document.removeEventListener("keydown", handler);
}, [isOpen, onClose]); // onClose が変わるたびに再登録

// OK: useEffectEvent でコールバックをイベント化（deps 不要）
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

**使いどころ**: `useEffect` 内で最新の props/state/コールバックを読みたいが、deps に入れると不要な effect の再実行が起きる場合。

**典型例: GSAP タイマー駆動アニメーション**（カルーセル等）:

```typescript
// startTimer は crossfadeTo / count を読むが、effect は hasMultiple / count 変化時のみ再実行
const onTimerStart = useEffectEvent(() => {
  startTimer();
});
useEffect(() => {
  onTimerStart();
  return stopTimer;
}, [hasMultiple, count]);
```

**注意**: `eslint-disable-next-line react-hooks/exhaustive-deps` は `@eslint-react/exhaustive-deps` が残るため不完全。`useEffectEvent` で根本解決する。

**Anti-pattern: state を deps に含む effect 内で `useEffectEvent` を呼ぶ過剰抽象化**:

```typescript
// NG: activeId が deps にあるため useEffectEvent の価値なし（抽象化コストだけ増える）
const applyActive = useEffectEvent((id: string) => {
  /* DOM 操作 */
});
useEffect(() => applyActive(activeId), [activeId]);

// OK: useEffect 内で直接処理（state 変化で trigger したい意図と一致）
useEffect(() => {
  /* DOM 操作 */
}, [activeId]);
```

`useEffectEvent` の本来用途は「effect 内で最新 props / state / callback を読みたいが deps に入れると不要な再実行が起きる」ケースのみ。state が deps にある時点で trigger させたい意図なので素直に useEffect 内で処理する。
