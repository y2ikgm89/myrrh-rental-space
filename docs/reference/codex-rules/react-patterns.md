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

## React Compiler 互換ルール

React Compiler（Next.js 16 でデフォルト有効）が自動メモ化するため、
手動での最適化は原則不要。不適切なパターンはコンパイラエラーの原因になる。

### useCallback / useMemo（原則不要）

```typescript
// NG: 不要なメモ化（React Compiler が自動処理）
const handleClick = useCallback(() => {
  doSomething(value)
}, [value])

const total = useMemo(() => items.reduce((s, i) => s + i.price, 0), [items])

// OK: プレーン関数・式で記述（Compiler が最適化）
const handleClick = () => {
  doSomething(value)
}

const total = items.reduce((s, i) => s + i.price, 0)
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
| `useCallback` 内で `ref.current` を参照 | プレーン関数に変更 |
| `watch('fieldName')` (React Hook Form) | `useWatch({ control, name: 'fieldName' })` |
| `useOptimistic` なし で楽観的 UI を手動実装 | `useOptimistic` を使用 |
| `useFormStatus` を form の外で使用 | `<form>` 子孫コンポーネント内に配置 |

---

## 参考

- [React 19 リリースノート](https://react.dev/blog/2024/12/05/react-19)
- [ref as a prop（forwardRef 廃止）](https://react.dev/blog/2024/04/25/react-19#ref-as-a-prop)
- [useEffectEvent](https://react.dev/reference/react/useEffectEvent)
- [useOptimistic](https://react.dev/reference/react/useOptimistic)
- [useActionState](https://react.dev/reference/react/useActionState)
- [useFormStatus](https://react.dev/reference/react-dom/hooks/useFormStatus)
- [React Hook Form useWatch](https://react-hook-form.com/docs/usewatch)
- [React Compiler](https://react.dev/learn/react-compiler)
