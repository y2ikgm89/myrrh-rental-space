---
description: Rules of React + eslint-plugin-react-hooks 7.x 統合ルール表 + React Hook Form の watch() 禁止 / useFieldArray + dnd-kit パターン
paths:
  - src/**/*.tsx
  - src/**/*.ts
  - eslint.config.mjs
---

# Rules of React + ESLint + React Hook Form

> Compiler 最適化条件 + react-hooks plugin 16 ルール表 + RHF watch() 禁止 + useFieldArray + dnd-kit 安定 ID パターン。

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

## React Hook Form — watch() 禁止

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

## React Hook Form — useFieldArray + dnd-kit パターン

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
