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

| 廃止パターン | React Compiler が自動処理 |
|------------|--------------------------|
| `useCallback` | 関数参照の同一性を自動保持 |
| `useMemo` | 計算結果の自動キャッシュ |
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
  window.addEventListener('storage', callback)
  return () => window.removeEventListener('storage', callback)
}, [])

// OK: 外部ライブラリが関数の参照同一性を明示的に要求する場合
// OK: パフォーマンス計測で明確なボトルネックが確認された場合のみ
```

### useCallback + ref.current の衝突（重要）

`useCallback` 内で `ref.current` を参照すると、React Compiler が推論する依存（`ref.current`）と
手動の依存配列が一致せず `react-hooks/preserve-manual-memoization` エラーになる。

```typescript
// NG: React Compiler エラー — ref.current が依存配列に不足
const stateRef = useRef(true)
const handleMove = useCallback((e: React.MouseEvent) => {
  if (!stateRef.current) return
  doSomething(e)
}, [])
// Compiler: "inferred dependency stateRef.current" でエラー

// OK: useCallback を除去してプレーン関数（Compiler が自動メモ化）
const stateRef = useRef(true)
const handleMove = (e: React.MouseEvent) => {
  if (!stateRef.current) return
  doSomething(e)
}
```

**ルール**: `ref` を参照するイベントハンドラでは `useCallback` を使わずプレーン関数で定義する。
GSAP アニメーション系のイベントハンドラで特に頻出（→ `gsap-patterns.md` パターン C）。

### 'use no memo' — コンパイル除外（一時的エスケープハッチ）

コンパイラに問題があるコンポーネントを一時的に除外する。**恒久的な使用は禁止**:

```typescript
// NG: 恒久的に 'use no memo' を使い続ける（Rules of React 違反を放置）
function ProblematicComponent() {
  "use no memo"  // 根本原因を修正しないまま放置
  // ...
}

// OK: 一時的なデバッグ・段階的移行（TODO コメント必須）
function TemporarilyExcluded() {
  "use no memo" // TODO: #123 — 副作用がレンダリング中に発生している問題を修正後に削除
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

### コンパイル問題の診断フロー

```typescript
// Step 1: 'use no memo' で問題コンポーネントのみ除外して問題を特定
function SuspectedComponent() {
  "use no memo" // 一時的に除外して問題が解消するか確認
  // ...
}

// Step 2: bun run lint で Rules of React 違反を確認
// react-hooks/purity, react-hooks/exhaustive-deps 等のエラーを調査

// Step 3: React Compiler DevTools（ブラウザ拡張機能）でコンパイル状態を確認
// ✓ Optimized = コンパイル成功 / ✗ Skipped = Rules of React 違反あり

// Step 4: 違反を修正後、'use no memo' を削除して再確認
```

### React Compiler 制限事項（コンパイルをスキップする条件）

以下のパターンは React Compiler が最適化できずスキップされる:

**1. try/catch ブロック内の複雑なロジック**

`try` ブロック内で条件分岐・optional chaining を組み合わせるとコンパイラがスコープを正しく追跡できずスキップされる（既知バグ #35570）:

```typescript
// NG: try/catch 内の条件分岐 + optional chaining（コンパイルをスキップ）
function Component({ data }: { data?: DataType }) {
  try {
    const result = data?.items?.map((item) => {
      if (!item.isValid) return null
      return process(item)
    })
    return <div>{result}</div>
  } catch (e) {
    return <div>Error</div>
  }
}

// OK: ロジックを外部ヘルパー関数に切り出す
function Component({ data }: { data?: DataType }) {
  const result = processData(data)
  return <div>{result}</div>
}

function processData(data?: DataType) {
  try {
    return data?.items?.map((item) => (!item.isValid ? null : process(item)))
  } catch {
    return null
  }
}
```

**2. クラスコンポーネント（非対応）**

React Compiler は関数コンポーネント専用。クラスコンポーネントは最適化されない:

```typescript
// NG: クラスコンポーネント（Compiler がスキップ）
class Counter extends React.Component<Props, State> {
  render() {
    return <div>{this.state.count}</div>
  }
}

// OK: 関数コンポーネントに書き換える
function Counter({ initialCount }: Props) {
  const [count, setCount] = useState(initialCount)
  return <div>{count}</div>
}
```

**3. メモ化の実行タイミングに依存するコード**

Compiler の最適化により `useMemo`/`useCallback` の実行タイミングが変わる場合がある。
副作用を `useMemo` 内に入れる等、メモ化のタイミングに依存するコードは動作が変わる可能性がある。
このような場合は `'use no memo'` で一時除外し、コードを修正する（→ §Rules of React 参照）。

### React Hook Form — watch() 禁止

`watch()` は使用禁止。代わりに `useWatch()` を使用:

```typescript
// NG: React Compiler でメモ化不可、フォーム全体が再レンダリング
const { watch } = useForm()
const value = watch('fieldName')

// OK: コンポーネントレベルで再レンダリングを分離
const { control } = useForm()
const value = useWatch({ control, name: 'fieldName' })

// OK: 複数フィールドを同時監視
const [firstName, lastName] = useWatch({
  control,
  name: ['firstName', 'lastName'],
})

// OK: compute 関数で派生値を計算
const isValid = useWatch({
  control,
  compute: (data) => Boolean(data.email && data.password),
})
```

**理由:**
- `watch` はフォームのルート（`useForm` を呼んだコンポーネント）全体を再レンダリングする
- `useWatch` はサブコンポーネントレベルで再レンダリングを分離し、パフォーマンスを向上させる
- React Compiler は `watch` の戻り値をメモ化できない

---

## React 19.2 新機能

### useEffectEvent

Effect 内で最新の props/state にアクセスしつつ、依存配列に含めたくない場合に使用。
Effect Event は「Effect の中で起きたことに反応するが、それ自体は非リアクティブ」。

```typescript
import { useEffect, useEffectEvent } from 'react'

// OK: Effect Event で最新値にアクセス（roomId の変化のみでエフェクトを再実行）
function ChatRoom({ roomId, theme }: { roomId: string; theme: string }) {
  const onConnected = useEffectEvent(() => {
    showNotification('Connected!', theme)  // theme は常に最新値
  })

  useEffect(() => {
    const connection = createConnection(serverUrl, roomId)
    connection.on('connected', () => {
      onConnected()  // Effect 内でローカルに呼び出す
    })
    connection.connect()
    return () => connection.disconnect()
  }, [roomId])  // theme を依存配列に含めない（onConnected も含めない）
}
```

```typescript
// NG: 依存配列に Effect Event を含める（不要な再実行）
useEffect(() => {
  onConnected()
}, [onConnected])  // エラー: Effect Event を deps に含めてはいけない

// NG: Effect Event を別のフックや関数に props として渡す
function useTimer(callback: () => void, delay: number) {
  const onTick = useEffectEvent(callback)
  // ...
}
useTimer(onTick, 1000)  // onTick を渡してはいけない
```

**ルール:**
- 同じコンポーネント/フック内で宣言し、Effect 内でローカルに呼び出す
- 依存配列（`[]`）に Effect Event を含めない
- 他のフックやコンポーネントに props として渡さない
- リンターエラー回避目的での乱用禁止

### useOptimistic

Server Actions の完了前に UI を楽観的に更新するパターン:

```typescript
import { useOptimistic, useRef } from 'react'
import { sendMessage } from './actions'

function MessageThread({ messages }: { messages: Message[] }) {
  const formRef = useRef<HTMLFormElement>(null)

  const [optimisticMessages, addOptimisticMessage] = useOptimistic(
    messages,
    (state: Message[], newText: string) => [
      ...state,
      { id: crypto.randomUUID(), text: newText, sending: true },
    ]
  )

  async function formAction(formData: FormData) {
    const text = formData.get('message') as string
    addOptimisticMessage(text)  // 即時 UI 反映
    formRef.current?.reset()
    await sendMessage(formData)  // Server Action 完了後に実態が反映
  }

  return (
    <>
      {optimisticMessages.map((msg) => (
        <div key={msg.id}>
          {msg.text}
          {msg.sending && <small> (送信中...)</small>}
        </div>
      ))}
      <form action={formAction} ref={formRef}>
        <input type="text" name="message" />
        <button type="submit">送信</button>
      </form>
    </>
  )
}
```

### useActionState

フォームの Server Action の状態（結果・pending）を管理する:

```typescript
import { useActionState } from 'react'
import { submitForm } from './actions'
import type { ActionResult } from '@/shared/types/server-actions'

// NG: useState + 手動の try/catch でフォーム状態を管理
const [error, setError] = useState<string | null>(null)
const [isPending, setIsPending] = useState(false)
const handleSubmit = async (data: FormData) => {
  setIsPending(true)
  try {
    const result = await submitForm(data)
    if (!result.success) setError(result.error)
  } finally {
    setIsPending(false)
  }
}

// OK: useActionState で状態を一元管理
const [state, formAction, isPending] = useActionState(
  async (prev: ActionResult | null, formData: FormData) => {
    return await submitForm(formData)
  },
  null
)

return (
  <form action={formAction}>
    {state && !state.success && <p className="text-destructive">{state.error}</p>}
    <input name="email" type="email" />
    <button type="submit" disabled={isPending}>
      {isPending ? '送信中...' : '送信'}
    </button>
  </form>
)
```

### useFormStatus

フォームの送信状態（pending）を子コンポーネントで取得する。
props のバケツリレーなしにフォームの状態にアクセスできる:

```typescript
import { useFormStatus } from 'react-dom'

// OK: デザインシステムのボタンコンポーネントでフォーム状態を利用
function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}>
      {pending ? '処理中...' : children}
    </button>
  )
}

// 使用側: SubmitButton は form の子孫に配置すればよい
function ContactForm() {
  return (
    <form action={submitContactAction}>
      <input name="email" type="email" />
      <SubmitButton>送信</SubmitButton>  {/* props 不要 */}
    </form>
  )
}
```

**注意**: `useFormStatus` は `<form>` 要素の**子孫コンポーネント**内でのみ機能する。同一コンポーネント内では使用不可。

### Activity コンポーネント

UI を非表示にしながら内部状態（スクロール位置・フォーム入力等）を保持する:

```typescript
import { Activity } from 'react'

// OK: タブ切り替えで状態を保持したまま非表示
function TabPanel({ activeTab }: { activeTab: string }) {
  return (
    <>
      <Activity mode={activeTab === 'profile' ? 'visible' : 'hidden'}>
        <ProfileTab />  {/* 非表示でも内部状態を保持 */}
      </Activity>
      <Activity mode={activeTab === 'settings' ? 'visible' : 'hidden'}>
        <SettingsTab />
      </Activity>
    </>
  )
}

// NG: 条件レンダリング（再マウントで状態がリセット）
{activeTab === 'profile' && <ProfileTab />}
```

**使い分け**:
- 状態を保持しながら非表示 → `Activity`
- 状態のリセットが必要 → 条件レンダリング（`&&`）
- アニメーション付き表示切替 → CSS `visibility` / `opacity` + `Activity`

### use()

Promise・Context をレンダー内で同期的に読む API。他のフックと異なり **`if` 文の中でも呼べる**:

```typescript
import { use, Suspense } from 'react'

// Promise を読む（未解決なら Suspense に委譲）
function Comments({ commentsPromise }: { commentsPromise: Promise<Comment[]> }) {
  const comments = use(commentsPromise)  // Promise が解決するまでサスペンド
  return comments.map((comment) => <p key={comment.id}>{comment.text}</p>)
}

// Context を読む（useContext の代替 — 条件分岐内でも呼べる点が異なる）
function ThemedButton({ showTheme }: { showTheme: boolean }) {
  if (showTheme) {
    const theme = use(ThemeContext)  // 条件分岐内でも OK（他のフックは不可）
    return <button style={{ color: theme.primary }}>Click</button>
  }
  return <button>Click</button>
}

// 使用側: Suspense でラップしてフォールバックを提供
function Page() {
  const commentsPromise = fetchComments()  // Suspense boundary の外で Promise を生成
  return (
    <Suspense fallback={<p>読み込み中...</p>}>
      <Comments commentsPromise={commentsPromise} />
    </Suspense>
  )
}
```

**注意**: `use()` に渡す Promise は **Suspense boundary の外で生成する**こと。
コンポーネント内で直接 `use(fetchData())` を書くと毎レンダリングで新しい Promise が生成され、無限ループになる。

### ViewTransition（React 19.2）

ブラウザの [View Transitions API](https://developer.chrome.com/docs/web-platform/view-transitions) をラップしたコンポーネント。
`startTransition` で囲まれた状態変化に対してアニメーションを適用する:

```typescript
import { ViewTransition, startTransition, useState } from 'react'

// 基本: ViewTransition でラップした要素が状態変化時にアニメーション
function SortableList({ videos }: { videos: Video[] }) {
  const [ordered, setOrdered] = useState(videos)

  function handleSort() {
    startTransition(() => {  // ViewTransition は startTransition 必須
      setOrdered((prev) => [...prev].reverse())
    })
  }

  return (
    <>
      <button type="button" onClick={handleSort}>並び替え</button>
      <ViewTransition>
        <ul>{ordered.map((v) => <li key={v.id}>{v.title}</li>)}</ul>
      </ViewTransition>
    </>
  )
}

// Shared Element Transition: name prop で要素を対応させる
// 一覧 → 詳細 への画面遷移で、サムネイルが展開するアニメーション
function VideoThumbnail({ video }: { video: Video }) {
  return (
    <ViewTransition name={`video-thumbnail-${video.id}`}>
      <img src={video.thumbnail} alt={video.title} />
    </ViewTransition>
  )
}

function VideoDetail({ video }: { video: Video }) {
  return (
    <ViewTransition name={`video-thumbnail-${video.id}`}>
      <img src={video.hero} alt={video.title} className="w-full" />
    </ViewTransition>
  )
}
```

**CSS でアニメーションをカスタマイズ**（Tailwind `@keyframes` と組み合わせ可能）:

```css
/* ViewTransition の enter/exit で CSS クラスが付与される */
::view-transition-old(root) { animation: fade-out 0.3s ease; }
::view-transition-new(root) { animation: fade-in 0.3s ease; }
```

**制約:**
- `startTransition` で囲まれた状態更新のみ対象（通常の `setState` は対象外）
- Chrome 111+ / Safari 18+ 対応（ブラウザサポートを確認する）
- `prefers-reduced-motion` 対応は CSS で行う（`accessibility.md` §prefers-reduced-motion 参照）

### Fragment refs（React 19.2）

`<Fragment ref={...}>` が使用可能になった。`FragmentInstance` を通じて複数要素をまたがるイベント・フォーカス管理ができる:

```typescript
import { Fragment, useRef } from 'react'

// FragmentInstance を ref で取得
function ClickableGroup({ children }: { children: React.ReactNode }) {
  const groupRef = useRef<FragmentInstance>(null)

  // FragmentInstance のメソッド:
  // addEventListener, removeEventListener — イベント委譲
  // focus, focusLast, blur         — フォーカス管理
  // observeUsing, unobserveUsing   — ResizeObserver / IntersectionObserver
  // getClientRects                 — 領域取得
  // dispatchEvent                  — イベント発行

  return (
    <Fragment ref={groupRef}>
      {children}
    </Fragment>
  )
}

// クリーンアップ関数を返すパターン（useEffect 不要）
function AutoCleanup({ onActivate }: { onActivate: () => void }) {
  return (
    <Fragment
      ref={(instance) => {
        if (!instance) return
        const handler = () => onActivate()
        instance.addEventListener('click', handler)
        return () => instance.removeEventListener('click', handler)  // アンマウント時に自動実行
      }}
    >
      <button type="button">A</button>
      <button type="button">B</button>
    </Fragment>
  )
}
```

**ユースケース**:
- 複数要素のグループにイベントリスナーを付与（イベント委譲）
- `focus()` / `focusLast()` でグループ内の最初・最後の要素にフォーカス
- 単一の DOM ノードを返せないコンポーネントへの `ref` 付与

### Resource Preloading（react-dom）

Next.js の `<head>` 管理とは別に、`react-dom` のリソースプリロード API でパフォーマンスを向上できる:

```typescript
import {
  prefetchDNS,  // DNS プリフェッチ（DNSルックアップのみ）
  preconnect,   // 接続確立（DNS + TCP + TLS）
  preload,      // リソースの先読み（fetch priority: high）
  preinit,      // スクリプト・スタイルシートの即時実行
} from 'react-dom'

// Server Components / Client Components 両方で使用可能
function MyApp() {
  // 外部オリジンへの事前接続（API サーバー、CDN 等）
  prefetchDNS('https://fonts.googleapis.com')
  preconnect('https://fonts.gstatic.com')

  // 重要なリソースの先読み
  preload('/fonts/NotoSansJP.woff2', { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' })

  // スクリプトの事前実行（サードパーティ分析ツール等）
  preinit('https://www.googletagmanager.com/gtag/js', { as: 'script' })

  return <div>...</div>
}
```

**使い分け:**

| API | 動作 | 用途 |
|-----|------|------|
| `prefetchDNS` | DNS ルックアップのみ | 後で使うかもしれない外部ドメイン |
| `preconnect` | DNS + TCP + TLS | ほぼ確実に使う外部オリジン |
| `preload` | リソースを fetch（ブラウザキャッシュへ） | 重要なフォント・画像・JS |
| `preinit` | fetch + 即時実行/適用 | 分析スクリプト・クリティカル CSS |

---

## Server Components / Server Actions パターン

### データ取得（Server Component）

```typescript
// OK: async Server Component でデータ取得
export default async function PostList() {
  const posts = await getPosts()  // サーバー側で直接 DB アクセス

  return (
    <ul>
      {posts.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}
```

### Server Action の基本パターン

詳細は `server-actions.md` を参照。基本構造のみ示す:

```typescript
'use server'

// OK: 型安全な Server Action
export async function createPost(formData: FormData): Promise<ActionResult> {
  const auth = await checkPermission('post', 'create')
  if (!auth.success) return auth.error

  const validated = postSchema.safeParse(Object.fromEntries(formData))
  if (!validated.success) {
    return { success: false, error: z.flattenError(validated.error) }
  }

  const post = await prisma.post.create({ data: validated.data })
  updateTag(CACHE_TAGS.POSTS)
  return { success: true, data: post }
}
```

---

## 禁止事項

| 禁止パターン | 代替 |
|-------------|------|
| `forwardRef` / `React.forwardRef` | `ref` を通常の prop として受け取る |
| `ComponentPropsWithoutRef` | `ComponentPropsWithRef` |
| `Input.displayName = 'Input'` | 名前付き関数で自動推論 |
| `useCallback` / `useMemo`（原則） | プレーン関数・式（Compiler が最適化） |
| `React.memo()`（原則） | プレーン関数コンポーネント（Compiler が最適化） |
| `useCallback` 内で `ref.current` を参照 | プレーン関数に変更 |
| `watch('fieldName')` (React Hook Form) | `useWatch({ control, name: 'fieldName' })` |
| `useOptimistic` なし で楽観的 UI を手動実装 | `useOptimistic` を使用 |
| `useFormStatus` を form の外で使用 | `<form>` 子孫コンポーネント内に配置 |
| `"use no memo"` を恒久的に使用 | Rules of React 違反を修正して削除 |
| `eslint-plugin-react-compiler` の継続使用 | `eslint-plugin-react-hooks@latest` に統合済み |
| クラスコンポーネント（新規作成） | 関数コンポーネントに書き換える（Compiler 対応） |
| `use(fetchData())` をコンポーネント内に直接記述 | Suspense boundary の外で Promise を生成して渡す |
| `ViewTransition` を `startTransition` 外で使用 | `startTransition` で状態更新をラップする |
| `useId` の生成値を文字列として依存 | 形式が変更される（19.0: `:r:` → 19.2: `_r_`）。`id` 属性への渡し方のみ使用する |

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
- [useEffectEvent](https://react.dev/reference/react/useEffectEvent)
- [useOptimistic](https://react.dev/reference/react/useOptimistic)
- [useActionState](https://react.dev/reference/react/useActionState)
- [useFormStatus](https://react.dev/reference/react-dom/hooks/useFormStatus)
- [React Hook Form useWatch](https://react-hook-form.com/docs/usewatch)
- [use() API](https://react.dev/reference/react/use)
- [ViewTransition](https://react.dev/reference/react/ViewTransition)
- [Fragment refs / FragmentInstance](https://react.dev/reference/react/Fragment#fragmentinstance)
- [Resource Preloading（prefetchDNS / preconnect / preload / preinit）](https://react.dev/reference/react-dom#resource-preloading-apis)
- [Activity コンポーネント](https://react.dev/reference/react/Activity)
