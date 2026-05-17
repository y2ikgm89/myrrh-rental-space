---
description: Rules of React + eslint-plugin-react-hooks 7.x 統合ルール表 (React Compiler 1.0 互換性条件)
paths:
  - src/**/*.tsx
  - src/**/*.ts
  - eslint.config.mjs
---

# Rules of React + ESLint

> Compiler 最適化条件 + react-hooks plugin 16 ルール表。
>
> Form 関連は conform `useActionState` + `useForm` + `parseWithZod` が canonical (→ `frontend/admin-ui/forms.md` / `frontend/admin-ui/forms/settings-sections.md`)。React Hook Form (`react-hook-form` / `@hookform/resolvers`) は `package.json` から完全削除済、新規利用不可。

## Rules of React（コンパイラが最適化できる条件）

React Compiler は以下のルールに準拠したコードのみ最適化する。
**違反するとそのコンポーネントはコンパイルをスキップされる**:

1. **べき等性**: 同じ props/state に対して常に同じ JSX を返す
2. **読み取り専用の props/state**: 直接変更しない（mutable ref は除く）
3. **副作用は `useEffect` 内のみ**: レンダリング中の副作用禁止
4. **フックはトップレベルのみ**: 条件・ループ・ネスト関数内で呼び出し禁止

```typescript
// NG: props の直接変更（コンパイルをスキップされる）
function BadList({ items }: { items: string[] }) {
  items.push('new item')  // Rules of React 違反
  return <ul>{items.map((i) => <li key={i}>{i}</li>)}</ul>
}

// OK: イミュータブルな操作
function GoodList({ items }: { items: string[] }) {
  const withNew = [...items, 'new item']
  return <ul>{withNew.map((i) => <li key={i}>{i}</li>)}</ul>
}

// NG: レンダリング中の副作用（コンパイルをスキップされる）
function BadTitle() {
  document.title = 'Hello'  // Rules of React 違反（副作用はレンダリング外で）
  return <div>Hello</div>
}

// OK: useEffect 内で副作用
function GoodTitle() {
  useEffect(() => { document.title = 'Hello' }, [])
  return <div>Hello</div>
}
```

## ESLint — eslint-plugin-react-hooks（Compiler ルール統合済み）

React Compiler 1.0 から、コンパイラ用 lint ルールは `eslint-plugin-react-hooks` に統合された。
`eslint-plugin-react-compiler` は**非推奨・不要**（`eslint-config-next` が `eslint-plugin-react-hooks@7` の `recommended` プリセットを自動注入する）。

**有効化済みのコンパイラ ESLint ルール（`eslint.config.mjs`）**:

| ルール                        | 重大度    | 検出内容                                                          |
| ----------------------------- | --------- | ----------------------------------------------------------------- |
| `preserve-manual-memoization` | error     | Compiler が処理できない手動メモ化                                 |
| `purity`                      | error     | render 中の副作用（`document.title` 代入等）                      |
| `refs`                        | error     | render 中の `ref.current` 読み取り                                |
| `immutability`                | error     | props / state の直接ミューテーション                              |
| `globals`                     | error     | render 中のグローバル変数ミューテーション                         |
| `static-components`           | error     | render のたびに再生成されるコンポーネント定義                     |
| `use-memo`                    | error     | `useMemo` の不正な使い方                                          |
| `void-use-memo`               | error     | `useMemo` に return がない（recommended-latest）                  |
| `set-state-in-render`         | error     | render 中の `setState` 呼び出し                                   |
| `set-state-in-effect`         | error     | `useEffect` 内の同期 `setState`                                   |
| `error-boundaries`            | error     | try/catch による子コンポーネントエラー捕捉（Error Boundary 推奨） |
| `incompatible-library`        | **error** | Compiler のメモ化モデルと非互換なライブラリ使用                   |
| `unsupported-syntax`          | **error** | Compiler が処理できない構文（generator 等）                       |
| `component-hook-factories`    | error     | HOF 内のネストされたコンポーネント / Hook                         |
| `rules-of-hooks`              | error     | Hook の使用規則違反                                               |
| `exhaustive-deps`             | warn      | `useEffect` 依存配列の漏れ                                        |

**太字**の 2 ルール（`incompatible-library`, `unsupported-syntax`）は `eslint-config-next` が warn に設定するため、`eslint.config.mjs` で明示的に error に昇格済み。

**専門レビュー**: GSAP / Lenis / Lexical を含むファイル編集後は `react-compiler-reviewer` サブエージェントを使用。
