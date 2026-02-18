# React パターンルール

> React 19.2 / React Compiler 1.0 対応

## React 19.2 新機能（利用可能・未採用）

> 以下の機能は React 19.2 で利用可能だが、本コードベースでは未採用。
> 新規実装で必要になった場合に採用を検討する。

### useEffectEvent

Effect内で最新のprops/stateにアクセスしつつ、依存配列に含めない場合に使用:

```typescript
import { useEffect, useEffectEvent } from 'react'

function ChatRoom({ roomId, theme }) {
  // Effect Event: 依存配列に含めず最新値にアクセス
  const onConnected = useEffectEvent(() => {
    showNotification('Connected!', theme)  // themeは常に最新
  })

  useEffect(() => {
    const connection = createConnection(serverUrl, roomId)
    connection.on('connected', () => {
      onConnected()  // ✅ Effect内でローカルに呼び出し
    })
    connection.connect()
    return () => connection.disconnect()
  }, [roomId])  // ✅ themeを依存配列に含めない
}
```

**ルール:**
- Effect Eventは同じコンポーネント/フック内で宣言
- Effect内でローカルに呼び出す（propsとして渡さない）
- リンターエラー回避目的での乱用禁止

### Activity コンポーネント（未採用）

UIと内部状態の非表示/復元:

```typescript
import { Activity } from 'react'

function App() {
  return (
    <Activity mode={isVisible ? 'visible' : 'hidden'}>
      <ExpensiveComponent />  {/* 状態が保持される */}
    </Activity>
  )
}
```

## forwardRef 禁止（React 19 不要）

React 19 では `ref` は通常のpropとして渡せるため、`forwardRef` は不要:

```typescript
// NG: React 18以前のパターン
const Input = forwardRef<HTMLInputElement, InputProps>((props, ref) => (
  <input ref={ref} {...props} />
))
Input.displayName = 'Input'

// OK: React 19 パターン（ref は通常の prop）
function Input({ ref, ...props }: InputProps & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} {...props} />
}

// OK: ComponentPropsWithRef で Radix UI 等の型を継承
function RadioGroup({ ref, className, ...props }: ComponentPropsWithRef<typeof Root>) {
  return <Root className={cn('grid gap-2', className)} {...props} ref={ref} />
}
```

**ルール:**
- `forwardRef` / `React.forwardRef` の使用禁止
- `displayName` の手動設定不要（名前付き関数なら自動推論）
- `ComponentPropsWithoutRef` → `ComponentPropsWithRef` に変更

## React Compiler 互換性

React Compiler（Next.js 16でデフォルト有効）と互換性のあるコードを書く。

### React Hook Form

`watch()` は使用禁止。代わりに `useWatch()` を使用:

```typescript
// NG: React Compilerでメモ化不可、フォーム全体が再レンダリング
const { watch } = useForm()
const value = watch('fieldName')

// OK: コンポーネントレベルで再レンダリング分離
const { control } = useForm()
const value = useWatch({ control, name: 'fieldName' })

// OK: 複数フィールドを監視
const values = useWatch({
  control,
  name: ['firstName', 'lastName']
})

// OK: compute関数で条件付き監視
const computed = useWatch({
  control,
  compute: (data) => data.test?.length ? data.test : ''
})
```

**理由:**
- `watch`はフォームのルートで再レンダリングを引き起こす
- `useWatch`はコンポーネントレベルで分離され、パフォーマンス向上
- React Compilerは`watch`の戻り値をメモ化できない

### useCallback / useMemo

React Compilerが自動メモ化するため、基本的に手動での`useCallback`/`useMemo`は不要。
ただし、以下の場合は明示的に使用:

- 外部ライブラリのAPIが関数の参照同一性を要求する場合
- `useSyncExternalStore`のsubscribe関数
- パフォーマンス計測で明確なボトルネックが確認された場合

```typescript
// OK: 通常は不要（React Compilerが最適化）
const handleClick = () => { ... }

// OK: 外部ライブラリ要件で明示的に使用
const subscribe = useCallback((callback) => {
  window.addEventListener('storage', callback)
  return () => window.removeEventListener('storage', callback)
}, [])
```

### useCallback + ref.current の衝突

`useCallback` 内で `ref.current` を参照すると、React Compiler が推論する依存（`ref.current`）と手動の依存配列が一致せず `react-hooks/preserve-manual-memoization` エラーになる。

```typescript
// NG: React Compiler エラー — ref.current が依存配列に不足
const stateRef = useRef(true)
const handleMove = useCallback((e: React.MouseEvent) => {
  if (!stateRef.current) return
  doSomething(e)
}, [])  // Compiler: "inferred dependency stateRef.current"

// OK: useCallback を除去（React Compiler が自動メモ化）
const handleMove = (e: React.MouseEvent) => {
  if (!stateRef.current) return
  doSomething(e)
}
```

**ルール**: ref を参照するイベントハンドラでは `useCallback` を使わずプレーン関数で定義する。GSAP アニメーション系のイベントハンドラで特に頻出（→ `gsap-patterns.md` パターン C）。

## 参考

- [React 19.2 Release Notes](https://react.dev/blog/2025/10/01/react-19-2)
- [useEffectEvent Documentation](https://react.dev/reference/react/useEffectEvent)
- [React Hook Form useWatch](https://react-hook-form.com/docs/usewatch)
