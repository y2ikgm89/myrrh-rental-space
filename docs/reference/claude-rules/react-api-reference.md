# React API 詳細リファレンス

> このファイルは `.claude/rules/react-patterns.md` の詳細セクション。
> コア原則とルールは `.claude/rules/react-patterns.md` を参照。

---

## コンパイル問題の診断フロー

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

---

## React Compiler 制限事項（コンパイルをスキップする条件）

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
このような場合は `'use no memo'` で一時除外し、コードを修正する（→ `.claude/rules/react-patterns.md` §Rules of React 参照）。

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

## 参考リンク

- [useEffectEvent](https://react.dev/reference/react/useEffectEvent)
- [useOptimistic](https://react.dev/reference/react/useOptimistic)
- [useActionState](https://react.dev/reference/react/useActionState)
- [useFormStatus](https://react.dev/reference/react-dom/hooks/useFormStatus)
- [use() API](https://react.dev/reference/react/use)
- [ViewTransition](https://react.dev/reference/react/ViewTransition)
- [Fragment refs / FragmentInstance](https://react.dev/reference/react/Fragment#fragmentinstance)
- [Resource Preloading（prefetchDNS / preconnect / preload / preinit）](https://react.dev/reference/react-dom#resource-preloading-apis)
- [Activity コンポーネント](https://react.dev/reference/react/Activity)
- [React Compiler — デバッグ](https://react.dev/learn/react-compiler/debugging)
