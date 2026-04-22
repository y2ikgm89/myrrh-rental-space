---
description: React フォーム・SSR パターン（RHF getValues・PPR new Date()・Adjusting State During Render・key remount）
paths:
  - "src/**/*.tsx"
  - "src/**/*.ts"
---

# React フォーム・SSR パターン

> React 19.2 / Next.js 16 対応

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
