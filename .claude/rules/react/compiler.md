---
description: React 19 破壊的変更・Context API（use()）・React Compiler 1.0 自動メモ化
paths:
  - "src/**/*.tsx"
  - "src/**/*.ts"
---

# React パターン — React 19 + Compiler

> React 19.2 / React Compiler 1.0 対応

> 詳細サブルール（path-scoped auto-load）:
>
> - **React 19 破壊的変更（forwardRef 廃止 / ComponentPropsWithRef）+ Context use() フック** — `react/compiler/react-19.md`
> - **自動メモ化（useCallback / useMemo / React.memo 廃止）+ ref.current 衝突 + useEffectEvent** — `react/compiler/auto-memo.md`
> - **'use no memo' / 'use memo' エスケープハッチ + 動的 component の static-components 回避** — `react/compiler/escape-hatches.md`
> - **Rules of React + eslint-plugin-react-hooks ルール表** — `react/compiler/rules-eslint.md`
