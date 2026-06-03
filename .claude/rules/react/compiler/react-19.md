---
description: React 19 破壊的変更（forwardRef 廃止 / ComponentPropsWithRef）+ Context API の use() フック
paths:
  - "src/**/*.tsx"
  - "src/**/use-*.ts"
  - "src/**/use[A-Z]*.ts"
  - "src/**/hooks.ts"
  - "src/**/hooks/**/*.ts"
  - "src/**/_hooks/**/*.ts"
  - "src/**/editor/**/*.ts"
  - "src/shared/lib/conform/**"
---

# React 19 破壊的変更 + Context API

> forwardRef 廃止 + ComponentPropsWithRef + `use(Context)` フック（`useContext` 非推奨）。

## forwardRef 廃止（必須対応）

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

## ComponentPropsWithRef の使い方

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

## Context API（use() フック）

React 19 では `use()` フックで Context を消費する。`useContext()` は非推奨（将来削除予定）。

### use() の利点

- **条件分岐後でも呼べる** — 通常の Hook と異なり、条件・ループ内でも使用可能
- **`undefined` デフォルト値** — `createContext<T | undefined>(undefined)` で Context 外使用を型で検出できる

```typescript
import { createContext, use } from "react";

// NG: React 18 パターン（非推奨）
const Ctx = createContext<MyContextValue | null>(null);
function useMyContext() {
  const value = useContext(Ctx);
  if (!value) throw new Error("...");
  return value;
}

// OK: React 19 パターン（このプロジェクトの標準）
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
