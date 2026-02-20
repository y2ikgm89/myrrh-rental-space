# コード品質修正 設計ドキュメント

**作成日**: 2026-02-20
**スコープ**: 公開 Server Actions エラーハンドリング / React 19 Context API 移行 / Date 型境界修正 / Tailwind ハードコードカラー修正

---

## 目的

コードレビューで指摘された 4 つの問題（🔴 Critical × 3、🟡 Warning × 1）を、公式ベストプラクティスに準拠したクリーンな実装で修正する。後方互換性ハックは行わない。

---

## Issue 1: coupon.ts — 公開 Server Actions のエラーハンドリング

### 対象ファイル

`src/shared/actions/coupon.ts`

### 問題

3 つの関数すべてに try/catch がなく、DB エラー時にユーザーへ不透明なエラーが返るかアプリがクラッシュする可能性がある。

### 設計

#### validateCouponCode

- 戻り値型を `CouponValidationResult`（カスタム型）から `ActionResult<{coupon: ValidatedCoupon}>` に移行
- `CouponValidationResult` 型定義を削除（外部 import なし）
- prisma クエリを try/catch でラップ
- catch 節: `logError` (DATABASE / HIGH) + `createFailure('一時的なエラーが発生しました')`
- import: `createSuccess`, `createFailure`, `ActionResult` from `@/shared/types/server-actions`
- import: `logError`, `ErrorCategory`, `ErrorSeverity` from `@/shared/lib/errors`
- `import 'server-only'` を先頭に追加（server-only-patterns.md 準拠）

変更前の戻り値型:

```typescript
type CouponValidationResult =
  | { success: true; data: { coupon: ValidatedCoupon }; message: string }
  | { success: false; error: string };
```

変更後の戻り値型:

```typescript
ActionResult<{ coupon: ValidatedCoupon }>;
```

成功時: `createSuccess('クーポンを適用しました', { coupon: {...} })`
失敗時: `createFailure('無効なクーポンコードです')` / `createFailure('一時的なエラーが発生しました')`

#### incrementCouponUsage / decrementCouponUsage

- 戻り値型 `Promise<void>` を維持
- prisma クエリを try/catch でラップ
- catch 節: `logError` (DATABASE / HIGH) + `throw error`（caller に伝播させる）

### 呼び出し元への影響

`src/app/(admin)/admin/(dashboard)/_shared/actions/reservation/admin.ts` の 2 箇所:

- `couponResult.success` → 変更不要
- `couponResult.error` → 変更不要（ActionFailure にも `.error` あり）
- `couponResult.data?.coupon` → 変更不要（ActionSuccess<{coupon:...}> にも `.data.coupon` あり）
- 型アノテーションが `CouponValidationResult` → `ActionResult<{coupon: ValidatedCoupon}>` に変わる（実コード変更不要）

---

## Issue 2: Context API — useContext → use() 移行

### 対象ファイル（5 ファイル、7 箇所）

| ファイル                                                                     | 修正内容                                                                                        |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/shared/contexts/aria-live-context.tsx`                                  | `useContext` × 2 → `use`                                                                        |
| `src/app/(public)/_shared/components/effects/core/VisualEffectsProvider.tsx` | `useContext` × 2 → `use`                                                                        |
| `src/app/(public)/_shared/components/effects/three/ThreeCanvas.tsx`          | `useContext` → `use`、`createContext<T\|null>(null)` → `createContext<T\|undefined>(undefined)` |
| `src/app/(public)/_shared/components/effects/core/ScrollOrchestrator.tsx`    | `useContext` × 1 → `use`                                                                        |
| `src/app/(admin)/admin/(dashboard)/_shared/contexts/confirm-context.tsx`     | `useContext` → `use`、`createContext<T\|null>(null)` → `createContext<T\|undefined>(undefined)` |

### 設計

各ファイルで以下を適用:

1. `import { ..., useContext }` → `import { ..., use }` に置換（useContext を use に変更）
2. `createContext<T | null>(null)` → `createContext<T | undefined>(undefined)` に変更
3. guard 条件を `if (!ctx)` → `if (ctx === undefined)` に変更（undefined チェックを明示）

**react-patterns.md 準拠**:

- `useContext(Context)` 禁止 → `use(Context)` を使用（React 19 stable）
- `createContext<T | null>(null)` 禁止 → `createContext<T | undefined>(undefined)` を使用

---

## Issue 3: Server/Client 境界での Date 型修正

### 対象ファイル（3 ファイル）

| ファイル                                           | 問題                                                          | 修正                                                              |
| -------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------- |
| `src/app/(public)/_components/PostListSection.tsx` | `publishedAt: Date \| null`                                   | `publishedAt: string \| null`                                     |
| `src/app/(public)/_components/NewsListSection.tsx` | `publishedAt: Date \| null`、`formatDate(date: Date \| null)` | `publishedAt: string \| null`、`formatDate(date: string \| null)` |
| `src/app/(public)/posts/_components/PostGrid.tsx`  | `publishedAt: Date \| string \| null`                         | `publishedAt: string \| null`                                     |

### 設計

**prisma-patterns.md 準拠**:

- React 19 は Server → Client Props の `Date` を ISO 8601 文字列にシリアライズする
- Client Component の型定義は実態（`string`）に合わせる
- `NewsListSection` の `formatDate` 関数: `Date | null` → `string | null`（`new Date(date)` は string でも動作する）

各ファイルの interface / 型定義を `string | null` に変更するのみ。ロジックは変更不要。

---

## Issue 4: Tailwind ハードコードカラー修正

### 対象ファイル

`src/app/(admin)/admin/(dashboard)/media/_components/MediaGrid.tsx`

### 問題

L44: `bg-black/60` → admin テーマに `--color-overlay: oklch(0 0 0 / 0.6)` が定義済み

### 設計

```diff
- <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 ...">
+ <div className="absolute inset-0 bg-overlay opacity-0 group-hover:opacity-100 ...">
```

`bg-white/20`, `hover:bg-white/40`（オーバーレイボタン）は対応する admin トークンがなく許容範囲内のため変更しない。

---

## Issue 5: server-actions.ts の型アサーション

### 結論: 修正不要

`as unknown as ActionSuccess<T>` は `type-safety.md` §許可例外 #4「TypeScript 6.0 条件型」として明示的に許可済み。`ActionSuccess<T>` は条件型のため二段階キャストが必須。

---

## 実装順序

```
1. coupon.ts — エラーハンドリング追加
2. Context API 5ファイル — useContext → use() 移行
3. Date 型 3ファイル — string | null に統一
4. MediaGrid.tsx — bg-overlay に修正
5. bun run validate && bun run build で検証
```

---

## 検証計画

- `bun run type-check`: 型エラーなし
- `bun run lint`: ESLint エラーなし
- `bun run validate && bun run build`: 全通過
