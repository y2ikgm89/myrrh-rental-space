# 070: Instagram連携機能 + 管理画面UI統一 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Instagram投稿を公開ページに表示する機能と、管理画面のUI統一（ラジオボタン→ボックスリスト形式）を実装する

**Architecture:** Instagram API with Instagram Login（OAuth 2.0）でフィード取得、oEmbed APIで埋め込みHTML取得。管理画面は新規SelectionBoxコンポーネントで統一。

**Tech Stack:** Next.js 16 / React 19 / Prisma 7 / Instagram Graph API / Lexical 0.39 / Tailwind CSS 4

> 作成日: 2026-01-25
> ステータス: 実装準備完了

## 概要

Instagram投稿を公開ページに表示する機能と、管理画面のUI統一（ラジオボタン→ボックスリスト形式）を同時に実施する。

## 背景

### Instagram API変更

- **2024年12月4日**: Instagram Basic Display API 廃止
- **現在の推奨**: Instagram API with Instagram Login
- **対象アカウント**: Business / Creator（プロフェッショナル）アカウントのみ

### 管理画面UI課題

- ラジオボタンが視覚的にわかりにくい
- 選択肢の説明が不足
- モバイルでのタップ領域が小さい

---

## 機能要件

### 1. Instagram連携

#### 1.1 API連携設定（管理画面）

| 項目 | 説明 |
|------|------|
| OAuth認証 | Instagramアカウントでワンクリック連携 |
| 手動トークン入力 | 開発者向け、Meta開発者コンソールから取得 |
| トークン自動更新 | 50日ごとにCronジョブでリフレッシュ |
| 接続ステータス表示 | 連携状態、有効期限、ユーザー名表示 |

#### 1.2 フィード取得

| 項目 | 説明 |
|------|------|
| 自動取得 | 最新N件のフィードを自動取得 |
| 手動選択 | 個別投稿URLを指定して追加 |
| キャッシュ | 1時間のキャッシュでAPI呼び出し削減 |
| メディアタイプ | IMAGE / VIDEO / CAROUSEL_ALBUM 対応 |

#### 1.3 ホームページセクション

| 設定項目 | 選択肢 |
|----------|--------|
| レイアウト | グリッド / カルーセル / カード |
| 列数（PC） | 3 / 4 / 6 |
| 表示件数 | 4 / 6 / 8 / 12 |
| キャプション表示 | ON / OFF |
| 「もっと見る」リンク | ON / OFF |

#### 1.4 Lexical埋め込み

| 項目 | 説明 |
|------|------|
| ノード | InstagramNode（DecoratorNode） |
| プラグイン | InstagramPlugin（ダイアログ形式） |
| 埋め込み方式 | oEmbed API（公式HTML取得） |

### 2. 管理画面UI統一

#### 2.1 ボックスリスト形式への移行

**対象箇所（4箇所）**:

| ファイル | 選択肢 | 現状 |
|----------|--------|------|
| ReservationForm.tsx | 予約ステータス（2択） | ネイティブradio |
| SeoSection.tsx | トラッキング方式（3択） | ネイティブradio |
| PermalinkSection.tsx | URL構造（3択） | ネイティブradio |
| LayoutPlugin.tsx | カラムレイアウト（5択） | Radix RadioGroup |

#### 2.2 ボックスリストコンポーネント

```tsx
// 新規コンポーネント: SelectionBox
interface SelectionBoxProps {
  options: {
    value: string
    label: string
    description?: string
    icon?: ReactNode
  }[]
  value: string
  onChange: (value: string) => void
  columns?: 1 | 2 | 3
}
```

**デザイン仕様**:
- 選択状態: 枠線ハイライト + 背景色変更
- ホバー: 軽い背景色変更
- アイコン: オプション（左側に配置）
- 説明文: ラベル下に小さく表示

---

## 技術設計

### データベース

```prisma
// Settings テーブルに追加
model Settings {
  // ... 既存フィールド

  // Instagram連携
  instagramAccessToken     String?   // 暗号化
  instagramTokenExpiresAt  DateTime?
  instagramUserId          String?
  instagramUsername        String?
  instagramAccountType     String?   // BUSINESS / CREATOR

  // Instagramセクション設定
  instagramFeedEnabled     Boolean   @default(false)
  instagramFeedLayout      String    @default("grid") // grid / carousel / card
  instagramFeedColumns     Int       @default(4)
  instagramFeedMaxItems    Int       @default(8)
  instagramShowCaption     Boolean   @default(false)
  instagramShowViewAll     Boolean   @default(true)
}

// 手動選択投稿
model InstagramPost {
  id           String   @id @default(cuid())
  postId       String   @unique
  postUrl      String
  mediaUrl     String?
  thumbnailUrl String?
  caption      String?
  mediaType    String   // IMAGE / VIDEO / CAROUSEL_ALBUM
  permalink    String
  sortOrder    Int      @default(0)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

// HomepageSectionType enum に追加
enum HomepageSectionType {
  // ... 既存
  INSTAGRAM
}
```

### API設計

#### Instagram連携

| エンドポイント | メソッド | 用途 |
|---------------|---------|------|
| `/api/instagram/oauth/authorize` | GET | OAuth認証開始 |
| `/api/instagram/oauth/callback` | GET | OAuth認証コールバック |
| `/api/instagram/feed` | GET | フィード取得（キャッシュ付き） |
| `/api/instagram/oembed` | GET | oEmbed HTML取得 |
| `/api/cron/instagram-refresh` | POST | トークン自動更新 |

#### Server Actions

```typescript
// src/app/(admin)/admin/(dashboard)/_shared/actions/instagram.ts

// 設定
export async function getInstagramConfig(): Promise<InstagramConfig>
export async function updateInstagramSettings(data: InstagramSettingsInput): Promise<ActionResult>
export async function disconnectInstagram(): Promise<ActionResult>

// 手動トークン
export async function saveManualToken(token: string): Promise<ActionResult>
export async function testInstagramConnection(token: string): Promise<ActionResult>

// 手動選択投稿
export async function getInstagramPosts(): Promise<InstagramPost[]>
export async function addInstagramPost(url: string): Promise<ActionResult>
export async function removeInstagramPost(id: string): Promise<ActionResult>
export async function reorderInstagramPosts(ids: string[]): Promise<ActionResult>
```

### OAuth認証フロー

```
1. ユーザーが「Instagramと連携」ボタンをクリック
   ↓
2. /api/instagram/oauth/authorize にリダイレクト
   ↓
3. Instagram認証画面を表示
   GET https://www.instagram.com/oauth/authorize
   ?client_id={APP_ID}
   &redirect_uri={CALLBACK_URL}
   &scope=instagram_business_basic
   &response_type=code
   &state={CSRF_TOKEN}
   ↓
4. ユーザーが承認
   ↓
5. /api/instagram/oauth/callback にリダイレクト
   ?code={AUTH_CODE}
   &state={CSRF_TOKEN}
   ↓
6. 短期トークン取得
   POST https://api.instagram.com/oauth/access_token
   ↓
7. 長期トークンに交換
   GET https://graph.instagram.com/access_token
   ?grant_type=ig_exchange_token
   &client_secret={APP_SECRET}
   &access_token={SHORT_TOKEN}
   ↓
8. トークンを暗号化して保存
   ↓
9. 設定画面にリダイレクト（成功メッセージ表示）
```

### トークン自動更新

```typescript
// Vercel Cron Job: 毎日実行
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/instagram-refresh",
      "schedule": "0 3 * * *"
    }
  ]
}

// 更新ロジック
// - 有効期限が10日以内のトークンを更新
// - 更新失敗時は管理者にメール通知
```

### Lexical実装

```
src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/
├── nodes/
│   └── InstagramNode.tsx    # DecoratorNode
└── plugins/
    └── InstagramPlugin.tsx  # ダイアログ + oEmbed取得
```

#### InstagramNode

```typescript
class InstagramNode extends DecoratorNode<ReactElement> {
  __postId: string
  __embedHtml: string

  static getType(): string { return 'instagram' }
  static clone(node: InstagramNode): InstagramNode
  static importJSON(data: SerializedInstagramNode): InstagramNode
  static importDOM(): DOMConversionMap | null

  exportJSON(): SerializedInstagramNode
  exportDOM(): DOMExportOutput

  decorate(): ReactElement // InstagramComponent
}
```

#### InstagramPlugin

```typescript
// URL解析対応形式
// - https://www.instagram.com/p/{postId}/
// - https://www.instagram.com/reel/{postId}/
// - 直接postId入力

function InstagramPlugin(): ReactElement | null {
  // ダイアログでURL入力
  // oEmbed APIでHTML取得
  // InstagramNode挿入
}
```

### ホームページセクション

```typescript
// src/app/(public)/_shared/components/sections/InstagramSectionRenderer.tsx

async function InstagramSectionRenderer({
  section,
}: {
  section: HomepageSectionData
}) {
  const config = getSafeConfig(section.config)
  const feed = await getInstagramFeed(config.maxItems)
  const manualPosts = await getInstagramPosts()

  return (
    <section>
      {/* フィード自動取得 */}
      <InstagramGrid
        posts={feed}
        layout={config.layout}
        columns={config.columns}
        showCaption={config.showCaption}
      />

      {/* 手動選択投稿 */}
      {manualPosts.length > 0 && (
        <InstagramGrid
          posts={manualPosts}
          layout={config.layout}
          columns={config.columns}
          showCaption={config.showCaption}
        />
      )}

      {config.showViewAll && (
        <Link href={`https://instagram.com/${username}`}>
          もっと見る
        </Link>
      )}
    </section>
  )
}
```

### UI統一: SelectionBoxコンポーネント

```typescript
// src/app/(admin)/admin/(dashboard)/_shared/components/ui/selection-box.tsx

'use client'

import { cn } from '@/shared/lib/utils'

interface SelectionBoxOption {
  value: string
  label: string
  description?: string
  icon?: ReactNode
}

interface SelectionBoxProps {
  options: SelectionBoxOption[]
  value: string
  onChange: (value: string) => void
  columns?: 1 | 2 | 3
  disabled?: boolean
}

export function SelectionBox({
  options,
  value,
  onChange,
  columns = 1,
  disabled = false,
}: SelectionBoxProps) {
  return (
    <div
      className={cn(
        'grid gap-3',
        columns === 1 && 'grid-cols-1',
        columns === 2 && 'grid-cols-1 sm:grid-cols-2',
        columns === 3 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          disabled={disabled}
          className={cn(
            'flex items-start gap-3 rounded-lg border p-4 text-left transition-colors',
            'hover:border-primary/50 hover:bg-muted/50',
            value === option.value
              ? 'border-primary bg-primary/5 ring-1 ring-primary'
              : 'border-border',
            disabled && 'cursor-not-allowed opacity-50',
          )}
        >
          {option.icon && (
            <div className="shrink-0 text-muted-foreground">
              {option.icon}
            </div>
          )}
          <div className="flex-1">
            <div className="font-medium">{option.label}</div>
            {option.description && (
              <div className="mt-1 text-sm text-muted-foreground">
                {option.description}
              </div>
            )}
          </div>
          <div
            className={cn(
              'mt-0.5 h-4 w-4 shrink-0 rounded-full border-2',
              value === option.value
                ? 'border-primary bg-primary'
                : 'border-muted-foreground/30',
            )}
          >
            {value === option.value && (
              <div className="h-full w-full rounded-full bg-white scale-50" />
            )}
          </div>
        </button>
      ))}
    </div>
  )
}
```

---

## 実装計画

### Phase 1: 基盤整備

1. **SelectionBoxコンポーネント作成**
   - UIコンポーネント実装
   - Storybook追加（任意）

2. **データベース更新**
   - Prismaスキーマ更新
   - マイグレーション実行

3. **環境変数追加**
   ```env
   INSTAGRAM_APP_ID=
   INSTAGRAM_APP_SECRET=
   INSTAGRAM_REDIRECT_URI=
   ```

### Phase 2: Instagram連携（API）

4. **OAuth認証実装**
   - 認証開始エンドポイント
   - コールバックエンドポイント
   - トークン保存ロジック

5. **API実装**
   - フィード取得（キャッシュ付き）
   - oEmbed取得
   - トークンリフレッシュCron

6. **Server Actions実装**
   - 設定取得・更新
   - 手動トークン保存
   - 接続テスト

### Phase 3: 管理画面

7. **Instagram設定UI**
   - API連携設定（ボックスリスト形式）
   - フィード設定
   - 手動投稿選択

8. **既存ラジオボタン移行**
   - ReservationForm.tsx
   - SeoSection.tsx
   - PermalinkSection.tsx
   - LayoutPlugin.tsx

### Phase 4: 公開ページ

9. **ホームページセクション**
   - InstagramSectionRenderer
   - グリッド/カルーセル/カードレイアウト
   - レスポンシブ対応

10. **セクション設定UI**
    - HomepageTab にInstagram追加
    - SectionEditor拡張

### Phase 5: Lexicalエディタ

11. **InstagramNode実装**
    - ノードクラス
    - シリアライズ/デシリアライズ
    - DOM変換

12. **InstagramPlugin実装**
    - ダイアログUI
    - URL解析
    - oEmbed取得・挿入

### Phase 6: 仕上げ

13. **テスト**
    - Server Actionsテスト
    - API統合テスト

14. **ドキュメント更新**
    - 設定手順書
    - トラブルシューティング

---

## API制限対策

### レート制限

| 項目 | 値 |
|------|-----|
| 制限 | 200リクエスト/時間/ユーザー |
| 対策 | 1時間キャッシュ、バッチ取得 |

### キャッシュ戦略

```typescript
// フィード取得時
const CACHE_TTL = 60 * 60 // 1時間

async function getInstagramFeed(maxItems: number) {
  const cached = await redis.get('instagram:feed')
  if (cached) return JSON.parse(cached)

  const feed = await fetchFromInstagramAPI(maxItems)
  await redis.setex('instagram:feed', CACHE_TTL, JSON.stringify(feed))
  return feed
}
```

### エラーハンドリング

| エラーコード | 対応 |
|------------|------|
| 190 | トークン再認証を促す |
| 429 | 指数バックオフでリトライ |
| 200 | 権限不足を通知 |

---

## セキュリティ

1. **トークン暗号化**: AES-256-GCMで暗号化して保存
2. **CSRF対策**: OAuth stateパラメータで検証
3. **入力検証**: Zodスキーマでバリデーション
4. **API Secret**: 環境変数で管理、クライアントに露出しない

---

## 依存関係

- Meta App（Instagram API用）の作成・審査が必要
- Business Verification完了が必要（本番利用時）

---

## 参考資料

- [Instagram Platform Documentation](https://developers.facebook.com/docs/instagram-platform)
- [Instagram Graph API Guide 2025](https://elfsight.com/blog/instagram-graph-api-complete-developer-guide-for-2025/)
- [Basic Display API Deprecation](https://smashballoon.com/instagram-is-shutting-down-basic-display-api-continue-displaying-instagram-feeds-on-your-site/)

---

## 詳細タスクリスト

### Task 1: SelectionBoxコンポーネント作成

**Files:**
- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/ui/selection-box.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/ui/index.ts`

**Step 1: SelectionBoxコンポーネント作成**

```tsx
// src/app/(admin)/admin/(dashboard)/_shared/components/ui/selection-box.tsx
'use client'

import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/utils'

interface SelectionBoxOption {
  value: string
  label: string
  description?: string
  icon?: ReactNode
}

interface SelectionBoxProps {
  options: SelectionBoxOption[]
  value: string
  onChange: (value: string) => void
  columns?: 1 | 2 | 3
  disabled?: boolean
  name?: string
}

export function SelectionBox({
  options,
  value,
  onChange,
  columns = 1,
  disabled = false,
  name,
}: SelectionBoxProps) {
  return (
    <div
      role="radiogroup"
      aria-label={name}
      className={cn(
        'grid gap-3',
        columns === 1 && 'grid-cols-1',
        columns === 2 && 'grid-cols-1 sm:grid-cols-2',
        columns === 3 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          disabled={disabled}
          className={cn(
            'flex items-start gap-3 rounded-lg border p-4 text-left transition-colors',
            'hover:border-primary/50 hover:bg-muted/50',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            value === option.value
              ? 'border-primary bg-primary/5 ring-1 ring-primary'
              : 'border-border',
            disabled && 'cursor-not-allowed opacity-50',
          )}
        >
          {option.icon && (
            <div className="shrink-0 text-muted-foreground">{option.icon}</div>
          )}
          <div className="flex-1">
            <div className="font-medium">{option.label}</div>
            {option.description && (
              <div className="mt-1 text-sm text-muted-foreground">
                {option.description}
              </div>
            )}
          </div>
          <div
            className={cn(
              'mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 transition-colors',
              value === option.value
                ? 'border-primary bg-primary'
                : 'border-muted-foreground/30',
            )}
          >
            {value === option.value && (
              <div className="h-full w-full scale-50 rounded-full bg-white" />
            )}
          </div>
        </button>
      ))}
    </div>
  )
}
```

**Step 2: index.tsにエクスポート追加**

```typescript
// src/app/(admin)/admin/(dashboard)/_shared/components/ui/index.ts に追加
export { SelectionBox } from './selection-box'
```

**Step 3: 動作確認**

Run: `bun run type-check`
Expected: PASS

**Step 4: Commit**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/ui/selection-box.tsx
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/ui/index.ts
git commit -m "feat(ui): add SelectionBox component for box-list style selection"
```

---

### Task 2: Prismaスキーマ更新（Instagram関連）

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Settingsモデルに Instagram フィールド追加**

```prisma
// prisma/schema.prisma の Settings モデルに追加

  // Instagram連携
  instagramAccessToken    String?
  instagramTokenExpiresAt DateTime?
  instagramUserId         String?
  instagramUsername       String?
  instagramAccountType    String?
```

**Step 2: InstagramPostモデル追加**

```prisma
// prisma/schema.prisma に追加

model InstagramPost {
  id           String   @id @default(cuid())
  postId       String   @unique
  postUrl      String
  mediaUrl     String?
  thumbnailUrl String?
  caption      String?
  mediaType    String
  permalink    String
  sortOrder    Int      @default(0)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

**Step 3: HomepageSectionType enumに INSTAGRAM追加**

```prisma
enum HomepageSectionType {
  HERO
  SPACE_LIST
  NEWS
  BLOG
  FAQ
  CTA
  CUSTOM
  INSTAGRAM
}
```

**Step 4: マイグレーション実行**

Run: `bunx --bun prisma migrate dev --name add_instagram_integration`
Expected: Migration applied successfully

**Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): add Instagram integration schema"
```

---

### Task 3: 環境変数スキーマ更新

**Files:**
- Modify: `src/shared/lib/env/server.ts`

**Step 1: Instagram環境変数追加**

```typescript
// src/shared/lib/env/server.ts に追加

  // Instagram API
  INSTAGRAM_APP_ID: z.string().optional(),
  INSTAGRAM_APP_SECRET: z.string().optional(),
  INSTAGRAM_REDIRECT_URI: z.string().url().optional(),
```

**Step 2: 型チェック**

Run: `bun run type-check`
Expected: PASS

**Step 3: Commit**

```bash
git add src/shared/lib/env/server.ts
git commit -m "feat(env): add Instagram API environment variables"
```

---

### Task 4: Instagram Server Actions作成

**Files:**
- Create: `src/app/(admin)/admin/(dashboard)/_shared/actions/instagram.ts`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/lib/instagram.ts`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/lib/validations/instagram.ts`

**Step 1: バリデーションスキーマ作成**

```typescript
// src/app/(admin)/admin/(dashboard)/_shared/lib/validations/instagram.ts
import { z } from 'zod'

export const instagramSettingsSchema = z.object({
  feedEnabled: z.boolean(),
  feedLayout: z.enum(['grid', 'carousel', 'card']),
  feedColumns: z.number().int().min(2).max(6),
  feedMaxItems: z.number().int().min(1).max(24),
  showCaption: z.boolean(),
  showViewAll: z.boolean(),
})

export type InstagramSettingsInput = z.infer<typeof instagramSettingsSchema>

export const instagramPostUrlSchema = z.string().url().refine(
  (url) => {
    const pattern = /^https:\/\/(www\.)?instagram\.com\/(p|reel)\/[\w-]+\/?/
    return pattern.test(url)
  },
  { message: '有効なInstagram投稿URLを入力してください' }
)

export const instagramTokenSchema = z.string().min(1, 'トークンを入力してください')
```

**Step 2: Instagramユーティリティ作成**

```typescript
// src/app/(admin)/admin/(dashboard)/_shared/lib/instagram.ts
import { env } from '@/shared/lib/env/server'

const INSTAGRAM_API_BASE = 'https://graph.instagram.com'
const FACEBOOK_GRAPH_BASE = 'https://graph.facebook.com/v24.0'

export interface InstagramMedia {
  id: string
  caption?: string
  mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'
  mediaUrl?: string
  thumbnailUrl?: string
  permalink: string
  timestamp: string
}

export async function fetchInstagramFeed(
  accessToken: string,
  limit: number = 12
): Promise<InstagramMedia[]> {
  const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp'
  const url = `${INSTAGRAM_API_BASE}/me/media?fields=${fields}&limit=${limit}&access_token=${accessToken}`

  const response = await fetch(url)
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Failed to fetch Instagram feed')
  }

  const data = await response.json()
  return data.data.map((item: Record<string, unknown>) => ({
    id: item.id,
    caption: item.caption,
    mediaType: item.media_type,
    mediaUrl: item.media_url,
    thumbnailUrl: item.thumbnail_url,
    permalink: item.permalink,
    timestamp: item.timestamp,
  }))
}

export async function fetchInstagramOembed(
  postUrl: string,
  accessToken: string
): Promise<string> {
  const url = `${FACEBOOK_GRAPH_BASE}/instagram_oembed?url=${encodeURIComponent(postUrl)}&access_token=${accessToken}`

  const response = await fetch(url)
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Failed to fetch oEmbed')
  }

  const data = await response.json()
  return data.html
}

export async function exchangeCodeForToken(code: string): Promise<{
  accessToken: string
  userId: string
}> {
  const response = await fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.INSTAGRAM_APP_ID!,
      client_secret: env.INSTAGRAM_APP_SECRET!,
      grant_type: 'authorization_code',
      redirect_uri: env.INSTAGRAM_REDIRECT_URI!,
      code,
    }),
  })

  if (!response.ok) {
    throw new Error('Failed to exchange code for token')
  }

  const data = await response.json()
  return {
    accessToken: data.access_token,
    userId: data.user_id,
  }
}

export async function exchangeForLongLivedToken(
  shortLivedToken: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const url = `${INSTAGRAM_API_BASE}/access_token?grant_type=ig_exchange_token&client_secret=${env.INSTAGRAM_APP_SECRET}&access_token=${shortLivedToken}`

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Failed to exchange for long-lived token')
  }

  const data = await response.json()
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  }
}

export async function refreshLongLivedToken(
  token: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const url = `${INSTAGRAM_API_BASE}/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Failed to refresh token')
  }

  const data = await response.json()
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  }
}

export async function fetchInstagramUserInfo(
  accessToken: string
): Promise<{ id: string; username: string; accountType: string }> {
  const url = `${INSTAGRAM_API_BASE}/me?fields=id,username,account_type&access_token=${accessToken}`

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Failed to fetch user info')
  }

  const data = await response.json()
  return {
    id: data.id,
    username: data.username,
    accountType: data.account_type,
  }
}
```

**Step 3: Server Actions作成**

```typescript
// src/app/(admin)/admin/(dashboard)/_shared/actions/instagram.ts
'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/shared/lib/prisma'
import { encrypt, safeDecrypt } from '@/shared/lib/crypto'
import { withAuth } from '@/admin/lib/action-auth'
import {
  instagramSettingsSchema,
  instagramPostUrlSchema,
  instagramTokenSchema,
  type InstagramSettingsInput,
} from '@/admin/lib/validations/instagram'
import {
  fetchInstagramFeed,
  fetchInstagramUserInfo,
  refreshLongLivedToken,
  exchangeForLongLivedToken,
} from '@/admin/lib/instagram'
import type { ActionResult } from '@/admin/types/server-actions'

export interface InstagramConfig {
  connected: boolean
  username?: string
  accountType?: string
  tokenExpiresAt?: Date
  feedEnabled: boolean
  feedLayout: 'grid' | 'carousel' | 'card'
  feedColumns: number
  feedMaxItems: number
  showCaption: boolean
  showViewAll: boolean
}

export async function getInstagramConfig(): Promise<InstagramConfig> {
  return withAuth(async () => {
    const settings = await prisma.settings.findFirst()

    if (!settings) {
      return {
        connected: false,
        feedEnabled: false,
        feedLayout: 'grid',
        feedColumns: 4,
        feedMaxItems: 8,
        showCaption: false,
        showViewAll: true,
      }
    }

    const hasToken = !!settings.instagramAccessToken
    const decryptedToken = hasToken
      ? safeDecrypt(settings.instagramAccessToken!)
      : null

    return {
      connected: !!decryptedToken,
      username: settings.instagramUsername ?? undefined,
      accountType: settings.instagramAccountType ?? undefined,
      tokenExpiresAt: settings.instagramTokenExpiresAt ?? undefined,
      feedEnabled: settings.instagramFeedEnabled ?? false,
      feedLayout: (settings.instagramFeedLayout as 'grid' | 'carousel' | 'card') ?? 'grid',
      feedColumns: settings.instagramFeedColumns ?? 4,
      feedMaxItems: settings.instagramFeedMaxItems ?? 8,
      showCaption: settings.instagramShowCaption ?? false,
      showViewAll: settings.instagramShowViewAll ?? true,
    }
  })
}

export async function updateInstagramSettings(
  input: InstagramSettingsInput
): Promise<ActionResult> {
  return withAuth(async () => {
    const validated = instagramSettingsSchema.parse(input)

    await prisma.settings.updateMany({
      data: {
        instagramFeedEnabled: validated.feedEnabled,
        instagramFeedLayout: validated.feedLayout,
        instagramFeedColumns: validated.feedColumns,
        instagramFeedMaxItems: validated.feedMaxItems,
        instagramShowCaption: validated.showCaption,
        instagramShowViewAll: validated.showViewAll,
      },
    })

    revalidatePath('/admin/settings')
    revalidatePath('/')

    return { success: true, message: 'Instagram設定を更新しました' }
  })
}

export async function saveManualToken(token: string): Promise<ActionResult> {
  return withAuth(async () => {
    instagramTokenSchema.parse(token)

    // トークンをテスト
    const userInfo = await fetchInstagramUserInfo(token)

    // 長期トークンに交換
    const longLived = await exchangeForLongLivedToken(token)
    const expiresAt = new Date(Date.now() + longLived.expiresIn * 1000)

    // 暗号化して保存
    const encryptedToken = encrypt(longLived.accessToken)

    await prisma.settings.updateMany({
      data: {
        instagramAccessToken: encryptedToken,
        instagramTokenExpiresAt: expiresAt,
        instagramUserId: userInfo.id,
        instagramUsername: userInfo.username,
        instagramAccountType: userInfo.accountType,
      },
    })

    revalidatePath('/admin/settings')

    return {
      success: true,
      message: `Instagram連携完了: @${userInfo.username}`,
    }
  })
}

export async function testInstagramConnection(
  token: string
): Promise<ActionResult<{ username: string }>> {
  return withAuth(async () => {
    instagramTokenSchema.parse(token)

    const userInfo = await fetchInstagramUserInfo(token)

    return {
      success: true,
      message: `接続成功: @${userInfo.username}`,
      data: { username: userInfo.username },
    }
  })
}

export async function disconnectInstagram(): Promise<ActionResult> {
  return withAuth(async () => {
    await prisma.settings.updateMany({
      data: {
        instagramAccessToken: null,
        instagramTokenExpiresAt: null,
        instagramUserId: null,
        instagramUsername: null,
        instagramAccountType: null,
      },
    })

    revalidatePath('/admin/settings')

    return { success: true, message: 'Instagram連携を解除しました' }
  })
}

// 手動選択投稿
export async function getInstagramPosts() {
  return withAuth(async () => {
    return prisma.instagramPost.findMany({
      orderBy: { sortOrder: 'asc' },
    })
  })
}

export async function addInstagramPost(url: string): Promise<ActionResult> {
  return withAuth(async () => {
    instagramPostUrlSchema.parse(url)

    // postIdを抽出
    const match = url.match(/instagram\.com\/(p|reel)\/([\w-]+)/)
    if (!match) {
      return { success: false, error: '無効なInstagram URLです' }
    }
    const postId = match[2]

    // 重複チェック
    const existing = await prisma.instagramPost.findUnique({
      where: { postId },
    })
    if (existing) {
      return { success: false, error: 'この投稿は既に追加されています' }
    }

    // 最大sortOrderを取得
    const maxOrder = await prisma.instagramPost.aggregate({
      _max: { sortOrder: true },
    })

    await prisma.instagramPost.create({
      data: {
        postId,
        postUrl: url,
        mediaType: 'IMAGE', // oEmbedで取得時に更新
        permalink: url,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
    })

    revalidatePath('/admin/settings')
    revalidatePath('/')

    return { success: true, message: '投稿を追加しました' }
  })
}

export async function removeInstagramPost(id: string): Promise<ActionResult> {
  return withAuth(async () => {
    await prisma.instagramPost.delete({
      where: { id },
    })

    revalidatePath('/admin/settings')
    revalidatePath('/')

    return { success: true, message: '投稿を削除しました' }
  })
}

export async function reorderInstagramPosts(
  ids: string[]
): Promise<ActionResult> {
  return withAuth(async () => {
    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.instagramPost.update({
          where: { id },
          data: { sortOrder: index },
        })
      )
    )

    revalidatePath('/admin/settings')

    return { success: true, message: '並び順を更新しました' }
  })
}
```

**Step 4: 型チェック**

Run: `bun run type-check`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/actions/instagram.ts
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/lib/instagram.ts
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/lib/validations/instagram.ts
git commit -m "feat(instagram): add server actions and utilities"
```

---

### Task 5: Instagram OAuth APIルート作成

**Files:**
- Create: `src/app/api/instagram/oauth/authorize/route.ts`
- Create: `src/app/api/instagram/oauth/callback/route.ts`

**Step 1: 認証開始ルート作成**

```typescript
// src/app/api/instagram/oauth/authorize/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { env } from '@/shared/lib/env/server'

export async function GET() {
  if (!env.INSTAGRAM_APP_ID || !env.INSTAGRAM_REDIRECT_URI) {
    return NextResponse.json(
      { error: 'Instagram API not configured' },
      { status: 500 }
    )
  }

  // CSRF対策用のstate生成
  const state = crypto.randomUUID()
  const cookieStore = await cookies()
  cookieStore.set('instagram_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10, // 10分
  })

  const params = new URLSearchParams({
    client_id: env.INSTAGRAM_APP_ID,
    redirect_uri: env.INSTAGRAM_REDIRECT_URI,
    scope: 'instagram_business_basic',
    response_type: 'code',
    state,
  })

  const authUrl = `https://www.instagram.com/oauth/authorize?${params}`

  return NextResponse.redirect(authUrl)
}
```

**Step 2: コールバックルート作成**

```typescript
// src/app/api/instagram/oauth/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/shared/lib/prisma'
import { encrypt } from '@/shared/lib/crypto'
import { env } from '@/shared/lib/env/server'
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchInstagramUserInfo,
} from '@/admin/lib/instagram'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  // エラーチェック
  if (error) {
    const errorDescription = searchParams.get('error_description') || 'Unknown error'
    return NextResponse.redirect(
      new URL(`/admin/settings/api?error=${encodeURIComponent(errorDescription)}`, request.url)
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/admin/settings/api?error=Invalid+callback', request.url)
    )
  }

  // CSRF検証
  const cookieStore = await cookies()
  const savedState = cookieStore.get('instagram_oauth_state')?.value
  cookieStore.delete('instagram_oauth_state')

  if (state !== savedState) {
    return NextResponse.redirect(
      new URL('/admin/settings/api?error=Invalid+state', request.url)
    )
  }

  try {
    // 短期トークン取得
    const { accessToken: shortToken, userId } = await exchangeCodeForToken(code)

    // 長期トークンに交換
    const { accessToken: longToken, expiresIn } = await exchangeForLongLivedToken(shortToken)

    // ユーザー情報取得
    const userInfo = await fetchInstagramUserInfo(longToken)

    // 暗号化して保存
    const encryptedToken = encrypt(longToken)
    const expiresAt = new Date(Date.now() + expiresIn * 1000)

    await prisma.settings.updateMany({
      data: {
        instagramAccessToken: encryptedToken,
        instagramTokenExpiresAt: expiresAt,
        instagramUserId: userId,
        instagramUsername: userInfo.username,
        instagramAccountType: userInfo.accountType,
      },
    })

    return NextResponse.redirect(
      new URL(`/admin/settings/api?success=Instagram連携が完了しました&tab=instagram`, request.url)
    )
  } catch (err) {
    console.error('Instagram OAuth error:', err)
    return NextResponse.redirect(
      new URL('/admin/settings/api?error=認証に失敗しました', request.url)
    )
  }
}
```

**Step 3: 型チェック**

Run: `bun run type-check`
Expected: PASS

**Step 4: Commit**

```bash
git add src/app/api/instagram/
git commit -m "feat(instagram): add OAuth routes"
```

---

### Task 6: Instagram設定UIコンポーネント作成

**Files:**
- Create: `src/app/(admin)/admin/(dashboard)/settings/_components/sections/InstagramSection.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/settings/_components/sections/index.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/settings/api/page.tsx`

**Step 1: InstagramSection作成**

```tsx
// src/app/(admin)/admin/(dashboard)/settings/_components/sections/InstagramSection.tsx
'use client'

import { useState, useTransition } from 'react'
import { Instagram, Link2, Key, Unlink } from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Switch,
} from '@/admin/components/ui'
import { SelectionBox } from '@/admin/components/ui/selection-box'
import {
  getInstagramConfig,
  updateInstagramSettings,
  saveManualToken,
  testInstagramConnection,
  disconnectInstagram,
  type InstagramConfig,
} from '@/admin/actions/instagram'
import { StatusBanner } from '../shared'
import { useRefreshOnSuccess } from '../hooks'
import { formatDateTimeShort } from '@/shared/lib/utils'

interface InstagramSectionProps {
  config: InstagramConfig
}

const CONNECTION_OPTIONS = [
  {
    value: 'oauth',
    label: 'Instagramアカウントで連携',
    description: 'ワンクリックで簡単連携（推奨）',
    icon: <Instagram className="h-5 w-5" />,
  },
  {
    value: 'manual',
    label: 'アクセストークンを入力',
    description: 'Meta開発者コンソールから取得',
    icon: <Key className="h-5 w-5" />,
  },
]

const LAYOUT_OPTIONS = [
  {
    value: 'grid',
    label: 'グリッド',
    description: '正方形タイルを並べる（Instagram風）',
  },
  {
    value: 'carousel',
    label: 'カルーセル',
    description: '横スクロールで表示',
  },
  {
    value: 'card',
    label: 'カード',
    description: 'キャプション付きカード形式',
  },
]

export function InstagramSection({ config }: InstagramSectionProps) {
  const { handleResult, refresh } = useRefreshOnSuccess()
  const [isPending, startTransition] = useTransition()
  const [connectionMethod, setConnectionMethod] = useState<'oauth' | 'manual'>('oauth')
  const [manualToken, setManualToken] = useState('')
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const [settings, setSettings] = useState({
    feedEnabled: config.feedEnabled,
    feedLayout: config.feedLayout,
    feedColumns: config.feedColumns,
    feedMaxItems: config.feedMaxItems,
    showCaption: config.showCaption,
    showViewAll: config.showViewAll,
  })

  const handleOAuthConnect = () => {
    window.location.href = '/api/instagram/oauth/authorize'
  }

  const handleManualSave = () => {
    startTransition(async () => {
      const result = await saveManualToken(manualToken)
      if (result.success) {
        setManualToken('')
      }
      handleResult(result)
    })
  }

  const handleTestConnection = async () => {
    if (!manualToken) {
      setTestResult({ success: false, message: 'トークンを入力してください' })
      return
    }
    const result = await testInstagramConnection(manualToken)
    setTestResult({
      success: result.success,
      message: result.success ? result.message! : result.error!,
    })
  }

  const handleDisconnect = () => {
    if (!confirm('Instagram連携を解除しますか？')) return
    startTransition(async () => {
      const result = await disconnectInstagram()
      handleResult(result)
    })
  }

  const handleSettingsSave = () => {
    startTransition(async () => {
      const result = await updateInstagramSettings(settings)
      handleResult(result)
    })
  }

  return (
    <div className="space-y-6">
      {/* 接続設定 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Instagram className="h-5 w-5" />
            Instagram連携
          </CardTitle>
          <CardDescription>
            Instagramアカウントと連携してフィードを表示
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {config.connected ? (
            <>
              <StatusBanner success>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  <span className="font-medium text-green-700">
                    連携済み: @{config.username}
                  </span>
                </div>
                {config.tokenExpiresAt && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    トークン有効期限: {formatDateTimeShort(config.tokenExpiresAt)}
                  </p>
                )}
              </StatusBanner>
              <Button variant="destructive" onClick={handleDisconnect} disabled={isPending}>
                <Unlink className="mr-2 h-4 w-4" />
                連携を解除
              </Button>
            </>
          ) : (
            <>
              <Label>連携方法を選択</Label>
              <SelectionBox
                options={CONNECTION_OPTIONS}
                value={connectionMethod}
                onChange={(v) => setConnectionMethod(v as 'oauth' | 'manual')}
                disabled={isPending}
              />

              {connectionMethod === 'oauth' ? (
                <Button onClick={handleOAuthConnect} disabled={isPending}>
                  <Link2 className="mr-2 h-4 w-4" />
                  Instagramと連携
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="instagram-token">アクセストークン</Label>
                    <Input
                      id="instagram-token"
                      type="text"
                      autoComplete="off"
                      className="font-mono [&:not(:placeholder-shown)]:[-webkit-text-security:disc]"
                      value={manualToken}
                      onChange={(e) => setManualToken(e.target.value)}
                      placeholder="IGQVJ..."
                      disabled={isPending}
                    />
                    <p className="text-xs text-muted-foreground">
                      Meta開発者コンソールの「API Setup with Instagram Login」から取得
                    </p>
                  </div>

                  {testResult && (
                    <StatusBanner success={testResult.success}>
                      <p className={testResult.success ? 'text-green-700' : 'text-destructive'}>
                        {testResult.message}
                      </p>
                    </StatusBanner>
                  )}

                  <div className="flex gap-2">
                    <Button onClick={handleManualSave} disabled={isPending || !manualToken}>
                      {isPending ? '保存中...' : '保存'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleTestConnection}
                      disabled={isPending || !manualToken}
                    >
                      接続テスト
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* フィード設定 */}
      {config.connected && (
        <Card>
          <CardHeader>
            <CardTitle>フィード設定</CardTitle>
            <CardDescription>ホームページに表示するフィードの設定</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Switch
                id="feed-enabled"
                checked={settings.feedEnabled}
                onCheckedChange={(checked) =>
                  setSettings((s) => ({ ...s, feedEnabled: checked }))
                }
                disabled={isPending}
              />
              <Label htmlFor="feed-enabled">フィードを有効化</Label>
            </div>

            <div className="space-y-2">
              <Label>レイアウト</Label>
              <SelectionBox
                options={LAYOUT_OPTIONS}
                value={settings.feedLayout}
                onChange={(v) =>
                  setSettings((s) => ({ ...s, feedLayout: v as 'grid' | 'carousel' | 'card' }))
                }
                columns={3}
                disabled={isPending}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="feed-columns">列数（PC）</Label>
                <Input
                  id="feed-columns"
                  type="number"
                  min={2}
                  max={6}
                  value={settings.feedColumns}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, feedColumns: parseInt(e.target.value) || 4 }))
                  }
                  disabled={isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="feed-max">表示件数</Label>
                <Input
                  id="feed-max"
                  type="number"
                  min={1}
                  max={24}
                  value={settings.feedMaxItems}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, feedMaxItems: parseInt(e.target.value) || 8 }))
                  }
                  disabled={isPending}
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="show-caption"
                  checked={settings.showCaption}
                  onCheckedChange={(checked) =>
                    setSettings((s) => ({ ...s, showCaption: checked }))
                  }
                  disabled={isPending}
                />
                <Label htmlFor="show-caption">キャプション表示</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="show-view-all"
                  checked={settings.showViewAll}
                  onCheckedChange={(checked) =>
                    setSettings((s) => ({ ...s, showViewAll: checked }))
                  }
                  disabled={isPending}
                />
                <Label htmlFor="show-view-all">「もっと見る」リンク</Label>
              </div>
            </div>

            <Button onClick={handleSettingsSave} disabled={isPending}>
              {isPending ? '保存中...' : '設定を保存'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

**Step 2: index.tsにエクスポート追加**

```typescript
// src/app/(admin)/admin/(dashboard)/settings/_components/sections/index.ts に追加
export { InstagramSection } from './InstagramSection'
```

**Step 3: API設定ページにタブ追加**

API設定ページ（`settings/api/page.tsx`）のtabs配列に以下を追加:

```typescript
{
  value: 'instagram',
  label: 'Instagram',
  content: <InstagramSection config={instagramConfig} />,
},
```

**Step 4: 型チェック**

Run: `bun run type-check`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/settings/_components/sections/InstagramSection.tsx
git add src/app/\(admin\)/admin/\(dashboard\)/settings/_components/sections/index.ts
git add src/app/\(admin\)/admin/\(dashboard\)/settings/api/page.tsx
git commit -m "feat(instagram): add settings UI with SelectionBox"
```

---

### Task 7-10: 既存ラジオボタンのSelectionBox移行

**移行対象**:
1. ReservationForm.tsx（予約ステータス）
2. SeoSection.tsx（トラッキング方式）
3. PermalinkSection.tsx（URL構造）
4. LayoutPlugin.tsx（カラムレイアウト）

各ファイルで:
1. `SelectionBox`をインポート
2. ラジオボタンを`SelectionBox`に置換
3. オプション配列を定義（label, description付き）
4. 動作確認してコミット

---

### Task 11: InstagramNode実装（Lexical）

**Files:**
- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/InstagramNode.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/index.ts`

XNodeを参考に、DecoratorNodeパターンで実装。oEmbed HTMLを保持し、公開ページでiframe表示。

---

### Task 12: InstagramPlugin実装（Lexical）

**Files:**
- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/InstagramPlugin.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/index.ts`

ダイアログでURL入力、oEmbed APIでHTML取得、InstagramNode挿入。

---

### Task 13: ホームページセクション実装

**Files:**
- Create: `src/app/(public)/_shared/components/sections/InstagramSectionRenderer.tsx`
- Modify: `src/app/(public)/_shared/components/sections/SectionRenderer.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/settings/_components/homepage/SectionEditor.tsx`

---

### Task 14: トークン自動更新Cron

**Files:**
- Create: `src/app/api/cron/instagram-refresh/route.ts`
- Modify: `vercel.json`

---

### Task 15: テスト追加

**Files:**
- Create: `__tests__/unit/lib/validations/instagram.test.ts`
- Create: `__tests__/integration/actions/admin/instagram.test.ts`

---

### Task 16: ビルド検証・ドキュメント更新

Run: `bun run type-check && bun run lint && bun run build`
Expected: PASS

Update: `docs/plans/README.md` に完了記録
