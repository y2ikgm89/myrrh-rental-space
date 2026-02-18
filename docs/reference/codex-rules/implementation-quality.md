# 実装品質ルール

## 禁止事項

### 1. 形骸化実装禁止

```typescript
// NG: 空の関数
async function syncCalendar() {
  // TODO: implement
}

// NG: エラー握りつぶし
try { await save(data) } catch { /* ignore */ }

// NG: 常に成功を返す
export async function deleteItem(id: string) {
  return { success: true }  // 実際の削除処理がない
}

// OK: withPermission パターンで完全な実装
export const deleteItem = withPermission<[id: string], void>(
  'item',
  'delete'
)(async (_user, id) => {
  const item = await prisma.item.findUnique({ where: { id }, select: { id: true } })
  if (!item) return createFailure('アイテムが見つかりません')

  await prisma.item.delete({ where: { id } })
  updateTag(CACHE_TAGS.ITEMS)
  return createSuccess('削除しました')
})
```

### 2. 過剰な抽象化禁止

```typescript
// NG: 1回しか使わないユーティリティ
function formatSingleDate(date: Date): string {
  return date.toLocaleDateString('ja-JP')
}

// NG: 将来の拡張のための過剰設計
// 理由: 使われないインターフェースはメンテナンスコストだけが増大する
interface PluginSystem {
  register(plugin: Plugin): void
  unregister(name: string): void
  // ... 使われないインターフェース
}

// OK: 必要最小限。同じパターンが3箇所以上で出現してから抽象化を検討
const formatted = date.toLocaleDateString('ja-JP')
```

### 3. 後方互換ハック禁止

```typescript
// NG: 未使用変数のリネーム
const _oldFunction = () => {}  // 削除すべき

// NG: 削除コメント
// removed: export function legacyHelper() { ... }

// NG: 不要な re-export
export type { OldType as NewType }  // 型エイリアスは不要（prisma-patterns.md 参照）

// OK: 不要なコードは完全削除。参照元も更新
// 削除前: export function legacyHelper() { ... }
// 削除後: ファイルを削除し、参照元で直接実装を使用
```

### 4. デッドコード禁止

```typescript
// NG: 到達不能コード
function getValue(type: 'a' | 'b') {
  if (type === 'a') return 1
  if (type === 'b') return 2
  return 0  // 到達不能

// NG: 使われないインポート
import { unused } from '@/shared/lib/utils'

// OK: 使われないコードは削除
function getValue(type: 'a' | 'b') {
  if (type === 'a') return 1
  return 2  // type === 'b' のみ残り得る
}
```

## 必須事項

### 1. コードを書く前に読む

- 変更対象ファイルと関連ファイルを必ず確認
- 既存パターン・命名規則に従う
- 同じ責務の既存実装がないか確認（重複実装を防ぐ）

### 2. 変更は最小限に

- 要求された変更のみ実装
- 「ついでに」のリファクタリング・コメント追加・型注釈追加をしない
- 変更していないコードに docstring やコメントを追加しない

### 3. 検証を行う

- `bun run type-check` でコンパイル確認
- `bun run lint` でリント確認
- `bun run validate` で両方を並列実行
- コミット前は `bun run validate && bun run build`

### 4. エラーハンドリング

```typescript
// NG: エラーを無視
try { await action() } catch {}

// NG: console.log だけ
try { await action() } catch (e) { console.log(e) }

// OK: logError で構造化ログ + createFailure で返す
import { logError, ErrorCategory, ErrorSeverity } from '@/shared/lib/errors'

try {
  await action()
} catch (error) {
  logError(error, {
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.MEDIUM,
    context: { operation: 'deleteItem' },
  })
  return createFailure('操作に失敗しました')
}
```

## Server Action 実装パターン

### withPermission パターン（標準）

認証・認可・型安全を統合したカリー化ヘルパー:

```typescript
import { withPermission } from '@/admin/lib/server-action-helpers'
import { createSuccess, createFailure } from '@/admin/types/server-actions'
import { updateTag } from 'next/cache'
import { CACHE_TAGS } from '@/shared/lib/constants'

// 型引数: <[引数の型...], 戻り値データの型>
export const createSpace = withPermission<[data: SpaceInput], { id: string }>(
  'space',
  'create'
)(async (_user, data) => {
  const space = await prisma.space.create({ data })
  updateTag(CACHE_TAGS.SPACES)
  return createSuccess('スペースを作成しました', { id: space.id })
})

// 引数なし（削除等）
export const deleteSpace = withPermission<[id: string], void>(
  'space',
  'delete'
)(async (_user, id) => {
  const space = await prisma.space.findUnique({ where: { id }, select: { id: true } })
  if (!space) return createFailure('スペースが見つかりません')

  await prisma.space.delete({ where: { id } })
  updateTag(CACHE_TAGS.SPACES)
  return createSuccess('削除しました')
})
```

### withPermission を使わない場合（公開 Server Actions など）

```typescript
'use server'

import { createSuccess, createFailure } from '@/shared/types/server-actions'

export async function submitInquiry(data: InquiryInput): Promise<ActionResult> {
  const validated = inquirySchema.safeParse(data)
  if (!validated.success) {
    return createFailure('入力内容を確認してください', extractFieldErrors(validated.error))
  }
  // ... 処理
  return createSuccess('お問い合わせを送信しました')
}
```

## ファイル配置

| パス | 内容 |
|------|------|
| `@/admin/lib/server-action-helpers.ts` | `withPermission` カリー化ヘルパー |
| `@/admin/types/server-actions.ts` | `createSuccess` / `createFailure` の re-export（`@/shared/types/server-actions` から）+ `AuditUser` |
| `@/shared/types/server-actions.ts` | `ActionResult` / `createSuccess` / `createFailure`（共有） |
| `@/shared/lib/errors/index.ts` | `logError` / `ErrorCategory` / `ErrorSeverity` |
| `@/shared/lib/action-helpers.ts` | `withValidation` / `withRetry` / `extractFieldErrors` |
