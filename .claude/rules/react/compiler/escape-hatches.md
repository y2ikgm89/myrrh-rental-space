---
description: React Compiler エスケープハッチ ('use no memo' / 'use memo') + 動的 component の static-components violation 回避
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

# React Compiler エスケープハッチ + 動的 component

> 一時的コンパイル除外 (`'use no memo'`) + opt-in (`'use memo'`、annotation/syntax モード限定) + `Reflect.get(icons, name)` で取得した component の `createElement` 経由 render。

## 'use no memo' — コンパイル除外（一時的エスケープハッチ）

コンパイラに問題があるコンポーネントを一時的に除外する。**恒久的な使用は禁止**:

```typescript
// NG: 恒久的に 'use no memo' を使い続ける（Rules of React 違反を放置）
function ProblematicComponent() {
  "use no memo"; // 根本原因を修正しないまま放置
  // ...
}

// OK: 一時的なデバッグ・段階的移行（TODO コメント必須）
function TemporarilyExcluded() {
  "use no memo"; // TODO: #123 — 副作用がレンダリング中に発生している問題を修正後に削除
  // ...
}
```

**使用ルール:**

- 関数本体の**先頭**に配置（コメントは先でも可）
- `// TODO: Issue 番号 — 根本原因の説明` を必ず付記
- Rules of React 違反を修正したら即座に削除

## 'use memo' — コンパイル強制 opt-in（`annotation` / `syntax` モードでのみ有効）

React Compiler 1.0 の `compilationMode` は 4 値（`infer` / `syntax` / `annotation` / `all`）で、`'use memo'` / `'use no memo'` ディレクティブが有効なのは **`annotation` または `syntax` モードのみ**（公式ドキュメント）。

本プロジェクトは **Next.js 16 の react-compiler 統合（デフォルト `compilationMode: 'infer'`）** を採用しているため、`'use memo'` は不要（自動判定）。強制 opt-in が必要なのは library 作者等で `compilationMode: 'annotation'` を選ぶ特殊ケースのみ:

```typescript
// compilationMode: 'annotation' 設定時のみ有効
function ExpensiveList({ items }: { items: Item[] }) {
  "use memo"  // annotation モードで明示的に最適化対象にする
  return <ul>{items.map((item) => <li key={item.id}>{item.name}</li>)}</ul>
}

// Next.js 16 デフォルト（compilationMode: 'infer'）では上記ディレクティブは no-op。
// 'use no memo' エスケープハッチは全モードで有効（Rules of React 違反を一時除外）
```

## 動的 component を JSX render すると `static-components` violation

`Reflect.get(icons, name)` 等で名前解決した component を JSX `<Icon />` で render すると `@eslint-react/static-components` + `react-hooks/static-components` で error（"Component is created during render"）。`createElement(Icon, props)` で回避:

```tsx
// NG: Reflect.get + JSX → static-components error
const Icon = Reflect.get(icons, name);
return <Icon className={className} size={size} />;

// OK: createElement で render
import { createElement } from "react";
const Icon = Reflect.get(icons, name);
return createElement(Icon, {
  className,
  size,
  ...(strokeWidth !== undefined && { strokeWidth }),
});
```

参照実装: `@/public/components/ui/dynamic-tabler-icon`（async Server Component で `await import("@tabler/icons-react")` + `createElement`）
