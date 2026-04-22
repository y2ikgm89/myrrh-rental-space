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

**専門レビュー**: GSAP / Lenis / Lexical を含むファイル編集後は `react-compiler-reviewer` サブエージェントを使用。

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

## Outer/Inner Component Split（gate + hooks 分離パターン）

フィーチャーフラグ・権限・props 値によって「早期 return するか / 完全な form を描画するか」を切り替えたいが、描画側が hooks を使う場合、単一コンポーネントで `if (!flag) return <Disabled />` を hooks の前に置くと Rules of Hooks 違反（`@eslint-react/rules-of-hooks` / `react-hooks/rules-of-hooks`）になる。

解決パターン: outer（gate、hooks なし）と inner（module-local、全 hooks）に分離する:

```tsx
type Props = { flag: boolean; reservationId: string /* ... */ };
type InnerProps = Omit<Props, "flag">;

export function MyForm({ flag, ...rest }: Props) {
  if (!flag) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-center">
        <p className="text-sm text-muted-foreground">
          この機能は無効化されています。
        </p>
      </div>
    );
  }
  return (
    <MyFormInner
      reservationId={rest.reservationId} /* ...explicit forwarding... */
    />
  );
}

function MyFormInner({ reservationId /* ... */ }: InnerProps) {
  const [state, setState] = useState(/* ... */); // hooks は常に unconditional
  const ref = useRef<HTMLFormElement>(null);
  const form = usePublicForm(/* ... */);
  // ...
  return <form>{/* ... */}</form>;
}
```

**ルール:**

- **outer に hooks を置かない** — 完全に pure な gate にする（`useState` / `useEffect` / `useWatch` 等一切禁止）
- **inner は module-local（非 export）** — 外部 API を広げない
- **props は `Omit<Props, "flag">` で inner 型を導出** — flag の forwarding を型レベルで防ぐ
- **`{...rest}` spread 禁止** — flag が inner に漏れる事故防止のため、明示的に per-name forward する
- **outer で分岐する条件は props のみ** — inner の render 結果に依存する条件を outer で使わない（相互再帰になる）

**いつ使うか:**

- フィーチャーフラグ（`reviewsEnabled` 等のスペース単位トグル）による render 分岐
- 権限チェック（`canEdit` / `isOwner`）による UI 切り替え
- 認証状態による「ログインメッセージ」vs「実際のフォーム」切り替え
- 早期 return で hooks の前に出したい全てのケース

参照実装: `src/app/(public)/mypage/reservations/[id]/_components/review-form.tsx`（`reviewsEnabled` による投稿フォーム gate）

### Thin mode dispatcher は clean-break で削除推奨

`if (mode === "x") return <X/>; return <Y/>` + 軽微な state 変換（一度だけ行う HTML→JSON 等）だけの dispatcher は、routing を pages に inline + state 変換を使用する component に移譲して削除する。dispatcher 層の `useState` は上記 Outer/Inner Component Split strict 規則（outer に hooks を置かない）違反。mode が props 由来で runtime 変化しない場合、discriminated union props も不要。

**判断基準（dispatcher 削除適用）**:

- dispatcher 本体が hooks + `if (mode) return <X/>` の 2 要素のみ
- hooks の state が mode branch の一方でのみ使われる
- pages が静的に mode を選択できる（`new/page.tsx` は常に create、`[id]/edit/page.tsx` は常に edit 等）

**clean-break 手順**:

1. dispatcher が持つ state 変換（HTML→JSON 等）を、実際に使用する inner component 内へ `useState` 遅延初期化で移譲
2. inner component の props API を「変換前の生データ」を受ける形に変更（`resolvedContentJson: string | null` → `initialTemplateHtml: string | null` 等）
3. pages が dispatcher 経由ではなく inner component を直接 import（`TermsInlineEditor` → `TermsInlineEditorCreate` / `TermsInlineEditorEdit`）
4. `mode` prop と discriminated union props 型を削除
5. dispatcher ファイルを削除（barrel 再 export 禁止の項と同じく後方互換シム不要）

参照実装: `terms/new/page.tsx` が `TermsInlineEditorCreate` を直接 import、`terms/[id]/edit/page.tsx` が `TermsInlineEditorEdit` を直接 import（2026-04-22 削除事例、`TermsInlineEditor.tsx` 93 行 dispatcher 削除）

---

## useReducer — カスケードステート管理（React 公式推奨）

関連する複数の `useState` がカスケードリセット（親変更→子リセット）を伴う場合、`useReducer` で一元化する（[React 公式: Extracting State Logic into a Reducer](https://react.dev/learn/extracting-state-logic-into-a-reducer)）。

**判断基準**: リセットが3段以上連鎖する場合は `useReducer` を選択

```typescript
// NG: 7つの useState + 各ハンドラで 3〜5個の set* が散在
const [locationId, setLocationId] = useState(null);
const [spaceId, setSpaceId] = useState(null);
const [date, setDate] = useState(undefined);
// handleLocationSelect 内で: setSpaceId(null); setDate(undefined); setTime(null); ...

// OK: useReducer でカスケードリセットを reducer に一元化
type Action =
  | { type: "selectLocation"; id: string; autoSpaceId: string | null }
  | { type: "selectSpace"; id: string }
  | { type: "selectDate"; date: Date | undefined };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "selectLocation":
      return {
        ...state,
        locationId: action.id,
        spaceId: action.autoSpaceId,
        date: undefined,
        startTime: null,
        duration: null,
      };
    // ... 各アクションで下流ステートをリセット
  }
}
```

---

## startTransition — ユーザー操作起点のデータ取得（React 19 推奨）

ユーザー操作（ボタンクリック、セレクト変更等）に起因するデータ取得は、`useEffect` ではなくイベントハンドラ内の `startTransition` で実行する（[React 19 useTransition ドキュメント](https://react.dev/reference/react/useTransition)）。

```typescript
// NG: useEffect で依存値を監視してフェッチ（データフローが暗黙的）
useEffect(() => {
  if (!selectedDate) return;
  startTransition(async () => {
    const slots = await fetchSlots(spaceId, selectedDate);
    setSlots(slots);
  });
}, [selectedDate, spaceId]);

// OK: イベントハンドラ内で直接 startTransition（データフローが明示的）
function handleDateChange(date: Date | undefined) {
  dispatch({ type: "selectDate", date });
  if (date && spaceId) {
    startTransition(async () => {
      const slots = await fetchSlots(spaceId, formatDate(date));
      dispatch({ type: "setSlots", slots });
    });
  }
}
```

**`useEffect` が適切な場面**: 外部ストア同期（`useSyncExternalStore` 代替）、サブスクリプション（WebSocket、イベントリスナー）等、ユーザー操作に起因しない副作用のみ。

---

## React Hook Form — `form.getValues()` は非リアクティブ

`form.getValues()` はスナップショット読み取りであり、値が変わっても再レンダリングをトリガーしない。**render 中に使うとステールな値を表示する原因になる**。

```typescript
// NG: render 中の getValues（非リアクティブ — 値が更新されてもUIに反映されない）
<Summary date={form.getValues("date")} />

// OK: useState / useReducer の state を直接使用（リアクティブ）
<Summary date={state.date ? formatDateString(state.date) : ""} />

// OK: リアクティブに値を監視する必要がある場合は useWatch
const date = useWatch({ control: form.control, name: "date" });
```

**例外**: `handleSubmit` コールバック内、`trigger()` 後の条件判定等、イベントハンドラ内での使用は安全。

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

**適用範囲**: 公開ページ・管理画面を問わず、Suspense 内の async Server Component で `new Date()` や uncached データを使う場合に配置する。PPR では Suspense 境界ごとに動的判定されるため、layout の `headers()` は子の Suspense 境界に伝播しない。UI のみの `new Date()`（日付表示等）は Client Component にする。

---

## Adjusting State Directly During Render（prop → state 同期の公式推奨）

`useEffect(() => setState(prop), [prop])` は `react-hooks/set-state-in-effect` 違反かつ二重レンダー。
公式 [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes) の render 中 state sync パターンを使う:

```tsx
const [hexInput, setHexInput] = useState(value);
const [previousValue, setPreviousValue] = useState(value);
if (value !== previousValue) {
  setPreviousValue(value);
  setHexInput(value);
}
```

**判定基準**: 「prop 変化 → local state 同期」だけなら render 中 sync、副作用（DOM/API 呼び出し）を伴うなら useEffect 維持。
参照実装: `TableColorPicker.tsx`（value prop 同期）、`LoginForm.tsx`（useSyncExternalStore との併用で savedEmail hydration 遷移を sync）

**render 中 derive も同系パターン**: 短いクエリで state をリセットしたい場合、`useEffect` で `setXxx([])` するのではなく `const visibleXxx = hasQuery ? xxx : []` で render 中 derive する。参照実装: `InquiryDetail.tsx` / `CustomerSelector.tsx` の `visibleSearchResults`。

---

## Resetting state with key（URL 由来 initial props の remount）

Server Component が URL state（`searchParams` / 動的セグメント）から派生した値を Client Component の初期値として渡す際、同一ルート内で URL が変わっても Client Component は remount されない。React は同じ型・同じ位置のコンポーネントを reuse するため、`useState` lazy init / `useForm defaultValues` / `useReducer` initial state が stale 化する silent bug を起こす。

**公式パターン**（[Resetting a form with a key](https://react.dev/learn/preserving-and-resetting-state#resetting-a-form-with-a-key)）: URL 由来の識別子を `key` prop に渡して強制 remount する。

```tsx
// Server Component (page.tsx)
export default async function Page({ searchParams }: Props) {
  const { id } = await searchParams;
  const entity = await getEntity(id);
  return <EditForm key={entity.id} entity={entity} />; // ← id 変化で remount
}
```

**判定基準**（key 必須）:

1. Server Component が `searchParams` / `params` / cookie 等の request state から値を派生
2. その値（または派生 entity）を Client Component に props で渡す
3. Client Component が `useState(init)` / `useForm({ defaultValues })` / `useReducer(reducer, init)` のいずれかで初期値として消費

3 条件すべて満たすなら `key={urlValue}` 必須。key 値は最も stable な識別子（`entity.id` / `slug` / `typeParam`）を選ぶ。

**key 不要な場合**:

- Client Component が props を直接描画（state キャッシュなし）
- Dialog 内の form（`onOpenChange(false)` で unmount）
- Settings singleton / list page（navigation なし、nuqs `useQueryStates` で URL 直接 subscribe）
- 別 route segment（`/admin/posts` → `/admin/posts/[id]/edit`）— 自動 remount

**参照実装**: `/admin/*/[id]/edit/page.tsx` 全体、`reservation/page.tsx`（`key={initialSpaceId ?? ""}`）、`terms/new/page.tsx`（`key={typeParam}`）、Lexical `InspectorSidebar.tsx`（wrapper div の `key={selectedNode.nodeKey}`）

**同一ルート内 Client Component の node 切替にも応用**: Lexical Inspector パネルのように「同じ型の別インスタンス」を切り替える場合、wrapper 要素に `key={instanceId}` を付けて配下をまとめて remount する（個別パネルに key を付けるより保守しやすい）。

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

**`getServerSnapshot` の参照安定性（必須）**: React はサーバー／ハイドレーション時に `getServerSnapshot` を複数回呼ぶ。戻り値が**オブジェクトや配列**のとき、呼び出しのたびに**新しい参照**を返すと「The result of getServerSnapshot should be cached to avoid an infinite loop」警告や再レンダーループの原因になる。**論理値が同じなら `Object.is` で同一参照になるようにする**。

```typescript
// NG: 毎回新しい配列 → 警告・ループの原因
function getServerSnapshot(): string[] {
  return [];
}

// OK: モジュールスコープの定数を返す（空配列の典型例）
const SERVER_DISMISSED_IDS: string[] = [];
function getServerSnapshot(): string[] {
  return SERVER_DISMISSED_IDS;
}

// OK: プリミティブ（null / false 等）は毎回同じ値なのでそのままでよい
function getServerSnapshot(): null {
  return null;
}
```

オブジェクトスナップショットが「空オブジェクト」など固定値なら、同様にモジュール定数 1 つにまとめる。実装例: `src/app/(public)/_shared/components/announcement-bar/use-dismissed-bars.ts`。

**注意**: ブラウザ API 依存のため `dynamic({ ssr: false })` とセットで使用する。

### 外部ストア + 楽観的 local state の併用パターン

投票・ブックマーク・お気に入り等、**ユーザー操作の即座反映（楽観的更新）** と **localStorage 永続化** の両方が必要な UI は、`useSyncExternalStore` と `useState` を二重 state として組み合わせる。SSR → hydration の遷移は render 中の state sync で橋渡しする（`useEffect` を使うと `@eslint-react/set-state-in-effect` に違反する）。

```tsx
const subscribe = () => () => {}; // localStorage は通知なし
const getServerSnapshot = (): VoteValue | null => null; // プリミティブで参照安定

function Vote({ id }: { id: string }) {
  // 1) 外部ストア（永続値）
  const snapshotRef = useRef<VoteValue | null>(null);
  const storedVote = useSyncExternalStore(
    subscribe,
    () => {
      snapshotRef.current ??= readFromStorage(id);
      return snapshotRef.current;
    },
    getServerSnapshot,
  );

  // 2) 楽観的 local state（UI 即時反映用）
  const [voted, setVoted] = useState<VoteValue | null>(storedVote);

  // 3) hydration 後に storedVote が変わったら voted に反映（render 中 sync）
  //    上記「親 prop の変化を render 中に検知して state を同期」参照
  const [previousStored, setPreviousStored] = useState(storedVote);
  if (storedVote !== previousStored) {
    setPreviousStored(storedVote);
    if (voted === null && storedVote !== null) setVoted(storedVote);
  }

  const handleVote = (vote: VoteValue) => {
    if (voted) return;
    setVoted(vote); // 即時 UI 反映
    writeToStorage(id, vote); // 永続化
    void sendVoteToServer(id, vote); // サーバー集計（fire-and-forget）
  };
}
```

参照実装: `src/app/(public)/faq/_components/faq-helpful-vote.tsx`

**アンチパターン:**

```tsx
// NG: useState lazy initializer で localStorage を読む → hydration mismatch
const [voted, setVoted] = useState(() => readFromStorage(id));

// NG: useEffect で storedVote → voted を同期 → set-state-in-effect 警告
useEffect(() => {
  if (storedVote) setVoted(storedVote);
}, [storedVote]);
```

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

## フックから UI 要素を返すパターン（headless UI）

フックから `ComponentType` を返すと React Compiler / eslint-react v4 でエラー（`component-hook-factories`）。`ReactNode` を返す:

```typescript
// NG: フック内コンポーネント定義（component-hook-factories エラー）
function useDialog() {
  const Dialog = () => <DialogImpl {...props} />;
  return { Dialog }; // ComponentType
}
<picker.Dialog />

// OK: ReactNode を返す（use-media-picker.tsx が実装例）
function useDialog() {
  const dialogElement = <DialogImpl {...props} />;
  return { dialogElement }; // ReactNode
}
{picker.dialogElement}
```

---

## 禁止事項（本文未掲載のパターン）

上記各セクションに加え、以下のパターンも禁止:

| 禁止パターン                                                           | 代替                                                                 |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `useOptimistic` なしで楽観的 UI を手動実装                             | `useOptimistic` を使用                                               |
| `useFormStatus` を `<form>` の外で使用                                 | `<form>` 子孫コンポーネント内に配置                                  |
| クラスコンポーネント（新規作成）                                       | 関数コンポーネント（Compiler 対応）                                  |
| `use(fetchData())` をコンポーネント内に直接記述                        | Suspense boundary の外で Promise を生成して渡す                      |
| `ViewTransition` を `startTransition` 外で使用                         | `startTransition` で状態更新をラップする                             |
| `useId` の生成値を文字列として依存                                     | `id` 属性への渡し方のみ使用（形式は変更される可能性あり）            |
| `useSyncExternalStore` の `getServerSnapshot` で毎回新しい `[]` / `{}` | モジュール定数で参照を固定（上記「getServerSnapshot の参照安定性」） |

---

## Gotchas

- **自動切替コンテンツに `role="alert"` 禁止** — `role="alert"` は暗黙で `aria-live="assertive"` を設定し、切替のたびにスクリーンリーダーが割り込む。カルーセル等には `role="region" aria-live="polite" aria-label="..."` を使用
- **ダイアログを条件分岐の内側でレンダリング禁止** — early return や三項演算子の片側に `<Dialog>` / `<AlertDialog>` を置くと、他の状態から `open={true}` にしても表示されない。ダイアログはコンポーネント末尾のトップレベルで常にレンダリングする
- **`FormLabel` は `FormField` の `render` prop 内でのみ使用可能** — `FormLabel` 内部で `useFormField()` を呼ぶため、`FormField` コンテキスト外で使うと `useFormField should be used within <FormField>` ランタイムエラー。プレビューラベル等のフォーム外テキストには `<p className="text-sm font-medium">` を使用
- **Prisma オブジェクトを Client Component や `'use cache'` 関数の戻り値に使うと Symbol エラー** — `nodejs.util.inspect.custom` 等の Symbol プロパティが混入し `Only plain objects can be passed to Client Components` エラーが発生。`'use cache'` 関数の戻り値も React シリアライゼーション層を通るため同様。**ドメインクエリ層**（`public-queries.ts` 等）で `toPlainObject`/`toPlainArray` + `Decimal` → `Number` 変換を一元化し、呼び出し側での変換を不要にする。`Date` フィールドは実行時 ISO 文字列になるため表示には `toISOString()` / `formatSerializedDate()` を使用
- **`toPlainObject` は `Serialized<T>` を返す** — ドメインクエリが `toPlainObject()` を通すと `Date` → `string` に変換される。クエリの戻り型は `Serialized<T>` で宣言し、Client Component の props も `Serialized<T>` で受け取る。`Date` 型のまま Client Component に渡すと実行時は `string` なのに型は `Date` になる不整合が発生する
- **`element.style.*` への色指定も CSS 変数を使う** — `el.style.backgroundColor = "oklch(...)"` 禁止。`color-mix(in oklch, var(--color-background) 90%, transparent)` や `var(--shadow-sm)` 等の CSS 変数参照で記述する。ScrollTrigger コールバック等の GSAP 内インラインスタイルも同様
- **管理者入力 HTML は `SanitizedHtml` 必須** — 生の HTML 直接レンダリング禁止。`import { SanitizedHtml } from "@/shared/components/SanitizedHtml"` を使う（isomorphic-dompurify, ADD_TAGS: ['iframe']）。例外: JSON-LD の `<script type="application/ld+json">` は JSON.stringify() 経由のため安全で変更不要
- **`useFormStatus` は react-hook-form の `onSubmit` パターンと非互換** — `useFormStatus` は `<form action={}>` でのみ動作する。`useFormAction`（react-hook-form + `useTransition`）や **`useActionState` + RHF ハイブリッド**（例: `SpaceEditForm`）では、待機状態は **`SubmitButton` に `isPending` を prop で渡す**（`useActionState` の第3戻り値や `useTransition` の pending）。`useFormStatus` への移行は不要
- **`DndContext`（@dnd-kit）には必ず `id` prop を付与** — 未指定だと内部カウンター（`DndDescribedBy-N`）が SSR/クライアントでずれ hydration mismatch が発生する。固定コンポーネントは文字列リテラル（`id="xxx-sortable"`）、汎用コンポーネントは `useId()` を使用
- **`@eslint-react/eslint-plugin` v4 でルール名プレフィックスフラット化** — `@eslint-react/dom/no-xxx` → `@eslint-react/dom-no-xxx`、`@eslint-react/web-api/no-xxx` → `@eslint-react/web-api-no-xxx`。eslint-disable コメントと `eslint.config.mjs` のルール名を一括置換。v4 で `@eslint-react/purity` の `new Date()` false positive が大幅改善（大半の disable コメントを削除可能）
- **JSX 内の IIFE 禁止**（`@eslint-react/unsupported-syntax`）— `{(() => { ... })()}` パターンは React Compiler が最適化できないため error。JSX 前に変数抽出する
- **`useSyncExternalStore` の `getServerSnapshot` で配列・オブジェクトを毎回新規生成しない** — `return []` / `return {}` は NG。モジュール定数や固定参照を返す。プリミティブ（`null`, `false` 等）は OK

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
