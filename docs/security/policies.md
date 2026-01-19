# セキュリティポリシー

## 認証・認可

### 認証方式

- **Better Auth** (v1.4.13)
- **Cookie-based Session**: scrypt ハッシュ
- **Cookie設定**: `HttpOnly`, `Secure`, `SameSite=Lax`

### ロールベースアクセス制御（RBAC）

| ロール | 権限 |
|-------|------|
| ADMIN | 全管理機能 |
| EDITOR | コンテンツ編集 |
| VIEWER | 閲覧のみ |

```typescript
// Server Component
const user = await verifyAdminSession() // ADMIN必須

// Server Action
export const updateItem = withAuth(async (user, data) => {
  // user は認証済み管理者
})
```

## 入力検証

### Zodバリデーション

```typescript
const schema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
})

const result = schema.safeParse(input)
if (!result.success) {
  return createFailure('入力エラー', result.error.flatten().fieldErrors)
}
```

### 必須チェック項目

- 文字列長の制限
- 数値範囲の制限
- メールアドレス形式
- URL形式
- 日時形式

## 暗号化

### APIキー・シークレット

```typescript
import { encrypt, decrypt } from '@/lib/crypto'

const encryptedKey = encrypt(apiKey) // 保存時
const apiKey = decrypt(encryptedKey) // 使用時
```

- **アルゴリズム**: AES-256-GCM
- **キー管理**: `ENCRYPTION_KEY` 環境変数

## セキュリティヘッダー

```typescript
// next.config.ts
headers: [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
]
```

## CSRF対策

- Next.js Server Actions: 自動CSRF保護
- SameSite Cookie: `Lax`

## XSS対策

### HTMLサニタイズ

```typescript
import DOMPurify from 'dompurify'

const sanitized = DOMPurify.sanitize(html, {
  ALLOWED_TAGS: ['p', 'h1', 'h2', 'a', 'img'],
  ALLOWED_ATTR: ['href', 'src', 'alt'],
})
```

## 監査・ログ

### ログ項目

- 認証試行（成功/失敗）
- 管理操作（CRUD）
- レート制限違反
- エラー発生

### ログ形式（JSON）

```typescript
console.log(JSON.stringify({
  level: 'warn',
  type: 'rate_limit_violation',
  ip: ipAddress,
  timestamp: new Date().toISOString(),
}))
```

## インシデント対応

1. **検出**: ログ監視、アラート
2. **封じ込め**: IPブロック、機能停止
3. **調査**: ログ分析、影響範囲特定
4. **復旧**: 修正、再デプロイ
5. **報告**: 記録、再発防止策
