# StripeSection server-only 修正 + 顧客編集機能 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** `StripeSection.tsx`（Client Component）が `server-only` バウンダリを越えて `stripe.ts` を import しているビルドエラーを根本解決し、顧客の全フィールド編集機能を追加する。

**Architecture:** `stripe.ts` からクライアント安全なコード（型・定数・キー形式検証）を `stripe-shared.ts` に分離して import 経路を修正することで `server-only` カスケードを解消する。顧客編集は `react-hook-form` + `useKanaInput` + `updateCustomer` Server Action のパターンで実装する。

**Tech Stack:** Next.js 16, React 19, TypeScript 6.0-beta, Prisma 7, Zod 4, react-hook-form, withPermission HOF

---

## コンテキスト（実装者向け）

### プロジェクト構造

```
src/app/(admin)/admin/(dashboard)/
├── _shared/
│   ├── actions/
│   │   ├── customer.ts              # 顧客 Server Actions
│   │   └── settings/
│   │       ├── basic.ts             # 基本設定 Server Actions（maskSecretKey を import）
│   │       └── stripe.ts            # Stripe 設定 Server Actions
│   └── lib/
│       ├── stripe.ts                # ❌ server-only + Stripe client + 検証関数（混在）
│       ├── stripe-shared.ts         # ✅ 【Task 1 で新規作成】client-safe コード
│       └── validations/
│           ├── customer.ts          # 顧客バリデーションスキーマ
│           └── stripe.ts            # Stripe Zod スキーマ（stripe.ts を import → 修正必要）
├── customers/
│   ├── _components/
│   │   ├── CustomerForm.tsx         # 顧客作成フォーム（参考パターン）
│   │   └── CustomerEditForm.tsx     # 【Task 6 で新規作成】
│   └── [id]/
│       ├── _components/
│       │   └── CustomerDetail.tsx   # 【Task 8 で編集ボタン追加】
│       └── edit/
│           └── page.tsx             # 【Task 7 で新規作成】
└── settings/
    └── _components/
        └── sections/
            └── StripeSection.tsx    # ❌ use client + stripe.ts import（修正必要）
```

### エイリアス

| エイリアス | 実パス |
|-----------|-------|
| `@/admin/lib/stripe` | `src/app/(admin)/admin/(dashboard)/_shared/lib/stripe.ts` |
| `@/admin/lib/stripe-shared` | `src/app/(admin)/admin/(dashboard)/_shared/lib/stripe-shared.ts`（新規） |
| `@/admin/lib/validations/customer` | `src/app/(admin)/admin/(dashboard)/_shared/lib/validations/customer.ts` |
| `@/admin/actions/customer` | `src/app/(admin)/admin/(dashboard)/_shared/actions/customer.ts` |
| `@/admin/hooks` | `src/app/(admin)/admin/(dashboard)/_shared/hooks/index.ts` |
| `@/shared/lib/serialize` | `src/shared/lib/serialize.ts` |

### 問題の根本原因

`StripeSection.tsx`（`'use client'`）が `stripe.ts`（`import 'server-only'`）を直接 import している。
`stripe.ts` には「Stripe API を呼び出すサーバー専用コード」と「キー形式検証・定数（秘密情報なし）」が混在しており、Client Component は後者しか使っていない。

**修正前のカスケードエラー:**
```
StripeSection.tsx (use client)
  → stripe.ts (server-only) ← build error
      → crypto.ts (server-only) ← cascade
      → env/server.ts (server-only) ← cascade
      → errors/logger.ts (server-only) ← cascade
```

**`stripe.ts` を import しているファイル（全4件）:**

| ファイル | 使用内容 | 対応 |
|---------|---------|------|
| `StripeSection.tsx` | `SUPPORTED_CURRENCIES`, `SupportedCurrency` | stripe-shared に変更 |
| `actions/settings/basic.ts` | `maskSecretKey` | stripe-shared に変更 |
| `validations/stripe.ts` | `isValidPublishableKey`, `isValidSecretKey`, `isValidWebhookSecret`, `keysHaveMatchingMode` | stripe-shared に変更 |
| `actions/settings/stripe.ts` | `testStripeConnection` | **変更不要**（server-only 間の import は問題なし） |

### 重要ルール（このプロジェクト固有）

- **型アサーション（`as`）禁止** → `createTypeGuard()` / `isValid*()` 型ガード使用
- **`export const dynamic`禁止** → 動的化は `await connection()` を使用
- **`revalidateTag` は2引数必須**（Next.js 16）: `revalidateTag(tag, { expire: 0 })`
- **`updateTag` は1引数**（Server Actions 専用）: `updateTag(CACHE_TAGS.XXX)`
- **ハードコードカラー禁止** → `text-destructive`, `text-success` 等のセマンティックトークン使用
- **`useCallback` / `useMemo` 禁止** → React Compiler が自動最適化（プレーン関数を使用）
- **Zod エラーは `{ error: ... }` パラメータ**（`message:` は Zod 3、禁止）

---

## Part 1: Stripe server-only 境界修正

---

### Task 1: `stripe-shared.ts` を新規作成

**Files:**
- Create: `src/app/(admin)/admin/(dashboard)/_shared/lib/stripe-shared.ts`

**Step 1: ファイルを作成**

```typescript
/**
 * Stripe クライアントセーフ共有コード
 *
 * server-only を含まない。
 * Client Component / Server Component / Server Action のいずれからも import 可能。
 * シークレット情報・API 呼び出しを一切含まない。
 */

// =============================================================================
// 通貨
// =============================================================================

/** Zod enum / DB フィールド用の値配列 */
export const SUPPORTED_CURRENCY_VALUES = ['jpy', 'usd', 'eur'] as const

export type SupportedCurrency = (typeof SUPPORTED_CURRENCY_VALUES)[number]

export interface CurrencyOption {
  value: SupportedCurrency
  label: string
}

/** UI 表示用（value + label ペア） */
export const SUPPORTED_CURRENCIES: readonly CurrencyOption[] = [
  { value: 'jpy', label: '日本円 (JPY)' },
  { value: 'usd', label: '米ドル (USD)' },
  { value: 'eur', label: 'ユーロ (EUR)' },
]

// =============================================================================
// キープレフィックス（秘密情報なし）
// =============================================================================

const KEY_PREFIXES = {
  publishableTest: 'pk_test_',
  publishableLive: 'pk_live_',
  secretTest: 'sk_test_',
  secretLive: 'sk_live_',
  webhook: 'whsec_',
} as const

// =============================================================================
// キー形式検証（純粋関数 — API 呼び出しなし）
// =============================================================================

/** テストキー（公開可能 or シークレット）かを判定 */
export function isTestKey(key: string): boolean {
  return key.startsWith(KEY_PREFIXES.secretTest) || key.startsWith(KEY_PREFIXES.publishableTest)
}

/** ライブキー（公開可能 or シークレット）かを判定 */
export function isLiveKey(key: string): boolean {
  return key.startsWith(KEY_PREFIXES.secretLive) || key.startsWith(KEY_PREFIXES.publishableLive)
}

/** 公開可能キーの形式が正しいか検証 */
export function isValidPublishableKey(key: string): boolean {
  return key.startsWith(KEY_PREFIXES.publishableTest) || key.startsWith(KEY_PREFIXES.publishableLive)
}

/** シークレットキーの形式が正しいか検証 */
export function isValidSecretKey(key: string): boolean {
  return key.startsWith(KEY_PREFIXES.secretTest) || key.startsWith(KEY_PREFIXES.secretLive)
}

/** Webhookシークレットの形式が正しいか検証 */
export function isValidWebhookSecret(key: string): boolean {
  return key.startsWith(KEY_PREFIXES.webhook)
}

/** キーのモード（test/live）がマッチしているか確認 */
export function keysHaveMatchingMode(publishableKey: string, secretKey: string): boolean {
  return isTestKey(publishableKey) === isTestKey(secretKey)
}

/**
 * シークレットキーをマスク表示用に変換
 * sk_test_xxxxxxxxxxxx → sk_test_xxxx...xxxx
 *
 * セキュリティ: 入力をサニタイズして XSS 攻撃を防止
 */
export function maskSecretKey(key: string): string {
  if (!key || key.length < 16) return '****'
  if (!/^[a-zA-Z0-9_]+$/.test(key)) return '****'
  const prefix = key.substring(0, 12)
  const suffix = key.substring(key.length - 4)
  return `${prefix}...${suffix}`
}
```

**Step 2: 型チェックを実行（エラーなし確認）**

Run: `bun run type-check`
Expected: エラーなし（新規ファイルのみ、まだ import されていない）

**Step 3: コミット（Part 1 開始）**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/lib/stripe-shared.ts
git commit -m "feat(stripe): extract client-safe code to stripe-shared.ts"
```

---

### Task 2: `stripe.ts` を精査・更新（server-only コードのみ残す）

**Files:**
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/lib/stripe.ts`

**Step 1: `stripe.ts` を全て置き換え**

`stripe.ts` は以下の通り書き換える。
クライアントセーフなコード（型・定数・検証関数）を削除し、`stripe-shared.ts` から import する。
`getCurrencyDisplayName` は未使用のため削除する。

```typescript
/**
 * Stripe 初期化・ヘルパー関数
 *
 * 環境変数優先、DBフォールバック
 * テストモード自動検出
 * 接続テスト機能
 *
 * @important server-only — Client Component から import 禁止
 */

import 'server-only'
import Stripe from 'stripe'
import { safeDecrypt } from '@/shared/lib/crypto'
import { serverEnv } from '@/shared/lib/env/server'
import { isValidSecretKey, isTestKey } from './stripe-shared'

/**
 * Stripe設定の取得元
 */
export type StripeConfigSource = 'env' | 'db' | null

/**
 * Stripe接続テスト結果
 */
export interface StripeConnectionTestResult {
  success: boolean
  error?: string
  accountId?: string
  mode?: 'test' | 'live'
  source?: StripeConfigSource
}

/**
 * 環境変数からStripeシークレットキーを取得
 */
function getEnvSecretKey(): string | null {
  return serverEnv.STRIPE_SECRET_KEY ?? null
}

/**
 * Stripeクライアントを作成
 * @param secretKey - シークレットキー（復号化済み）
 */
export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: '2026-01-28.clover',
    typescript: true,
  })
}

/**
 * 環境変数またはDB設定からStripeクライアントを取得
 * @param dbSecretKey - DBから取得した暗号化されたシークレットキー
 * @returns Stripeクライアントと設定元
 */
export async function getStripeClient(
  dbSecretKey?: string | null
): Promise<{ client: Stripe | null; source: StripeConfigSource }> {
  const envKey = getEnvSecretKey()
  if (envKey) {
    return { client: createStripeClient(envKey), source: 'env' }
  }

  if (dbSecretKey) {
    const decryptedKey = safeDecrypt(dbSecretKey)
    if (decryptedKey) {
      return { client: createStripeClient(decryptedKey), source: 'db' }
    }
  }

  return { client: null, source: null }
}

/**
 * Stripe接続テスト
 * @param secretKey - テストするシークレットキー（平文）
 */
export async function testStripeConnection(
  secretKey: string
): Promise<StripeConnectionTestResult> {
  try {
    if (!isValidSecretKey(secretKey)) {
      return {
        success: false,
        error: 'シークレットキーの形式が正しくありません。sk_test_ または sk_live_ で始まる必要があります。',
      }
    }

    const stripe = createStripeClient(secretKey)
    const account = await stripe.accounts.retrieve()

    return {
      success: true,
      accountId: account.id,
      mode: isTestKey(secretKey) ? 'test' : 'live',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '接続テストに失敗しました'

    if (error instanceof Stripe.errors.StripeAuthenticationError) {
      return {
        success: false,
        error: 'APIキーが無効です。正しいキーを入力してください。',
      }
    }

    if (error instanceof Stripe.errors.StripePermissionError) {
      return {
        success: false,
        error: 'このAPIキーにはアカウント情報へのアクセス権限がありません。',
      }
    }

    return { success: false, error: message }
  }
}
```

**Step 2: 型チェック**

Run: `bun run type-check`
Expected: `actions/settings/basic.ts`, `validations/stripe.ts`, `StripeSection.tsx` で import エラーが出る（まだ修正していないため）。後続 Task で修正する。

---

### Task 3: `validations/stripe.ts` の import を `stripe-shared` に変更

**Files:**
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/lib/validations/stripe.ts`

**Step 1: import を書き換え、ローカル `SUPPORTED_CURRENCIES` を削除**

`validations/stripe.ts` を全て置き換える:

```typescript
/**
 * Stripe設定のバリデーションスキーマ
 */

import { z } from 'zod'
import {
  SUPPORTED_CURRENCY_VALUES,
  isValidPublishableKey,
  isValidSecretKey,
  isValidWebhookSecret,
  keysHaveMatchingMode,
} from '@/admin/lib/stripe-shared'

// バリデーションメッセージ
interface ValidationMessages {
  publishableKey: string
  secretKey: string
  webhookSecret: string
  keyModeMismatch: string
  maxLength: (field: string) => string
}

const MESSAGES: ValidationMessages = {
  publishableKey: '公開可能キーは pk_test_ または pk_live_ で始まる必要があります',
  secretKey: 'シークレットキーは sk_test_ または sk_live_ で始まる必要があります',
  webhookSecret: 'Webhookシークレットは whsec_ で始まる必要があります',
  keyModeMismatch: '公開可能キーとシークレットキーのモード（test/live）が一致していません',
  maxLength: (field: string) => `${field}は200文字以内で入力してください`,
}

/**
 * Stripe設定の更新スキーマ
 */
export const stripeSettingsSchema = z
  .object({
    stripeEnabled: z.boolean(),
    stripeTestMode: z.boolean(),
    stripePublishableKey: z
      .string()
      .max(200, { error: MESSAGES.maxLength('公開可能キー') })
      .nullable()
      .optional()
      .refine((val) => !val || isValidPublishableKey(val), {
        error: MESSAGES.publishableKey,
      }),
    stripeSecretKey: z
      .string()
      .max(200, { error: MESSAGES.maxLength('シークレットキー') })
      .nullable()
      .optional()
      .refine((val) => !val || isValidSecretKey(val), {
        error: MESSAGES.secretKey,
      }),
    stripeWebhookSecret: z
      .string()
      .max(200, { error: MESSAGES.maxLength('Webhookシークレット') })
      .nullable()
      .optional()
      .refine((val) => !val || isValidWebhookSecret(val), {
        error: MESSAGES.webhookSecret,
      }),
    stripeCurrency: z.enum(SUPPORTED_CURRENCY_VALUES).default(SUPPORTED_CURRENCY_VALUES[0]),
  })
  .refine(
    (data) => {
      if (data.stripePublishableKey && data.stripeSecretKey) {
        return keysHaveMatchingMode(data.stripePublishableKey, data.stripeSecretKey)
      }
      return true
    },
    {
      error: MESSAGES.keyModeMismatch,
      path: ['stripeSecretKey'],
    }
  )

export type StripeSettingsInput = z.infer<typeof stripeSettingsSchema>

/**
 * 接続テスト用スキーマ（シークレットキーのみ）
 */
export const stripeConnectionTestSchema = z.object({
  secretKey: z
    .string()
    .min(1, { error: 'シークレットキーを入力してください' })
    .refine(isValidSecretKey, {
      error: MESSAGES.secretKey,
    }),
})

export type StripeConnectionTestInput = z.infer<typeof stripeConnectionTestSchema>
```

**Step 2: 型チェック**

Run: `bun run type-check`
Expected: `actions/settings/basic.ts` と `StripeSection.tsx` でまだエラーが出る（Task 4, 5 で修正）

---

### Task 4: `actions/settings/basic.ts` の import を `stripe-shared` に変更

**Files:**
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/settings/basic.ts`

**Step 1: import を1行変更**

`basic.ts` の21行目:

```typescript
// 変更前
import { maskSecretKey } from '@/admin/lib/stripe'

// 変更後
import { maskSecretKey } from '@/admin/lib/stripe-shared'
```

**Step 2: 型チェック**

Run: `bun run type-check`
Expected: `StripeSection.tsx` のエラーのみ残る

---

### Task 5: `StripeSection.tsx` の import を修正し、型安全な通貨ガードに修正

**Files:**
- Modify: `src/app/(admin)/admin/(dashboard)/settings/_components/sections/StripeSection.tsx`

**Step 1: 以下の2点を変更**

変更点1 — import を `stripe-shared` に変更（35行目）:
```typescript
// 変更前
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '@/admin/lib/stripe'

// 変更後
import { SUPPORTED_CURRENCIES, type SupportedCurrency, SUPPORTED_CURRENCY_VALUES } from '@/admin/lib/stripe-shared'
```

変更点2 — ローカル型ガードを `createTypeGuard` で置き換え（44-48行目）:

`createTypeGuard` は `@/shared/lib/serialize` から import する。

```typescript
// 変更前: 既存コード (44-48行目)
const VALID_CURRENCIES = new Set<string>(SUPPORTED_CURRENCIES.map((c) => c.value))

function isSupportedCurrency(value: unknown): value is SupportedCurrency {
  return typeof value === 'string' && VALID_CURRENCIES.has(value)
}
```

```typescript
// 変更後: createTypeGuard を使用（import も追加）
import { createTypeGuard } from '@/shared/lib/serialize'

const isSupportedCurrency = createTypeGuard(SUPPORTED_CURRENCY_VALUES)
```

変更点3 — `onValueChange` の型アノテーション削除（334行目付近）:

```tsx
// 変更前: パラメータ型アノテーションで型アサーションを回避（非推奨）
onValueChange={(value: 'jpy' | 'usd' | 'eur') =>
  setFormData({ ...formData, stripeCurrency: value })
}

// 変更後: isSupportedCurrency ガードを使用
onValueChange={(value) => {
  if (isSupportedCurrency(value)) setFormData({ ...formData, stripeCurrency: value })
}}
```

**Step 2: 型チェックとリント**

Run: `bun run validate`
Expected: エラーなし（Part 1 完了）

**Step 3: ビルド確認（server-only エラーが解消されているか）**

Run: `bun run build`
Expected: `StripeSection.tsx` 関連のエラーが消えている

**Step 4: コミット（Part 1 完了）**

```bash
git add -p  # 変更ファイルを確認してステージング
git commit -m "fix(stripe): resolve server-only boundary violation by separating client-safe code

- Create stripe-shared.ts with types, constants, and key format validators (no secrets)
- Update stripe.ts to only contain server-only Stripe client code
- Update validations/stripe.ts, actions/settings/basic.ts, StripeSection.tsx to import from stripe-shared
- Use createTypeGuard for SupportedCurrency type guard in StripeSection"
```

---

## Part 2: 顧客編集機能

---

### Task 6: `updateCustomer` Server Action を `customer.ts` に追加

**Files:**
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/customer.ts`

**背景:** 既存の `customer.ts` には `createCustomer`, `updateCustomerStatus`, `updateCustomerNotes`, `toggleCustomerActive` はあるが全フィールドを更新する `updateCustomer` がない。

**Step 1: `customer.ts` の末尾（`searchCustomers` 関数の前）に追加**

```typescript
/**
 * 顧客情報を全フィールド更新
 */
export const updateCustomer = withPermission<[id: string, input: CustomerFormInput], void>(
  'customer',
  'update'
)(async (_user, id, input): Promise<ActionResult<void>> => {
  const parsed = customerFormSchema.safeParse(input)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  const { lastName, firstName, lastNameKana, firstNameKana, email, phoneNumber, address, notes } = parsed.data

  // 存在確認
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!customer) return createFailure('顧客が見つかりません')

  // メールアドレスの重複チェック（自分自身を除外）
  const emailConflict = await prisma.customer.findFirst({
    where: { email, NOT: { id } },
    select: { id: true },
  })
  if (emailConflict) return createFailure('このメールアドレスは既に登録されています')

  await prisma.customer.update({
    where: { id },
    data: {
      lastName,
      firstName,
      lastNameKana: lastNameKana || null,
      firstNameKana: firstNameKana || null,
      email,
      phoneNumber: phoneNumber || null,
      address: address || null,
      notes: notes || null,
    },
  })

  updateTag(CACHE_TAGS.CUSTOMERS)
  updateTag(getCacheTag.customers.detail(id))

  return createSuccess('顧客情報を更新しました')
})
```

**Step 2: 型チェック**

Run: `bun run type-check`
Expected: エラーなし

**Step 3: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/actions/customer.ts
git commit -m "feat(customer): add updateCustomer server action for full field editing"
```

---

### Task 7: `CustomerEditForm.tsx` を新規作成

**Files:**
- Create: `src/app/(admin)/admin/(dashboard)/customers/_components/CustomerEditForm.tsx`

**背景:**
- 参考パターン: `CustomerForm.tsx`（新規作成フォーム）と `ReservationEditForm.tsx`（予約編集フォーム）
- `CustomerForm.tsx` は `useActionState` + native form action のハイブリッド
- `CustomerEditForm.tsx` は `react-hook-form` の `handleSubmit` で Server Action を直接呼ぶ（`ReservationEditForm.tsx` と同じアプローチ）
- `useKanaInput` の `initialKana` オプションで既存データを初期値に設定

**Step 1: ファイルを作成**

```typescript
'use client'

import { useTransition, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { updateCustomer } from '@/admin/actions/customer'
import type { CustomerWithReservations } from '@/admin/actions/customer'
import {
  customerFormSchema,
  type CustomerFormData,
} from '@/admin/lib/validations/customer'
import {
  Button,
  Input,
  Label,
  Card,
  Textarea,
} from '@/admin/components/ui'
import { cn } from '@/shared/lib/utils'
import { useKanaInput } from '@/admin/hooks'

type CustomerEditFormProps = {
  customer: CustomerWithReservations
}

export function CustomerEditForm({ customer }: CustomerEditFormProps): ReactElement {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CustomerFormData>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: {
      lastName: customer.lastName,
      firstName: customer.firstName,
      lastNameKana: customer.lastNameKana ?? '',
      firstNameKana: customer.firstNameKana ?? '',
      email: customer.email,
      phoneNumber: customer.phoneNumber ?? '',
      address: customer.address ?? '',
      notes: customer.notes ?? '',
    },
  })

  // IME 自動カナ入力（既存データで初期化）
  const lastNameKanaInput = useKanaInput({
    initialKana: customer.lastNameKana ?? '',
    onKanaChange: (kana) => setValue('lastNameKana', kana),
  })
  const firstNameKanaInput = useKanaInput({
    initialKana: customer.firstNameKana ?? '',
    onKanaChange: (kana) => setValue('firstNameKana', kana),
  })

  const onSubmit = (data: CustomerFormData) => {
    startTransition(async () => {
      const result = await updateCustomer(customer.id, data)
      if (result.success) {
        toast.success(result.message)
        router.push(`/admin/customers/${customer.id}`)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Card className="p-6">
        <div className="space-y-6">
          {/* 氏名 */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="lastName">
                姓 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lastName"
                {...register('lastName')}
                placeholder="山田"
                aria-invalid={!!errors.lastName}
                aria-describedby={errors.lastName ? 'lastName-error' : undefined}
                onCompositionStart={lastNameKanaInput.inputProps.onCompositionStart}
                onCompositionUpdate={lastNameKanaInput.inputProps.onCompositionUpdate}
                onCompositionEnd={lastNameKanaInput.inputProps.onCompositionEnd}
                onInput={lastNameKanaInput.inputProps.onInput}
              />
              {errors.lastName && (
                <p id="lastName-error" className="text-xs text-destructive">
                  {errors.lastName.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="firstName">
                名 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="firstName"
                {...register('firstName')}
                placeholder="太郎"
                aria-invalid={!!errors.firstName}
                aria-describedby={errors.firstName ? 'firstName-error' : undefined}
                onCompositionStart={firstNameKanaInput.inputProps.onCompositionStart}
                onCompositionUpdate={firstNameKanaInput.inputProps.onCompositionUpdate}
                onCompositionEnd={firstNameKanaInput.inputProps.onCompositionEnd}
                onInput={firstNameKanaInput.inputProps.onInput}
              />
              {errors.firstName && (
                <p id="firstName-error" className="text-xs text-destructive">
                  {errors.firstName.message}
                </p>
              )}
            </div>
          </div>

          {/* カナ（リアルタイム自動入力） */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="lastNameKana">
                セイ
                <span className="text-xs text-muted-foreground ml-2">（自動入力）</span>
              </Label>
              <Input
                id="lastNameKana"
                placeholder="ヤマダ"
                value={lastNameKanaInput.kana}
                onChange={(e) => lastNameKanaInput.setKana(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="firstNameKana">
                メイ
                <span className="text-xs text-muted-foreground ml-2">（自動入力）</span>
              </Label>
              <Input
                id="firstNameKana"
                placeholder="タロウ"
                value={firstNameKanaInput.kana}
                onChange={(e) => firstNameKanaInput.setKana(e.target.value)}
              />
            </div>
          </div>

          {/* メールアドレス */}
          <div className="space-y-2">
            <Label htmlFor="email">
              メールアドレス <span className="text-destructive">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              {...register('email')}
              placeholder="example@example.com"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-error' : undefined}
            />
            {errors.email && (
              <p id="email-error" className="text-xs text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>

          {/* 電話番号 */}
          <div className="space-y-2">
            <Label htmlFor="phoneNumber">電話番号</Label>
            <Input
              id="phoneNumber"
              type="tel"
              {...register('phoneNumber')}
              placeholder="090-1234-5678"
              aria-invalid={!!errors.phoneNumber}
              aria-describedby={errors.phoneNumber ? 'phoneNumber-error' : undefined}
            />
            {errors.phoneNumber && (
              <p id="phoneNumber-error" className="text-xs text-destructive">
                {errors.phoneNumber.message}
              </p>
            )}
          </div>

          {/* 住所 */}
          <div className="space-y-2">
            <Label htmlFor="address">住所</Label>
            <Input
              id="address"
              {...register('address')}
              placeholder="東京都渋谷区..."
              aria-invalid={!!errors.address}
              aria-describedby={errors.address ? 'address-error' : undefined}
            />
            {errors.address && (
              <p id="address-error" className="text-xs text-destructive">
                {errors.address.message}
              </p>
            )}
          </div>

          {/* メモ */}
          <div className="space-y-2">
            <Label htmlFor="notes">メモ</Label>
            <Textarea
              id="notes"
              {...register('notes')}
              placeholder="顧客に関するメモ..."
              rows={4}
              aria-invalid={!!errors.notes}
              aria-describedby={errors.notes ? 'notes-error' : undefined}
            />
            {errors.notes && (
              <p id="notes-error" className="text-xs text-destructive">
                {errors.notes.message}
              </p>
            )}
          </div>

          {/* 送信ボタン */}
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(`/admin/customers/${customer.id}`)}
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className={cn(isPending && 'opacity-50')}
            >
              {isPending ? '更新中...' : '顧客情報を更新'}
            </Button>
          </div>
        </div>
      </Card>
    </form>
  )
}
```

**Step 2: 型チェック**

Run: `bun run type-check`
Expected: エラーなし

**Step 3: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/customers/_components/CustomerEditForm.tsx
git commit -m "feat(customer): add CustomerEditForm component with kana auto-input"
```

---

### Task 8: 編集ページ `customers/[id]/edit/page.tsx` を作成

**Files:**
- Create: `src/app/(admin)/admin/(dashboard)/customers/[id]/edit/page.tsx`

**重要:** `export const dynamic = 'force-dynamic'` は Next.js 16 では禁止。代わりに `await connection()` を使用して動的レンダリングを強制する。

**Step 1: ファイルを作成**

```typescript
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/admin/components/ui'
import { getCustomerById } from '@/admin/actions/customer'
import { CustomerEditForm } from '../../_components/CustomerEditForm'
import type { Metadata } from 'next'

type PageProps = {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const customer = await getCustomerById(id)
  if (!customer) return {}

  return {
    title: `${customer.lastName} ${customer.firstName} - 顧客編集 | 管理画面`,
  }
}

export default async function CustomerEditPage({ params }: PageProps) {
  await connection()

  const { id } = await params
  const customer = await getCustomerById(id)
  if (!customer) notFound()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/admin/customers/${id}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            詳細に戻る
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">顧客情報を編集</h1>
          <p className="text-muted-foreground">
            {customer.lastName} {customer.firstName}
          </p>
        </div>
      </div>

      <CustomerEditForm customer={customer} />
    </div>
  )
}
```

**Step 2: 型チェック**

Run: `bun run type-check`
Expected: エラーなし

**Step 3: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/customers/\[id\]/edit/page.tsx
git commit -m "feat(customer): add customer edit page /customers/[id]/edit"
```

---

### Task 9: `CustomerDetail.tsx` に編集ボタンを追加

**Files:**
- Modify: `src/app/(admin)/admin/(dashboard)/customers/[id]/_components/CustomerDetail.tsx`

**Step 1: `lucide-react` import に `Pencil` を追加（5行目）**

```typescript
// 変更前
import { ArrowLeft } from 'lucide-react'

// 変更後
import { ArrowLeft, Pencil } from 'lucide-react'
```

**Step 2: ヘッダー部分に編集ボタンを追加（79-96行目付近）**

現在のヘッダー構造:
```tsx
<div className="flex items-center justify-between">
  <div className="flex items-center gap-4">
    <Button variant="outline" size="sm" asChild>
      <Link href="/admin/customers">
        <ArrowLeft className="mr-2 h-4 w-4" />
        一覧に戻る
      </Link>
    </Button>
    <div>
      <h1 className="text-2xl font-bold">
        {customer.lastName} {customer.firstName}
      </h1>
      <p className="text-muted-foreground">
        登録日: {formatDateShort(customer.createdAt)}
      </p>
    </div>
  </div>
</div>
```

修正後（`</div>` の閉じタグの前に編集ボタンを追加）:
```tsx
<div className="flex items-center justify-between">
  <div className="flex items-center gap-4">
    <Button variant="outline" size="sm" asChild>
      <Link href="/admin/customers">
        <ArrowLeft className="mr-2 h-4 w-4" />
        一覧に戻る
      </Link>
    </Button>
    <div>
      <h1 className="text-2xl font-bold">
        {customer.lastName} {customer.firstName}
      </h1>
      <p className="text-muted-foreground">
        登録日: {formatDateShort(customer.createdAt)}
      </p>
    </div>
  </div>
  <Button variant="outline" size="sm" asChild>
    <Link href={`/admin/customers/${customer.id}/edit`}>
      <Pencil className="mr-2 h-4 w-4" />
      編集
    </Link>
  </Button>
</div>
```

**Step 3: 型チェックとリント**

Run: `bun run validate`
Expected: エラーなし

**Step 4: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/customers/\[id\]/_components/CustomerDetail.tsx
git commit -m "feat(customer): add edit button to CustomerDetail header"
```

---

### Task 10: 最終検証

**Step 1: 型チェック + リント（並列）**

Run: `bun run validate`
Expected: エラーゼロ

**Step 2: ビルド**

Run: `bun run build`
Expected:
- `StripeSection.tsx` の `server-only` 関連エラーが消えていること
- ビルド成功

**Step 3: 最終コミット（もし未コミット変更があれば）**

```bash
git add -p
git commit -m "chore: final validation pass"
```

---

## チェックリスト

### Part 1: Stripe server-only 修正
- [ ] `stripe-shared.ts` 作成（秘密情報なし）
- [ ] `stripe.ts` 更新（server-only コードのみ残す）
- [ ] `validations/stripe.ts` import 変更
- [ ] `actions/settings/basic.ts` import 変更
- [ ] `StripeSection.tsx` import 変更 + 型ガード修正
- [ ] ビルドで `server-only` エラーが消えていること

### Part 2: 顧客編集
- [ ] `updateCustomer` Server Action 追加
- [ ] `CustomerEditForm.tsx` 作成
- [ ] `customers/[id]/edit/page.tsx` 作成
- [ ] `CustomerDetail.tsx` に編集ボタン追加
- [ ] `bun run validate` エラーなし
- [ ] `bun run build` 成功
