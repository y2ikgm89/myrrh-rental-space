---
paths:
  - src/**
---

# React パターンルール

> React 19.2 / React Compiler 1.0 対応

## React 19 の破壊的変更

### forwardRef 廃止（必須対応）

React 19 では `ref` は通常の prop として渡せるため、`forwardRef` は**廃止**（deprecated）。
新規コンポーネントでは使用禁止。既存コードは見つけ次第修正する。

```typescript
import { Ref } from 'react'

// NG: React 18以前のパターン（廃止）
const Input = forwardRef<HTMLInputElement, InputProps>((props, ref) => (
  <input ref={ref} {...props} />
))
Input.displayName = 'Input'

// OK: React 19 パターン（ref は通常の prop）
function Input({ ref, ...props }: InputProps & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} {...props} />
}
```

**ルール:**

- `forwardRef` / `React.forwardRef` の使用禁止
- `displayName` の手動設定不要（名前付き関数で自動推論）

### ComponentPropsWithRef の使い方

Radix UI 等のサードパーティコンポーネントをラップする場合:

```typescript
import { ComponentPropsWithRef } from 'react'
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'

// NG: ComponentPropsWithoutRef（ref を受け取れない）
function RadioGroup({ className, ...props }: ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root className={cn('grid gap-2', className)} {...props} />
}

// OK: ComponentPropsWithRef（ref も受け取る）
function RadioGroup({ ref, className, ...props }: ComponentPropsWithRef<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root className={cn('grid gap-2', className)} {...props} ref={ref} />
}
```

---

## React Compiler 1.0（自動メモ化）

React Compiler 1.0（2025年10月 stable リリース、Next.js 16 でデフォルト有効）が
コンポーネント・フックを自動メモ化するため、手動の最適化は原則不要になった。
不適切なパターンはコンパイラエラーの原因になる。

### 不要になった手動最適化

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

### useSyncExternalStore — `getServerSnapshot` の参照安定性

`getServerSnapshot` は SSR / ハイドレーション中に**複数回**呼ばれる。戻り値が配列・オブジェクトのとき、呼び出しごとに**新しいインスタンス**（例: `return []`）を返すと、React が「The result of getServerSnapshot should be cached to avoid an infinite loop」を出し、再レンダーループの原因になる。

- **NG**: `return []`, `return {}` を関数本体で毎回生成
- **OK**: モジュールスコープの定数 1 つを返す（空配列・空オブジェクトの典型）
- **OK**: プリミティブ（`null`, `false`, `0` 等）は参照の問題がないためそのまま返してよい

詳細・例: `.claude/rules/react-patterns.md` の「useSyncExternalStore」節（本リポジトリでは Claude / Codex で同一方針）。

### useCallback + ref.current の衝突（重要）

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
GSAP アニメーション系のイベントハンドラで特に頻出（→ `gsap-patterns.md` パターン C）。

### 'use no memo' — コンパイル除外（一時的エスケープハッチ）

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
- `// TODO: Issue番号 — 根本原因の説明` を必ず付記
- Rules of React 違反を修正したら即座に削除

### 'use memo' — コンパイル強制 opt-in（annotation モードのみ）

Next.js 16 では全コンポーネントが自動コンパイル対象のため通常不要。
`compilationMode: 'annotation'` による段階的採用時のみ使用:

```typescript
// compilationMode: 'annotation' 設定時: 明示的に最適化対象にする
function ExpensiveList({ items }: { items: Item[] }) {
  "use memo"  // このコンポーネントのみ Compiler 対象にする
  return <ul>{items.map((item) => <li key={item.id}>{item.name}</li>)}</ul>
}
```

### Rules of React（コンパイラが最適化できる条件）

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

### ESLint — eslint-plugin-react-hooks（Compiler ルール統合済み）

React Compiler 1.0 から、コンパイラ用 lint ルールは `eslint-plugin-react-hooks` に統合された。
**`eslint-plugin-react-compiler` は非推奨 → 削除してよい**:

```typescript
// NG: 非推奨（react-compiler 専用プラグイン、削除可能）
// "eslint-plugin-react-compiler": "..."

// OK: eslint-plugin-react-hooks@latest を使用（recommended-latest プリセット）
// recommended-latest に以下のコンパイラルールが含まれる:
//   - exhaustive-deps       — useEffect 依存配列漏れ検出
//   - rules-of-hooks        — フック使用規則強制
//   - preserve-manual-memoization — Compiler との衝突検出
//   - purity                — コンポーネント純粋性チェック
```

### React Hook Form — watch() 禁止

`watch()` は使用禁止。代わりに `useWatch()` を使用:

```typescript
// NG: React Compiler でメモ化不可、フォーム全体が再レンダリング
const { watch } = useForm();
const value = watch("fieldName");

// OK: コンポーネントレベルで再レンダリングを分離
const { control } = useForm();
const value = useWatch({ control, name: "fieldName" });

// OK: 複数フィールドを同時監視
const [firstName, lastName] = useWatch({
  control,
  name: ["firstName", "lastName"],
});

// OK: compute 関数で派生値を計算
const isValid = useWatch({
  control,
  compute: (data) => Boolean(data.email && data.password),
});
```

**理由:**

- `watch` はフォームのルート（`useForm` を呼んだコンポーネント）全体を再レンダリングする
- `useWatch` はサブコンポーネントレベルで再レンダリングを分離し、パフォーマンスを向上させる
- React Compiler は `watch` の戻り値をメモ化できない

---

> 追加の React API 詳細は [react.dev](https://react.dev/) を参照。

---

## 禁止事項

| 禁止パターン                                                           | 代替                                                                                                                                                                           |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `forwardRef` / `React.forwardRef`                                      | `ref` を通常の prop として受け取る                                                                                                                                             |
| `ComponentPropsWithoutRef`                                             | `ComponentPropsWithRef`                                                                                                                                                        |
| `Input.displayName = 'Input'`                                          | 名前付き関数で自動推論                                                                                                                                                         |
| `useCallback` / `useMemo`（原則）                                      | プレーン関数・式（Compiler が最適化）                                                                                                                                          |
| `React.memo()`（原則）                                                 | プレーン関数コンポーネント（Compiler が最適化）                                                                                                                                |
| `useCallback` 内で `ref.current` を参照                                | プレーン関数に変更                                                                                                                                                             |
| `watch('fieldName')` (React Hook Form)                                 | `useWatch({ control, name: 'fieldName' })`                                                                                                                                     |
| `useOptimistic` なし で楽観的 UI を手動実装                            | `useOptimistic` を使用                                                                                                                                                         |
| `useFormStatus` を form の外で使用                                     | `<form>` 子孫コンポーネント内に配置                                                                                                                                            |
| `useFormStatus` で RHF フォームの送信中状態を取る                      | 管理画面は `useFormAction` または `useActionState`+RHF ハイブリッドで **`SubmitButton` に `isPending` を prop で渡す**（`.claude/rules/react-patterns.md` Gotchas と同一方針） |
| `"use no memo"` を恒久的に使用                                         | Rules of React 違反を修正して削除                                                                                                                                              |
| `eslint-plugin-react-compiler` の継続使用                              | `eslint-plugin-react-hooks@latest` に統合済み                                                                                                                                  |
| クラスコンポーネント（新規作成）                                       | 関数コンポーネントに書き換える（Compiler 対応）                                                                                                                                |
| `use(fetchData())` をコンポーネント内に直接記述                        | Suspense boundary の外で Promise を生成して渡す                                                                                                                                |
| `ViewTransition` を `startTransition` 外で使用                         | `startTransition` で状態更新をラップする                                                                                                                                       |
| `useId` の生成値を文字列として依存                                     | 形式が変更される（19.0: `:r:` → 19.2: `_r_`）。`id` 属性への渡し方のみ使用する                                                                                                 |
| `useSyncExternalStore` の `getServerSnapshot` で毎回新しい `[]` / `{}` | モジュールスコープの定数を返し参照を固定（プリミティブはそのままで可）                                                                                                         |

---

## 参考

- [React 19 リリースノート](https://react.dev/blog/2024/12/05/react-19)
- [React Compiler 1.0 リリースノート](https://react.dev/blog/2025/10/07/react-compiler-1)
- [ref as a prop（forwardRef 廃止）](https://react.dev/blog/2024/04/25/react-19#ref-as-a-prop)
- [React Compiler — インストール](https://react.dev/learn/react-compiler/installation)
- [React Compiler — 段階的採用](https://react.dev/learn/react-compiler/incremental-adoption)
- [React Compiler — デバッグ](https://react.dev/learn/react-compiler/debugging)
- ['use no memo' ディレクティブ](https://react.dev/reference/react-compiler/directives/use-no-memo)
- [eslint-plugin-react-hooks](https://react.dev/reference/eslint-plugin-react-hooks)
- [React Hook Form useWatch](https://react-hook-form.com/docs/usewatch)
