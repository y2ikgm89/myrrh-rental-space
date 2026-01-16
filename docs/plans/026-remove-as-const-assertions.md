# 026: as const型アサーション削除とTypeScript 5.x ベストプラクティス適用

## 概要

プロジェクト全体から`as const`型アサーションを削除し、TypeScript 5.x のベストプラクティスに準拠した型安全な実装に移行。

## 背景

- `as const`は型アサーションの一種であり、型推論を上書きする
- TypeScript 5.x では`satisfies`演算子や明示的な型注釈が推奨
- よりクリーンで保守性の高いコードベースを目指す

## 変換パターン

### 1. オブジェクト定数（Record型）

```typescript
// Before
const CONFIG = { key: 'value' } as const

// After
interface ConfigType { key: string }
const CONFIG: ConfigType = { key: 'value' }
```

### 2. 配列定数（readonly配列）

```typescript
// Before
const VALUES = ['a', 'b', 'c'] as const
type Value = (typeof VALUES)[number]

// After
type Value = 'a' | 'b' | 'c'
const VALUES: readonly Value[] = ['a', 'b', 'c']
```

### 3. Enum風定数（Union + Record）

```typescript
// Before
export const ErrorCategory = { DATABASE: 'DATABASE' } as const
export type ErrorCategory = (typeof ErrorCategory)[keyof typeof ErrorCategory]

// After
export type ErrorCategory = 'DATABASE' | 'VALIDATION'
export const ErrorCategory: Record<ErrorCategory, ErrorCategory> = {
  DATABASE: 'DATABASE',
  VALIDATION: 'VALIDATION',
}
```

### 4. インラインCSS（React.CSSProperties）

```typescript
// Before
const style = { whiteSpace: 'pre-wrap' as const }

// After
const style: React.CSSProperties = { whiteSpace: 'pre-wrap' }
```

### 5. Prismaクエリ（satisfies使用）

```typescript
// Before
const where = {
  OR: [{ name: { contains: query, mode: 'insensitive' as const } }],
}

// After
const where = {
  OR: [{ name: { contains: query, mode: 'insensitive' } }],
} satisfies Prisma.UserWhereInput
```

## 変更ファイル一覧（31ファイル）

### lib/
- `stripe.ts` - KEY_PREFIXES, SUPPORTED_CURRENCIES
- `supabase.ts` - STORAGE_BUCKETS
- `crypto.ts` - ENCODING
- `blog-queries.ts` - blogPostSelect
- `announcement-bar-utils.ts` - ANIMATION_VARIANTS
- `styles/z-index.ts` - Z_INDEX
- `styles/layout-mapper.ts` - WIDTH_PRESETS
- `settings/public.ts` - DEFAULT_ANNOUNCEMENT_BAR_SETTINGS
- `a11y/aria-live.ts` - ARIA_LIVE_PRESETS
- `errors/types.ts` - ErrorCategory, ErrorSeverity
- `nuqs/parsers.ts` - sortOrders
- `validations/page.ts` - SYSTEM_PAGE_SLUGS
- `validations/stripe.ts` - MESSAGES
- `validations/homepage-section.ts` - sectionConfigSchemas

### actions/
- `admin/user.ts` - ROLE_VALUES, Prisma検索

### components/
- `admin/editor/inline/NewsSidePanel.tsx` - CONTENT_WIDTH_OPTIONS
- `admin/editor/inline/side-panel/LayoutFields.tsx` - CONTENT_WIDTH_OPTIONS
- `admin/editor/lexical/config/keyboard-shortcuts.ts` - KEYBOARD_SHORTCUTS

### app/
- `(admin)/admin/(dashboard)/settings/_components/SettingsTabs.tsx` - SETTINGS_TABS
- `(admin)/admin/(dashboard)/settings/_components/BusinessHoursSection.tsx` - DAYS_OF_WEEK
- `(admin)/admin/(dashboard)/users/_components/UserForm.tsx` - ROLE_VALUES
- `(admin)/admin/(dashboard)/blog/comments/_components/CommentFilters.tsx` - STATUS_OPTIONS
- `(public)/contact/page.tsx` - DAYS_OF_WEEK
- `(public)/blog/page.tsx` - Prisma検索
- `(public)/spaces/page.tsx` - Prisma検索

### types/
- `admin-layout.ts` - BREAKPOINTS

### emails/
- `contact-confirmation.tsx` - messageText CSS
- `admin-notification.tsx` - messageText, buttonSection CSS

## テスト結果

- [x] type-check 成功
- [x] lint 成功
- [x] build 成功

## 注意事項

- Prismaクエリの`mode: 'insensitive'`は`satisfies`を使用して型安全性を維持
- Framer MotionのVariantsは型注釈なしで推論に任せる（互換性のため）
- React.CSSPropertiesを使用する場合、インポートが必要ない場合がある

## 移行の利点

1. **明示的な型定義**: コードの意図が明確になる
2. **IDE支援の向上**: より良い補完と型情報
3. **保守性の向上**: 型定義と値の分離
4. **TypeScript推奨パターン**: 公式ベストプラクティスに準拠

---

## Phase 2: 型アサーション（`as Type`）の改善

### 概要

`as const`削除後、残存する`as Type`型アサーションを調査し、型ガードや適切な型定義で置き換え可能なものを改善。

### 改善パターン

#### 1. セッションユーザー型（Better Auth）

```typescript
// Before: 各HOFで型アサーションを繰り返し
const user = session.user as User
const role = user.role as Role

// After: 型ガードで一元管理
// auth.ts
export type User = Omit<Session['user'], 'role'> & {
  role: Role
}

function isValidSessionUser(user: unknown): user is Session['user'] { ... }
function isValidRole(role: string): role is Role { ... }

export function getSessionUser(session: Session | null): User | null {
  if (!session?.user || !isValidSessionUser(session.user)) return null
  const { role, ...rest } = session.user
  if (!isValidRole(role)) return null
  return { ...rest, role }
}

// server-actions.ts（利用側）
const user = getSessionUser(session)
if (!user) return createFailure('ログインが必要です')
const role = user.role  // Role型として推論される
```

#### 2. 関数オーバーロードによる型安全化

```typescript
// Before: 型アサーションで戻り値を強制
export function createSuccess<T>(message: string, data?: T): ActionSuccess<void> | ActionSuccess<T> {
  if (data === undefined) {
    return { success: true, message } as ActionSuccess<void>
  }
  return { success: true, message, data } as ActionSuccess<T>
}

// After: オーバーロードと具体的な戻り値型
export function createSuccess(message: string): ActionSuccess<void>
export function createSuccess<T>(message: string, data: T): ActionSuccess<T>
export function createSuccess<T>(
  message: string,
  data?: T
): { success: true; message: string } | { success: true; message: string; data: T } {
  if (data === undefined) {
    return { success: true, message }
  }
  return { success: true, message, data }
}
```

### 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/lib/auth.ts` | `User`型定義変更、`getSessionUser`型ガード追加、`isValidRole`追加 |
| `src/types/server-actions.ts` | `getSessionUser`使用、HOF内の型アサーション削除、`createSuccess`戻り値型修正 |

### 許容される型アサーション

以下のパターンは技術的制約により型アサーションを維持:

1. **DOM API**: `document.getElementById() as HTMLElement`
2. **FormData取得**: `formData.get('field') as string`
3. **外部ライブラリ**: Better Auth内部型との境界
4. **JSON型変換**: Prisma JSONフィールドのパース結果

### テスト結果

- [x] type-check 成功
- [x] lint 成功
- [x] build 成功

### 効果

1. **型アサーション削減**: HOF内の`as User`、`as Role`を完全削除
2. **実行時検証追加**: `isValidRole`で不正なrole値を検出
3. **一元管理**: 型変換ロジックを`auth.ts`に集約
4. **保守性向上**: Better Auth型変更時の影響範囲を限定

---

## Phase 3: さらなる型アサーション削減

### 概要

Phase 2完了後の残存型アサーションを調査し、以下のパターンを改善。

### 1. Server Actions: `as Role` 完全削除（13ファイル）

#### 変更内容

`auth.ts`に`getRoleFromSession`ヘルパーを追加し、各Server Actionsの`checkReadPermission`パターンを統一。

```typescript
// auth.ts に追加
export function getRoleFromSession(session: Session | null): Role | null {
  if (!session?.user?.role) return null
  return isValidRole(session.user.role) ? session.user.role : null
}

// 各Server Actions（Before）
async function checkReadPermission(): Promise<boolean> {
  const session = await getSession()
  if (!session?.user) return false
  const role = session.user.role as Role  // ← 型アサーション
  ...
}

// 各Server Actions（After）
async function checkReadPermission(): Promise<boolean> {
  const session = await getSession()
  if (!session?.user) return false
  const role = getRoleFromSession(session)  // ← 型安全
  if (!role) return false
  ...
}
```

#### 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/lib/auth.ts` | `getRoleFromSession`追加 |
| `src/lib/permissions.ts` | `as Role`削除 |
| `src/actions/admin/space.ts` | `getRoleFromSession`使用 |
| `src/actions/admin/blog.ts` | 同上 |
| `src/actions/admin/news.ts` | 同上 |
| `src/actions/admin/user.ts` | 同上 |
| `src/actions/admin/audit-log.ts` | 同上 |
| `src/actions/admin/announcement-bar.ts` | 同上 |
| `src/actions/admin/inquiry.ts` | 同上 |
| `src/actions/admin/navigation.ts` | 同上 |
| `src/actions/admin/customer.ts` | 同上 |
| `src/actions/admin/faq.ts` | 同上 |
| `src/actions/admin/homepage-settings.ts` | 同上 |
| `src/actions/admin/reservation.ts` | 同上 |
| `src/actions/admin/settings.ts` | 同上 |

### 2. URLSearchParams: バリデーション関数追加（4ファイル）

#### 変更内容

enum型パラメータの型キャストをバリデーション関数で置き換え。

```typescript
// Before
const status = params.status as 'ALL' | 'PUBLISHED' | 'DRAFT' | undefined

// After
type StatusFilter = 'ALL' | 'PUBLISHED' | 'DRAFT'

function validateStatus(value: string | undefined): StatusFilter | undefined {
  if (!value) return undefined
  const validStatuses: StatusFilter[] = ['ALL', 'PUBLISHED', 'DRAFT']
  return validStatuses.includes(value as StatusFilter) ? (value as StatusFilter) : undefined
}

const status = validateStatus(params.status)
```

#### 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/app/(admin)/admin/(dashboard)/users/page.tsx` | `validateRole`, `validateSortBy`, `validateSortOrder`追加 |
| `src/app/(admin)/admin/(dashboard)/audit-logs/page.tsx` | `validateAuditAction`追加 |
| `src/app/(admin)/admin/(dashboard)/blog/page.tsx` | `validateStatus`追加 |
| `src/app/(admin)/admin/(dashboard)/news/page.tsx` | `validateStatus`追加 |

### 3. JSON config: 型ガード関数追加

#### 変更内容

`homepage-section.ts`に各セクションタイプの型ガード関数を追加し、`SectionEditor.tsx`で使用。

```typescript
// homepage-section.ts に追加
export function isHeroConfig(config: unknown): config is HeroConfig {
  return heroConfigSchema.safeParse(config).success
}

// SectionEditor.tsx（Before）
const config = section.config as Record<string, unknown>
<HeroConfigForm config={config as HeroConfig} ... />

// SectionEditor.tsx（After）
const getValidConfig = <T,>(
  validator: (c: unknown) => c is T,
  type: HomepageSectionType
): T => {
  if (validator(config)) return config
  return defaultSectionConfigs[type] as T
}

<HeroConfigForm config={getValidConfig(isHeroConfig, HomepageSectionType.HERO)} ... />
```

#### 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/lib/validations/homepage-section.ts` | 7つの型ガード関数追加 |
| `src/app/(admin)/admin/(dashboard)/settings/_components/tabs/SectionEditor.tsx` | 型ガード使用 |

### 4. FormData: ヘルパー関数追加

#### 変更内容

`utils.ts`に型安全なFormData取得関数を追加。

```typescript
// utils.ts に追加
export function getFormString(formData: FormData, key: string, defaultValue = ''): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value : defaultValue
}

export function getFormStringOrNull(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  return typeof value === 'string' && value !== '' ? value : null
}

// Before
const email = formData.get('email') as string

// After
const email = getFormString(formData, 'email')
```

#### 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/lib/utils.ts` | `getFormString`, `getFormStringOrNull`, `getFormNumber`, `getFormBoolean`追加 |
| `src/app/(admin)/admin/(dashboard)/audit-logs/_components/AuditLogFilters.tsx` | ヘルパー使用 |
| `src/app/(public)/blog/[slug]/_components/CommentForm.tsx` | ヘルパー使用 |
| `src/app/(admin)/admin/(dashboard)/blog/comments/_components/CommentFilters.tsx` | ヘルパー使用 |

### 5. localStorage: 型ガード追加

#### 変更内容

限定的な値を扱うlocalStorageアクセスに型ガードを追加。

```typescript
// Before
return localStorage.getItem(STORAGE_KEY) as CookieConsentStatus

// After
function isValidConsentStatus(value: string | null): value is 'accepted' | 'rejected' {
  return value === 'accepted' || value === 'rejected'
}

const value = localStorage.getItem(STORAGE_KEY)
return isValidConsentStatus(value) ? value : null
```

#### 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/components/site/CookieConsentBanner.tsx` | `isValidConsentStatus`型ガード追加 |

### テスト結果

- [x] type-check 成功
- [x] lint 成功
- [x] build 成功

### 総括

Phase 3により、以下の改善を達成:

1. **Server Actions**: 13ファイルで`as Role`を完全削除
2. **URLSearchParams**: 4ファイルでバリデーション関数に置き換え
3. **JSON config**: 型ガード関数で安全なconfig取得
4. **FormData**: 汎用ヘルパー関数でコード再利用性向上
5. **localStorage**: 限定値の型ガード追加

### 残存する許容される型アサーション

以下は技術的制約により維持:

1. **DOM API**: `document.getElementById() as HTMLElement`
2. **外部ライブラリ境界**: Better Auth内部型
3. **Prisma JSONフィールド**: 動的スキーマのため完全な型付けが困難
4. **インライン型アサーション**: バリデーション関数内の`includes`チェック後の安全なキャスト
