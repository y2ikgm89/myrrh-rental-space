# assignedPages フィールド完全分析

> ⚠️ **Snapshot: 2026-02-11** — 本ドキュメントは当時の分析結果。以下の path 参照は現在 stale:
> - `src/shared/lib/auth.ts` → `admin-auth.ts` + `customer-auth.ts` に分離済
> - `src/admin/lib/validations/user.ts` → `src/shared/lib/validations/user.ts`
>
> 実装状況は現在の schema.prisma / src/ で再確認すること。

## 現状サマリー

| 項目 | 状態 | 詳細 |
|------|------|------|
| **DB定義** | ✅ OK | Prisma: `assignedPages Json @default("[]")` |
| **TS型定義** | ❌ 未定義 | `User`型に`assignedPages`プロパティなし |
| **読み取り** | ⚠️ 型アサーション | `userHasResourceAccess()`で`as`使用 |
| **書き込み** | ❌ 未実装 | `createUser`/`updateUser`に機能なし |

## 1. DB定義（schema.prisma 行148）

```prisma
model User {
  id            String   @id @default(uuid())
  email         String   @unique
  name          String
  emailVerified Boolean  @default(false)
  image         String?
  role          Role     @default(USER)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  // RBAC: EDITOR用の割り当てページID（JSON配列）
  assignedPages Json @default("[]") // ["page-id-1", "page-id-2"]
}
```

## 2. 読み取り（permissions.ts）

### 関数: `userHasResourceAccess()`

```typescript
export function userHasResourceAccess(
  user: User,
  resource: Resource,
  action: Action,
  resourceId?: string
): boolean {
  // 基本権限チェック
  if (!userHasPermission(user, resource, action)) {
    return false
  }

  // EDITOR以外は全リソース許可
  if (!isEditorRole(user.role)) {
    return true
  }

  // resourceIdなしなら許可（一覧表示）
  if (!resourceId) {
    return true
  }

  // ⚠️ 型アサーション使用
  const userWithPages = user as { assignedPages?: string[] }
  const assignedPages = userWithPages.assignedPages ?? []
  return assignedPages.includes(resourceId)
}
```

### 使用パターン
- EDITOR ロール向けの**リソース単位アクセス制御**
- `resourceId`指定時のみ`assignedPages`チェック
- 一覧表示時（`resourceId`なし）は許可

## 3. 書き込み（user.ts）- 未実装

### createUser関数（行51-94）
```typescript
const user = await prisma.user.create({
  data: {
    email: parsed.data.email,
    name: parsed.data.name,
    role: parsed.data.role,
    accounts: {
      create: { /* ... */ },
    },
    // ❌ assignedPages が書き込まれない
  },
})
```

### updateUser関数（行111-162）
```typescript
const updateData: {
  email: string
  name: string
  role: Role
  password?: string
} = {
  email: parsed.data.email,
  name: parsed.data.name,
  role: parsed.data.role,
  // ❌ assignedPages が含まれない
}

await prisma.user.update({
  where: { id },
  data: updateData,
})
```

## 必要な修正

### 1. User型に assignedPages 追加
- ファイル: `src/shared/lib/auth.ts`
- 変更: `User`型に`assignedPages?: string[]`追加

### 2. スキーマに assignedPages フィールド追加
- ファイル: `src/admin/lib/validations/user.ts`（検索要）
- `CreateUserInput` / `UpdateUserInput`に`assignedPages?: string[]`フィールド追加

### 3. action関数で書き込み処理
- `createUser`: `parsed.data.assignedPages || []`を`data`に含める
- `updateUser`: `parsed.data.assignedPages`を`updateData`に含める

### 4. 型アサーション削除
- `userHasResourceAccess()`で`as`を削除（修正1でOK）

## UI実装状況（未確認項目）
- ユーザー作成画面でのフィールド表示: 未確認
- ユーザー編集画面でのフィールド編集: 未確認
- EDITOR割り当て UI: 未確認
