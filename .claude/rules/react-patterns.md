---
paths:
  - src/**/*.tsx
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

## Context API（use() フック）

React 19 では `use()` フックで Context を消費する。`useContext()` は非推奨（将来削除予定）。

### use() の利点

- **条件分岐後でも呼べる** — 通常の Hook と異なり、条件・ループ内でも使用可能
- **`undefined` デフォルト値** — `createContext<T | undefined>(undefined)` で Context 外使用を型で検出できる

```typescript
import { createContext, use } from "react";

// NG: React 18パターン（非推奨）
const Ctx = createContext<MyContextValue | null>(null);
function useMyContext() {
  const value = useContext(Ctx);
  if (!value) throw new Error("...");
  return value;
}

// OK: React 19パターン（このプロジェクトの標準）
const Ctx = createContext<MyContextValue | undefined>(undefined);
export function useMyContext() {
  const ctx = use(Ctx);
  if (ctx === undefined)
    throw new Error("useMyContext must be used within Provider");
  return ctx;
}
```

**ルール**:

- `useContext` 禁止 → `use(Context)` を使用
- `createContext<T | null>(null)` 禁止 → `createContext<T | undefined>(undefined)` を使用

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

### useEffectEvent — コールバックを deps から除外

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

**太字**の2ルール（`incompatible-library`, `unsupported-syntax`）は `eslint-config-next` が warn に設定するため、`eslint.config.mjs` で明示的に error に昇格済み。

**専門レビュー**: GSAP / Three.js / Lenis / Lexical を含むファイル編集後は `react-compiler-reviewer` サブエージェントを使用。

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

### React Hook Form — useFieldArray + dnd-kit パターン

配列フィールドは `useFieldArray` を使用する。`useState` や `form.setValue` + 手動配列操作は禁止:

```typescript
// NG: useState で配列を二重管理（RHF と同期がずれる）
const [items, setItems] = useState<string[]>([]);

// NG: useFieldArray に primitive 配列（動作しない）
// useFieldArray は object[] 必須。string[] は受け付けない
// schema: z.array(z.string()) → useFieldArray で NG

// OK: object[] スキーマ + useFieldArray
// schema: z.array(z.object({ url: z.string().url() }))
const { fields, append, remove, move } = useFieldArray({
  control: form.control,
  name: "imageUrls", // 型: { url: string }[]
});
```

**dnd-kit との統合（安定 ID パターン）**:

```typescript
// fields[].id は RHF が生成する安定した一意 ID — dnd-kit の SortableContext items に使用
// NG: URL や index を dnd ID に使う（重複・不安定リスク）
items={imageUrls.map((_, i) => `image-${i}`)}  // index → 並び替え後に壊れる
items={imageUrls}                                // URL → 重複リスク

// OK: fields[].id（RHF 管理、安定）
items={fields.map((f) => f.id)}

// OK: move() で並び替え（arrayMove 不要）
const handleDragEnd = (event: DragEndEvent) => {
  const { active, over } = event
  if (!over || active.id === over.id) return
  const oldIndex = fields.findIndex((f) => f.id === String(active.id))
  const newIndex = fields.findIndex((f) => f.id === String(over.id))
  if (oldIndex !== -1 && newIndex !== -1) move(oldIndex, newIndex)
}

// OK: fields.length はリアクティブ（form.getValues() は非リアクティブなので禁止）
maxSelections: 10 - fields.length                          // ✓ リアクティブ
maxSelections: 10 - form.getValues('imageUrls').length     // ✗ 非リアクティブ
```

**スキーマ・フォーム・Server Action 間の変換**:

```typescript
// Zod スキーマ: useFieldArray のため object[]
imageUrls: z.array(z.object({ url: z.string().url({ error: "..." }) }));

// 編集時の初期値: DB の string[] → フォームの { url: string }[]
imageUrls: location.imageUrls.map((url) => ({ url }));

// Server Action: フォームの { url: string }[] → Prisma の string[]
imageUrls: data.imageUrls.map((i) => i.url);
```

---

> **詳細リファレンス（React 19.2 新API / Compiler 制限事項）**: `docs/reference/claude-rules/react-api-reference.md`

---

## Next.js 16 PPR + `new Date()` ビルドエラー

PPR（`cacheComponents: true`）環境で Server Component が動的データアクセス前に `new Date()` を呼ぶと以下のエラーが発生する:

```
Route "..." used `new Date()` before accessing uncached data
```

`import { connection } from 'next/server'` して `await connection()` を `new Date()` の前に呼ぶ（[公式推奨](https://nextjs.org/docs/app/api-reference/functions/connection)）:

```typescript
import { connection } from "next/server";

export default async function Page() {
  await connection(); // 動的データアクセスをマーク
  const now = new Date(); // OK: connection() の後
  // ...
}
```

**注意**: `headers()` でも回避できるが意味的に誤り。`audit.ts` など実際にヘッダー値を読む箇所は `headers()` のまま。

**適用範囲**: `connection()` は**公開ページ（`src/app/(public)/`）のみ**。管理画面（`src/app/(admin)/`）では `connection()` を使用しない。`new Date()` が必要な管理画面コンポーネントは Client Component にする。

---

## useSyncExternalStore — 外部ストア読み取り（React 19 公式推奨）

sessionStorage / localStorage など**変更通知を持たない外部ストア**を読み取る場合、
`useState` lazy initializer ではなく `useSyncExternalStore` を使用する（React 19 公式推奨）。

```typescript
import { useRef, useSyncExternalStore } from "react";

// NG: 外部ストアに useState lazy initializer（React 19 非推奨）
const [data] = useState(() => sessionStorage.getItem(key));

// OK: useSyncExternalStore（React 19 公式パターン）
const snapshotRef = useRef<T | null>(null);
const data = useSyncExternalStore(
  () => () => {}, // subscribe: no-op（変更通知なし）
  () => {
    snapshotRef.current ??= readFromStorage(); // getSnapshot: useRef でキャッシュ（参照安定性）
    return snapshotRef.current;
  },
  (): T => fallbackValue, // getServerSnapshot: dynamic({ ssr: false }) でも必須
);
```

**3 引数の役割:**

| 引数                | sessionStorage 向け実装               | 理由                                           |
| ------------------- | ------------------------------------- | ---------------------------------------------- |
| `subscribe`         | `() => () => {}` (no-op)              | sessionStorage は変更イベントを発火しない      |
| `getSnapshot`       | `useRef` でキャッシュした読み取り関数 | 毎レンダーで新しい参照を返すと無限ループ       |
| `getServerSnapshot` | エラー/空状態の fallback 値           | `dynamic({ ssr: false })` でも型安全のため必須 |

**注意**: ブラウザ API 依存のため `dynamic({ ssr: false })` とセットで使用する。

---

## React 19 `<Activity>` — EXPERIMENTAL 採用禁止

`<Activity>` は `display: none` で DOM を非表示にするため CSS transform アニメーションと非互換（アニメーション中でも要素が消える）。context7/WebFetch で確認済み。

```typescript
// NG: Activity は EXPERIMENTAL — CSS transform アニメーションと非互換
import { unstable_Activity as Activity } from 'react'
<Activity mode="hidden"><AnimatedPanel /></Activity>

// OK: CSS visibility / opacity で代替（DOM を保持しアニメーション可能）
<div style={{ visibility: isHidden ? 'hidden' : 'visible' }}>
  <AnimatedPanel />
</div>
```

---

## 禁止事項（本文未掲載のパターン）

上記各セクションに加え、以下のパターンも禁止:

| 禁止パターン                                    | 代替                                                      |
| ----------------------------------------------- | --------------------------------------------------------- |
| `useOptimistic` なしで楽観的 UI を手動実装      | `useOptimistic` を使用                                    |
| `useFormStatus` を `<form>` の外で使用          | `<form>` 子孫コンポーネント内に配置                       |
| クラスコンポーネント（新規作成）                | 関数コンポーネント（Compiler 対応）                       |
| `use(fetchData())` をコンポーネント内に直接記述 | Suspense boundary の外で Promise を生成して渡す           |
| `ViewTransition` を `startTransition` 外で使用  | `startTransition` で状態更新をラップする                  |
| `useId` の生成値を文字列として依存              | `id` 属性への渡し方のみ使用（形式は変更される可能性あり） |

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
