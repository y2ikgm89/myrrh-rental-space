# サイト設定画面要件定義

> **Note**: このドキュメントには、管理画面の設定画面（`/admin/settings`）の詳細な要件定義が記載されています。技術スタックの詳細については、[`AGENTS.md`](../AGENTS.md)を参照してください。データベース設計については、[`DATABASE_DESIGN.md`](./DATABASE_DESIGN.md)を参照してください。API仕様については、[`API.md`](./API.md)を参照してください。

**最終更新**: 2026-01-06

---

## 目的

管理画面に専用の設定画面（`/admin/settings`）を追加し、オーナーが開発者の介入なしでサイト全体の設定を管理できるようにします。

---

## 現状の不足点

### 1. 専用の設定画面ページが存在しない

- 現在は`/admin/navigation`でロゴとコピーライトのみ設定可能
- その他の設定項目が不足

### 2. 設定項目が限定的

- ロゴとコピーライトのみ
- サイト基本情報、連絡先情報、メール設定、SEO設定などが不足

### 3. Settingsテーブルの設計が不十分

- `key`, `value`形式のみで、型安全性が低い
- 拡張フィールドが限定的（`headerLogoUrl`, `footerCopyright`のみ）

---

## 追加する設定項目

### 1. サイト基本情報

- **サイト名**（必須、1-100文字）
  - 用途: サイト全体のタイトル、メール送信時のブランド名
  - 表示場所: メタタグ、メールヘッダー、管理画面タイトル

- **サイト説明**（オプション、1-500文字）
  - 用途: サイト全体の説明、デフォルトメタディスクリプション
  - 表示場所: メタタグ、OGP設定

- **ファビコンURL**（オプション、Supabase Storage URL）
  - 用途: ブラウザタブに表示されるアイコン
  - 形式: ICO、PNG、SVG（推奨: 32x32px、16x16px）

- **デフォルトOGP画像URL**（オプション、Supabase Storage URL）
  - 用途: SNSシェア時のデフォルト画像
  - 推奨サイズ: 1200x630px

- **ヘッダーロゴURL**（既存、Supabase Storage URL）
  - 用途: サイトヘッダーに表示されるロゴ
  - 表示場所: すべての公開ページのヘッダー

- **フッターコピーライトテキスト**（既存、1-200文字）
  - 用途: フッターに表示されるコピーライト表示
  - 表示場所: すべての公開ページのフッター

### 2. 連絡先情報

- **電話番号**（オプション、電話番号形式）
  - 用途: お問い合わせページ、フッターに表示
  - 形式: `03-1234-5678`、`+81-3-1234-5678`など

- **メールアドレス**（オプション、メール形式）
  - 用途: お問い合わせページ、フッターに表示
  - 用途: お問い合わせフォームの送信先（将来的に）

- **住所**（オプション、1-200文字）
  - 用途: お問い合わせページ、フッターに表示
  - 用途: Google Maps統合（将来的に）

- **営業時間（デフォルト）**（オプション、JSON形式、曜日別の開始/終了時間）
  - 用途: スペースのデフォルト営業時間として使用
  - 形式: `{ "monday": { "start": "09:00", "end": "18:00" }, ... }`
  - 表示場所: お問い合わせページ、フッター

### 3. メール設定

- **送信元メールアドレス**（必須、メール形式、Resend設定と連携）
  - 用途: すべてのメール送信の送信元
  - 制約: Resendで認証済みのドメインである必要がある
  - 参照: [`EMAIL_REQUIREMENTS.md`](./EMAIL_REQUIREMENTS.md)

- **送信者名**（必須、1-100文字）
  - 用途: メール送信時の送信者名
  - 例: `Myrrh Rental Space`、`レンタルスペース運営事務局`

- **返信先メールアドレス**（オプション、メール形式）
  - 用途: メールの返信先（送信元と異なる場合）
  - デフォルト: 送信元メールアドレスと同じ

- **メールテンプレート管理**
  - Resend APIを使用したテンプレートの作成・編集・削除機能
  - 管理画面からテンプレートの内容（HTML）を直接編集可能
  - テンプレート変数の挿入機能
  - テンプレートのプレビュー機能
  - テンプレートの保存・公開（Publish）機能
  - 詳細は以下の「メールテンプレート管理」セクションを参照

### 4. SEO設定

- **デフォルトメタディスクリプション**（オプション、1-160文字）
  - 用途: ページ固有のメタディスクリプションが設定されていない場合のデフォルト値
  - 表示場所: 検索エンジンの検索結果

- **デフォルトメタキーワード**（オプション、カンマ区切り）
  - 用途: ページ固有のメタキーワードが設定されていない場合のデフォルト値
  - 形式: `レンタルスペース,会議室,イベントスペース`

- **デフォルトOGPタイトル**（オプション、1-60文字）
  - 用途: ページ固有のOGPタイトルが設定されていない場合のデフォルト値
  - 表示場所: SNSシェア時のタイトル

- **デフォルトOGP説明**（オプション、1-200文字）
  - 用途: ページ固有のOGP説明が設定されていない場合のデフォルト値
  - 表示場所: SNSシェア時の説明

- **Google Analytics ID**（オプション、G-XXXXXXXXXX形式）
  - 用途: Google Analytics 4のトラッキングID
  - 形式: `G-XXXXXXXXXX`
  - 実装: Next.jsの`next/script`でGoogle Analyticsを読み込み

- **Google Search Console ID**（オプション）
  - 用途: Google Search Consoleの検証用ID
  - 実装: メタタグに追加

### 5. 予約設定

- **デフォルト時間枠**（分単位、15分、30分、60分など、デフォルト: 60分）
  - 用途: 予約フォームの時間選択のデフォルト間隔
  - 制約: 15分、30分、60分のいずれか

- **予約可能な最小時間**（分単位、デフォルト: 60分）
  - 用途: 予約可能な最小時間（例: 1時間以上）
  - 制約: 15分以上、最大時間以下

- **予約可能な最大時間**（分単位、デフォルト: 480分）
  - 用途: 予約可能な最大時間（例: 8時間まで）
  - 制約: 最小時間以上、1440分（24時間）以下

- **キャンセルポリシー**（オプション、テキスト、将来的にリッチテキスト対応）
  - 用途: 予約ページ、予約確認メールに表示
  - 形式: プレーンテキスト（将来的にMarkdownまたはリッチテキスト対応）

- **予約確認メール送信フラグ**（Boolean、デフォルト: true）
  - 用途: 予約作成時にゲストに確認メールを送信するかどうか
  - 参照: [`EMAIL_REQUIREMENTS.md`](./EMAIL_REQUIREMENTS.md)

- **管理者通知メール送信フラグ**（Boolean、デフォルト: true）
  - 用途: 新規予約時に管理者に通知メールを送信するかどうか
  - 参照: [`EMAIL_REQUIREMENTS.md`](./EMAIL_REQUIREMENTS.md)

### 6. 通知設定

- **新規予約通知**（Boolean、デフォルト: true）
  - 用途: 新規予約作成時に管理者に通知するかどうか

- **予約変更通知**（Boolean、デフォルト: true）
  - 用途: 予約変更時に管理者に通知するかどうか

- **予約キャンセル通知**（Boolean、デフォルト: true）
  - 用途: 予約キャンセル時に管理者に通知するかどうか

- **新規お問い合わせ通知**（Boolean、デフォルト: true）
  - 用途: 新規お問い合わせ受信時に管理者に通知するかどうか

- **通知先メールアドレス**（必須、メール形式、複数可能、カンマ区切り）
  - 用途: 管理者通知の送信先
  - 形式: `admin@example.com,manager@example.com`
  - バリデーション: 各メールアドレスの形式チェック

### 7. その他の設定

- **タイムゾーン**（デフォルト: 'Asia/Tokyo'）
  - 用途: 日時表示のタイムゾーン
  - 形式: IANAタイムゾーン識別子（例: `Asia/Tokyo`、`America/New_York`）

- **言語設定**（将来的に多言語対応、デフォルト: 'ja'）
  - 用途: サイトのデフォルト言語
  - 形式: ISO 639-1言語コード（例: `ja`、`en`）
  - 現時点では日本語のみ対応、将来的に多言語対応

- **メンテナンスモード**（Boolean、デフォルト: false）
  - 用途: サイトをメンテナンスモードにする
  - 動作: 管理者以外のアクセスを制限し、メンテナンスメッセージを表示

- **メンテナンスメッセージ**（オプション、メンテナンスモード時のみ表示）
  - 用途: メンテナンスモード時に表示するメッセージ
  - 形式: プレーンテキストまたはMarkdown（将来的にリッチテキスト対応）

---

## データベース設計の拡張

### Settingsテーブルの拡張

詳細は [`DATABASE_DESIGN.md`](./DATABASE_DESIGN.md) の「Settings（設定）」セクションを参照してください。

#### Prismaスキーマ

```prisma
model Settings {
  id              String   @id @default(uuid())
  
  // サイト基本情報
  siteName        String?  @db.VarChar(100)
  siteDescription String?  @db.VarChar(500)
  faviconUrl      String?
  defaultOgpImageUrl String?
  headerLogoUrl   String?
  footerCopyright String?  @db.VarChar(200)
  
  // 連絡先情報
  phoneNumber     String?
  email           String?
  address         String?  @db.VarChar(200)
  defaultBusinessHours Json? // 曜日別の開始/終了時間
  
  // メール設定
  senderEmail     String?
  senderName      String?  @db.VarChar(100)
  replyToEmail    String?
  // テンプレートID（オプション、キャッシュ用、Resend APIで管理）
  reservationConfirmationTemplateId String?
  reservationCancelledTemplateId    String?
  reservationUpdatedTemplateId      String?
  adminNotificationTemplateId       String?
  
  // SEO設定
  defaultMetaDescription String? @db.VarChar(160)
  defaultMetaKeywords    String?
  defaultOgpTitle        String? @db.VarChar(60)
  defaultOgpDescription String? @db.VarChar(200)
  googleAnalyticsId      String?
  googleSearchConsoleId String?
  
  // 予約設定
  defaultTimeSlot        Int?     @default(60) // 分単位
  minReservationDuration Int?     @default(60) // 分単位
  maxReservationDuration Int?     @default(480) // 分単位
  cancellationPolicy     String?  @db.Text
  sendReservationConfirmationEmail Boolean @default(true)
  sendAdminNotificationEmail      Boolean @default(true)
  
  // 通知設定
  notifyNewReservation      Boolean @default(true)
  notifyReservationChange   Boolean @default(true)
  notifyReservationCancel    Boolean @default(true)
  notifyNewInquiry          Boolean @default(true)
  notificationEmailAddresses String? // カンマ区切りのメールアドレス
  
  // その他の設定
  timezone          String?  @default("Asia/Tokyo")
  language          String?  @default("ja")
  maintenanceMode   Boolean  @default(false)
  maintenanceMessage String? @db.Text
  
  updatedAt         DateTime @updatedAt
  createdAt         DateTime @default(now())
}
```

#### 設計方針

- **型安全性**: 専用フィールドを使用して型安全性を確保
- **シングルトン**: Settingsテーブルは1レコードのみ存在（ID固定または`findFirst`で取得）

---

## 管理画面の実装

### ページ構成

#### `/admin/settings` - 設定画面メインページ

**パス**: `src/app/(admin)/admin/settings/page.tsx`

**レイアウト**: 管理画面共通レイアウト（`src/app/(admin)/admin/layout.tsx`）

**認証**: 管理者のみアクセス可能（Middlewareで保護）

#### タブ構成

1. **基本情報** (`/admin/settings/basic`)
   - サイト名、説明、ロゴ、ファビコン、OGP画像、コピーライト

2. **連絡先情報** (`/admin/settings/contact`)
   - 電話番号、メールアドレス、住所、営業時間

3. **メール設定** (`/admin/settings/email`)
   - 送信元メール、送信者名、返信先
   - メールテンプレート管理（作成・編集・削除・公開）

4. **SEO設定** (`/admin/settings/seo`)
   - メタ情報、OGP設定、Google Analytics

5. **予約設定** (`/admin/settings/reservation`)
   - 時間枠、キャンセルポリシー、通知設定

6. **通知設定** (`/admin/settings/notification`)
   - 各種通知の有効/無効、通知先メールアドレス

7. **その他** (`/admin/settings/other`)
   - タイムゾーン、言語、メンテナンスモード

### UI/UX設計

#### タブナビゲーション

```typescript
// src/components/admin/settings/SettingsTabs.tsx
'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'

const tabs = [
  { id: 'basic', label: '基本情報', href: '/admin/settings/basic' },
  { id: 'contact', label: '連絡先情報', href: '/admin/settings/contact' },
  { id: 'email', label: 'メール設定', href: '/admin/settings/email' },
  { id: 'seo', label: 'SEO設定', href: '/admin/settings/seo' },
  { id: 'reservation', label: '予約設定', href: '/admin/settings/reservation' },
  { id: 'notification', label: '通知設定', href: '/admin/settings/notification' },
  { id: 'other', label: 'その他', href: '/admin/settings/other' },
]

export function SettingsTabs() {
  const pathname = usePathname()
  const activeTab = tabs.find(tab => pathname === tab.href)?.id || 'basic'

  return (
    <div className="border-b">
      <nav className="flex space-x-8">
        {tabs.map(tab => (
          <Link
            key={tab.id}
            href={tab.href}
            className={cn(
              'py-4 px-1 border-b-2 font-medium text-sm',
              activeTab === tab.id
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
```

#### フォームバリデーション

- **リアルタイムバリデーション**: Zodスキーマによるクライアントサイドバリデーション
- **サーバーサイドバリデーション**: Server Action実行時にも再度バリデーション
- **エラーメッセージ**: フィールドごとに日本語のエラーメッセージを表示

#### プレビュー機能

- **ロゴプレビュー**: 画像アップロード時にプレビュー表示
- **ファビコンブレビュー**: ファビコン画像のプレビュー表示
- **OGP画像プレビュー**: OGP画像のプレビュー表示
- **メタ情報プレビュー**: 検索エンジンでの表示プレビュー（将来的に）
- **メールテンプレートプレビュー**: サンプルデータを使用してテンプレートのプレビューを表示

#### 保存機能

- **各タブで個別保存**: 各タブの「保存」ボタンで個別に保存
- **一括保存**: すべてのタブの設定を一度に保存（将来的に）
- **保存確認**: 保存成功時にトースト通知を表示
- **エラーハンドリング**: 保存失敗時にエラーメッセージを表示

---

## Server Actions

### `src/actions/admin/settings.ts`

詳細は [`API.md`](./API.md) の「管理画面 - サイト設定」セクションを参照してください。

#### 設定取得

```typescript
'use server'

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function getSettings() {
  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    throw new Error('Unauthorized')
  }

  // Settingsテーブルは1レコードのみ存在
  let settings = await prisma.settings.findFirst()

  // レコードが存在しない場合はデフォルト値で作成
  if (!settings) {
    settings = await prisma.settings.create({
      data: {
        defaultTimeSlot: 60,
        minReservationDuration: 60,
        maxReservationDuration: 480,
        sendReservationConfirmationEmail: true,
        sendAdminNotificationEmail: true,
        notifyNewReservation: true,
        notifyReservationChange: true,
        notifyReservationCancel: true,
        notifyNewInquiry: true,
        timezone: 'Asia/Tokyo',
        language: 'ja',
        maintenanceMode: false,
      },
    })
  }

  return settings
}
```

#### 設定更新（基本情報）

```typescript
export async function updateBasicSettings(data: {
  siteName?: string
  siteDescription?: string
  faviconUrl?: string
  defaultOgpImageUrl?: string
  headerLogoUrl?: string
  footerCopyright?: string
}): Promise<{ success: boolean; error?: string }> {
  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    throw new Error('Unauthorized')
  }

  try {
    const { basicSettingsSchema } = await import('@/lib/validations/settings')
    const validatedData = basicSettingsSchema.parse(data)

    await prisma.settings.upsert({
      where: { id: (await getSettings()).id },
      update: validatedData,
      create: validatedData,
    })

    revalidatePath('/')
    revalidateTag('site-settings', 'max') // stale-while-revalidate semantics

    return { success: true }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: 'Validation error', details: error.errors }
    }
    console.error('Error updating basic settings:', error)
    return { success: false, error: 'Failed to update settings' }
  }
}
```

#### その他の設定更新関数

同様のパターンで以下の関数を実装：

- `updateContactSettings`
- `updateEmailSettings`
- `updateSeoSettings`
- `updateReservationSettings`
- `updateNotificationSettings`
- `updateOtherSettings`

詳細は [`API.md`](./API.md) を参照してください。

---

## バリデーション

### Zodスキーマ: `src/lib/validations/settings.ts`

```typescript
import { z } from 'zod'

export const basicSettingsSchema = z.object({
  siteName: z.string().min(1).max(100).optional(),
  siteDescription: z.string().min(1).max(500).optional(),
  faviconUrl: z.string().url().optional().nullable(),
  defaultOgpImageUrl: z.string().url().optional().nullable(),
  headerLogoUrl: z.string().url().optional().nullable(),
  footerCopyright: z.string().min(1).max(200).optional().nullable(),
})

export const contactSettingsSchema = z.object({
  phoneNumber: z.string().regex(/^[0-9-+()]+$/).optional().nullable(),
  email: z.string().email().optional().nullable(),
  address: z.string().min(1).max(200).optional().nullable(),
  defaultBusinessHours: z.record(z.object({
    start: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/),
    end: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/),
  })).optional().nullable(),
})

export const emailSettingsSchema = z.object({
  senderEmail: z.string().email().optional(),
  senderName: z.string().min(1).max(100).optional(),
  replyToEmail: z.string().email().optional().nullable(),
  // テンプレートIDはResend APIで管理するため、Settingsテーブルには保存しない（オプションでキャッシュ用に保存可能）
  reservationConfirmationTemplateId: z.string().optional().nullable(),
  reservationCancelledTemplateId: z.string().optional().nullable(),
  reservationUpdatedTemplateId: z.string().optional().nullable(),
  adminNotificationTemplateId: z.string().optional().nullable(),
})

export const seoSettingsSchema = z.object({
  defaultMetaDescription: z.string().min(1).max(160).optional().nullable(),
  defaultMetaKeywords: z.string().optional().nullable(),
  defaultOgpTitle: z.string().min(1).max(60).optional().nullable(),
  defaultOgpDescription: z.string().min(1).max(200).optional().nullable(),
  googleAnalyticsId: z.string().regex(/^G-[A-Z0-9]+$/).optional().nullable(),
  googleSearchConsoleId: z.string().optional().nullable(),
})

export const reservationSettingsSchema = z.object({
  defaultTimeSlot: z.number().int().positive().max(1440).refine(
    (val) => [15, 30, 60].includes(val),
    { message: 'デフォルト時間枠は15分、30分、60分のいずれかである必要があります' }
  ).optional(),
  minReservationDuration: z.number().int().positive().max(1440).optional(),
  maxReservationDuration: z.number().int().positive().max(1440).optional(),
  cancellationPolicy: z.string().optional().nullable(),
  sendReservationConfirmationEmail: z.boolean().optional(),
  sendAdminNotificationEmail: z.boolean().optional(),
}).refine(
  (data) => {
    if (data.minReservationDuration && data.maxReservationDuration) {
      return data.minReservationDuration <= data.maxReservationDuration
    }
    return true
  },
  { message: '最小時間は最大時間以下である必要があります' }
)

export const notificationSettingsSchema = z.object({
  notifyNewReservation: z.boolean().optional(),
  notifyReservationChange: z.boolean().optional(),
  notifyReservationCancel: z.boolean().optional(),
  notifyNewInquiry: z.boolean().optional(),
  notificationEmailAddresses: z.string().refine(
    (val) => {
      if (!val) return true
      const emails = val.split(',').map(e => e.trim())
      return emails.every(email => z.string().email().safeParse(email).success)
    },
    { message: '有効なメールアドレスをカンマ区切りで入力してください' }
  ).optional().nullable(),
})

export const otherSettingsSchema = z.object({
  timezone: z.string().optional(),
  language: z.string().length(2).optional(),
  maintenanceMode: z.boolean().optional(),
  maintenanceMessage: z.string().optional().nullable(),
})
```

---

## キャッシュ無効化

設定更新時は以下のパスとタグを無効化：

```typescript
import { revalidatePath, revalidateTag } from 'next/cache'

// 基本情報、連絡先情報、SEO設定更新時
revalidatePath('/')
revalidatePath('/spaces')
revalidatePath('/blog')
revalidatePath('/news')
revalidateTag('site-settings', 'max') // stale-while-revalidate semantics

// メール設定、予約設定、通知設定更新時
revalidateTag('site-settings', 'max') // stale-while-revalidate semantics

// その他の設定（メンテナンスモード）更新時
revalidatePath('/')
```

詳細は [`CACHING_STRATEGY.md`](./CACHING_STRATEGY.md) を参照してください。

---

## 実装優先順位

### フェーズ1: 基本設定（必須）

1. **サイト基本情報**
   - サイト名、説明、ロゴ、コピーライト
   - ファビコン、デフォルトOGP画像

2. **連絡先情報**
   - 電話番号、メールアドレス、住所
   - デフォルト営業時間

3. **メール設定**
   - 送信元メール、送信者名、返信先
   - メール送信機能との連携

### フェーズ2: SEO・予約設定（重要）

4. **SEO設定**
   - メタ情報、OGP設定
   - Google Analytics統合

5. **予約設定**
   - 時間枠、キャンセルポリシー
   - 予約確認メール、管理者通知の設定

### フェーズ3: 通知・その他（拡張）

6. **通知設定**
   - 各種通知の有効/無効
   - 通知先メールアドレス

7. **その他の設定**
   - タイムゾーン、言語設定
   - メンテナンスモード

---

## メールテンプレート管理

### 機能概要

管理画面のメール設定タブ（`/admin/settings/email`）に「メールテンプレート管理」セクションを追加し、オーナーが開発者の介入なしでメールテンプレートを管理できるようにします。

### UI/UX設計

#### メールテンプレート管理セクション

1. **テンプレート一覧表示**
   - 各メールタイプごとにテンプレートを表示
   - テンプレート名、ステータス（Draft/Published）、最終更新日時を表示
   - テンプレートの作成・編集・削除ボタン

2. **テンプレート編集画面**
   - リッチテキストエディタまたはHTMLエディタでテンプレートの内容を編集
   - テンプレート変数の挿入機能（変数一覧から選択）
   - リアルタイムプレビュー機能（サンプルデータを使用）
   - 保存・公開（Publish）ボタン

3. **テンプレート変数の説明**
   - 使用可能な変数の一覧と説明を表示
   - 変数の型（String, Number, Dateなど）を表示
   - サンプル値を表示

### 実装場所

- **Server Actions**: `src/actions/admin/email-templates.ts`
  - `getEmailTemplates`: Resend APIからテンプレート一覧を取得
  - `getEmailTemplate`: 特定のテンプレートの詳細を取得
  - `createEmailTemplate`: 新しいテンプレートを作成
  - `updateEmailTemplate`: テンプレートの内容を更新
  - `publishEmailTemplate`: テンプレートを公開（Publish）
  - `deleteEmailTemplate`: テンプレートを削除

- **管理画面UI**: `src/app/(admin)/admin/settings/email/page.tsx`
  - メールテンプレート管理セクションの実装
  - テンプレート編集モーダルまたはページ

### Resend APIの使用

#### 必要なAPIエンドポイント

- `GET /templates`: テンプレート一覧取得
- `GET /templates/:id`: テンプレート詳細取得
- `POST /templates`: テンプレート作成
- `PATCH /templates/:id`: テンプレート更新
- `POST /templates/:id/publish`: テンプレート公開
- `DELETE /templates/:id`: テンプレート削除

#### 実装時の注意事項

- Resend APIキーは環境変数から取得（`RESEND_API_KEY`）
- テンプレートの編集はDraft状態で保存され、公開（Publish）が必要
- エラーハンドリングを適切に実装（APIエラーの表示など）
- テンプレート変数のバリデーション（最大20個、予約済み変数名のチェック）

### テンプレートの種類

以下のメールタイプごとにテンプレートを管理：

1. **予約確認メール** (`reservation-confirmation`)
   - テンプレート名: `reservation-confirmation`
   - 使用変数: `RESERVATION_ID`, `SPACE_NAME`, `CUSTOMER_NAME`, `START_TIME`, `END_TIME`, `TOTAL_PRICE`, `SPACE_ADDRESS`, `SPACE_ACCESS`, `SITE_NAME`, `LOGO_URL`

2. **キャンセル通知メール** (`reservation-cancelled`)
   - テンプレート名: `reservation-cancelled`
   - 使用変数: `RESERVATION_ID`, `SPACE_NAME`, `CUSTOMER_NAME`, `START_TIME`, `END_TIME`, `CANCELLATION_DATE`

3. **変更通知メール** (`reservation-updated`)
   - テンプレート名: `reservation-updated`
   - 使用変数: `RESERVATION_ID`, `SPACE_NAME`, `CUSTOMER_NAME`, `OLD_START_TIME`, `OLD_END_TIME`, `NEW_START_TIME`, `NEW_END_TIME`, `CHANGE_REASON`

4. **管理者通知メール** (`admin-notification`)
   - テンプレート名: `admin-notification`
   - 使用変数: `RESERVATION_ID`, `SPACE_NAME`, `CUSTOMER_NAME`, `CUSTOMER_EMAIL`, `START_TIME`, `END_TIME`, `TOTAL_PRICE`, `ADMIN_LINK`

### バリデーション

- テンプレート名: 1-100文字、スネークケース推奨
- テンプレート変数: 最大20個まで、予約済み変数名は使用不可
- HTMLコンテンツ: 有効なHTML形式である必要がある
- 件名: 1-200文字

詳細は [`API.md`](./API.md) の「管理画面 - メールテンプレート管理」セクションを参照してください。

---

## セキュリティ考慮事項

詳細は [`SECURITY.md`](./SECURITY.md) を参照してください。

### 認証・認可

- **すべての設定更新は管理者のみ可能**
- Server Action実行時に認証チェックを実装
- Middlewareで`/admin/settings`へのアクセスを保護

### 入力検証

- **メールアドレスのバリデーション**: 形式チェック、複数メールアドレスの検証
- **URLのバリデーション**: Supabase Storage URLのみ許可（将来的に拡張可能）
- **電話番号のバリデーション**: 電話番号形式の検証
- **営業時間のバリデーション**: 開始時間 < 終了時間の検証

### メンテナンスモード

- **管理者以外のアクセスを制限**: Middlewareでメンテナンスモードをチェック
- **メンテナンスメッセージの表示**: 専用ページまたはレイアウトで表示
- **管理者は常にアクセス可能**: メンテナンスモード時も管理者はアクセス可能

---

## 参考資料

### プロジェクトドキュメント

- [`AGENTS.md`](../AGENTS.md) - プロジェクト全体の仕様書
- [`FEATURE_REQUIREMENTS.md`](./FEATURE_REQUIREMENTS.md) - 機能要件
- [`DATABASE_DESIGN.md`](./DATABASE_DESIGN.md) - データベース設計
- [`API.md`](./API.md) - API仕様
- [`PROJECT_STRUCTURE.md`](./PROJECT_STRUCTURE.md) - プロジェクト構造
- [`EMAIL_REQUIREMENTS.md`](./EMAIL_REQUIREMENTS.md) - メール送信機能要件
- [`SECURITY.md`](./SECURITY.md) - セキュリティポリシー
- [`CACHING_STRATEGY.md`](./CACHING_STRATEGY.md) - キャッシング戦略

### 外部リソース

- [Next.js 16 Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Zod Documentation](https://zod.dev/)
- [Resend Documentation](https://resend.com/docs)

---

## 更新履歴

- **2026-01-06**: メールテンプレート管理機能を追加、Resend APIを使用したテンプレート編集機能を追加
- **2026-01-06**: 初版作成、包括的な設定画面要件定義を追加
