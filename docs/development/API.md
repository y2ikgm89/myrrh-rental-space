# API仕様書

> **Note**: このドキュメントにはServer ActionsとRoute HandlersのAPI仕様が記載されています。技術スタックの詳細については、`[AGENTS.md](../AGENTS.md)`を参照してください。データベース設計については、`[DATABASE_DESIGN.md](./DATABASE_DESIGN.md)`を参照してください。セキュリティポリシーについては、`[SECURITY.md](./SECURITY.md)`を参照してください。キャッシュ戦略の詳細については、`[CACHING_STRATEGY.md](./CACHING_STRATEGY.md)`を参照してください。URLクエリパラメータ管理については、`[NUQS_REQUIREMENTS.md](./NUQS_REQUIREMENTS.md)`を参照してください。

## 実装方針

**後方互換性を考慮しないクリーンな実装**: このプロジェクトは、最新の公式ベストプラクティスに準拠したクリーンでモダンな実装を優先します。古いバージョンや非推奨APIとの後方互換性は維持しません。すべての実装は、フレームワークとライブラリの最新の安定版を使用し、レガシーな回避策なしに公式推奨事項に従う必要があります。

---

## 概要

このシステムでは、Next.js 16 App RouterのServer ActionsとRoute Handlersを使用してAPIを実装しています。

- **Server Actions**: フォーム送信、データ変更操作
- **Route Handlers**: 外部API連携、Webhook受信、ファイルダウンロード

**キャッシュ無効化**: 各APIエンドポイントの「キャッシュ無効化」セクションには、データ変更時に実行する`revalidatePath`と`revalidateTag`の呼び出しが記載されています。詳細なキャッシュ戦略については、`[CACHING_STRATEGY.md](./CACHING_STRATEGY.md)`を参照してください。

---

## Server Actions

### 予約関連

#### `createReservation`

予約を作成します。

**パス**: `src/actions/reservation.ts`

**型定義**:

```typescript
async function createReservation(data: {
  spaceId: string
  customerLastName: string
  customerFirstName: string
  customerEmail: string
  startTime: Date
  endTime: Date
}): Promise<{ success: boolean; reservationId?: string; error?: string }>
```

**リクエスト**:

- `spaceId`: スペースID（必須）
- `customerLastName`: 顧客の姓（必須、1-50文字）
- `customerFirstName`: 顧客の名（必須、1-50文字）
- `customerEmail`: 顧客メールアドレス（必須、有効なメール形式）
- `startTime`: 開始日時（必須、未来の日時）
- `endTime`: 終了日時（必須、startTimeより後）

**レスポンス**:

- `success`: 成功フラグ
- `reservationId`: 作成された予約ID（成功時）
- `error`: エラーメッセージ（失敗時）

**バリデーション**:

- Zodスキーマ: `src/lib/validations/reservation.ts`

**エラーハンドリング**:

- 時間枠の重複チェック
- スペースの存在確認
- 営業時間内かどうかの確認

---

#### `updateReservation`

予約を更新します。

**パス**: `src/actions/reservation.ts`

**型定義**:

```typescript
async function updateReservation(
  id: string,
  data: {
    customerId?: string
    startTime?: Date
    endTime?: Date
    status?: 'pending' | 'confirmed' | 'cancelled'
  }
): Promise<{ success: boolean; error?: string }>
```

**認証**: 管理者のみ

---

#### `deleteReservation`

予約を削除します。

**パス**: `src/actions/reservation.ts`

**型定義**:

```typescript
async function deleteReservation(id: string): Promise<{ success: boolean; error?: string }>
```

**認証**: 管理者のみ

---

### お問い合わせ関連

#### `createInquiry`

お問い合わせを作成します。

**パス**: `src/actions/inquiry.ts`

**型定義**:

```typescript
async function createInquiry(data: {
  name: string
  email: string
  subject: string
  message: string
}): Promise<{ success: boolean; inquiryId?: string; error?: string }>
```

**リクエスト**:

- `name`: お名前（必須、1-100文字）
- `email`: メールアドレス（必須、有効なメール形式）
- `subject`: 件名（必須、1-200文字）
- `message`: メッセージ（必須、1-5000文字）

**バリデーション**:

- Zodスキーマ: `src/lib/validations/inquiry.ts`

---

### 管理画面 - スペース管理

#### `createSpace`

スペースを作成します。

**パス**: `src/actions/admin/spaces.ts`

**型定義**:

```typescript
async function createSpace(data: {
  name: string
  description: string
  address: string
  access?: string
  capacity: number
  area?: number
  hourlyPrice: number
  dailyPrice?: number
  mainImageUrl: string
  imageUrls?: string[]
  facilities?: string[]
  businessHours?: Record<string, { start: string; end: string }>
  isPublished?: boolean
}): Promise<{ success: boolean; spaceId?: string; error?: string }>
```

**認証**: 管理者のみ

**バリデーション**:

- Zodスキーマ: `src/lib/validations/space.ts`
- 必須項目: name, description, address, capacity, hourlyPrice, mainImageUrl
- 数値項目: 0以上の数値
- 営業時間: 開始時間 < 終了時間

---

#### `updateSpace`

スペースを更新します。

**パス**: `src/actions/admin/spaces.ts`

**型定義**:

```typescript
async function updateSpace(
  id: string,
  data: Partial<CreateSpaceData>
): Promise<{ success: boolean; error?: string }>
```

**認証**: 管理者のみ

**キャッシュ無効化**:

- `revalidatePath('/spaces/[id]')`を実行

---

#### `deleteSpace`

スペースを削除します。

**パス**: `src/actions/admin/spaces.ts`

**型定義**:

```typescript
async function deleteSpace(id: string): Promise<{ success: boolean; error?: string }>
```

**認証**: 管理者のみ

**注意**: 関連する予約がある場合は削除できない

---

#### `uploadSpaceImages`

スペースの画像をアップロードします。

**パス**: `src/actions/admin/spaces.ts`

**型定義**:

```typescript
async function uploadSpaceImages(
  files: File[],
  spaceId?: string
): Promise<{ success: boolean; urls?: string[]; error?: string }>
```

**認証**: 管理者のみ

**バリデーション**:

- ファイルサイズ: 最大10MB
- ファイル形式: JPEG, PNG, WebP
- ファイル数: 最大10ファイル

**ストレージ**: Supabase Storage (`spaces`バケット)

---

#### `toggleSpacePublish`

スペースの公開フラグを切り替えます。

**パス**: `src/actions/admin/spaces.ts`

**型定義**:

```typescript
async function toggleSpacePublish(
  id: string,
  isPublished: boolean
): Promise<{ success: boolean; error?: string }>
```

**認証**: 管理者のみ

**キャッシュ無効化**:

- `revalidatePath('/spaces/[id]')`を実行

---

### 管理画面 - ナビゲーション管理

#### `createNavigationItem`

ナビゲーションメニュー項目を作成します。

**パス**: `src/actions/admin/navigation.ts`

**型定義**:

```typescript
async function createNavigationItem(data: {
  type: 'header' | 'footer'
  label: string
  url: string
  isExternal?: boolean
  order: number
  parentId?: string
}): Promise<{ success: boolean; itemId?: string; error?: string }>
```

**認証**: 管理者のみ

**バリデーション**:

- Zodスキーマ: `src/lib/validations/navigation.ts`
- メニュー項目数: ヘッダー最大10項目、フッター最大15項目
- ラベル: 1-100文字
- URL: 有効なURL形式

**キャッシュ無効化**:

- `revalidatePath('/')`を実行

---

#### `updateNavigationItem`

ナビゲーションメニュー項目を更新します。

**パス**: `src/actions/admin/navigation.ts`

**型定義**:

```typescript
async function updateNavigationItem(
  id: string,
  data: Partial<CreateNavigationItemData>
): Promise<{ success: boolean; error?: string }>
```

**認証**: 管理者のみ

**キャッシュ無効化**:

- `revalidatePath('/')`を実行

---

#### `deleteNavigationItem`

ナビゲーションメニュー項目を削除します。

**パス**: `src/actions/admin/navigation.ts`

**型定義**:

```typescript
async function deleteNavigationItem(id: string): Promise<{ success: boolean; error?: string }>
```

**認証**: 管理者のみ

**注意**: サブメニューがある場合は削除できない

**キャッシュ無効化**:

- `revalidatePath('/')`を実行

---

#### `reorderNavigationItems`

ナビゲーションメニュー項目の順序を変更します。

**パス**: `src/actions/admin/navigation.ts`

**型定義**:

```typescript
async function reorderNavigationItems(
  items: Array<{ id: string; order: number }>
): Promise<{ success: boolean; error?: string }>
```

**認証**: 管理者のみ

**キャッシュ無効化**:

- `revalidatePath('/')`を実行

---

#### `createSocialLink`

SNSアイコンを作成します。

**パス**: `src/actions/admin/navigation.ts`

**型定義**:

```typescript
async function createSocialLink(data: {
  platform: 'twitter' | 'facebook' | 'instagram' | 'youtube' | 'line' | 'tiktok' | 'other'
  url: string
  iconUrl?: string
  order: number
}): Promise<{ success: boolean; linkId?: string; error?: string }>
```

**認証**: 管理者のみ

**バリデーション**:

- URL: 必須、有効なURL形式
- iconUrl: platformが'other'の場合必須

**キャッシュ無効化**:

- `revalidatePath('/')`を実行

---

#### `updateSocialLink`

SNSアイコンを更新します。

**パス**: `src/actions/admin/navigation.ts`

**型定義**:

```typescript
async function updateSocialLink(
  id: string,
  data: Partial<CreateSocialLinkData>
): Promise<{ success: boolean; error?: string }>
```

**認証**: 管理者のみ

**キャッシュ無効化**:

- `revalidatePath('/')`を実行

---

#### `deleteSocialLink`

SNSアイコンを削除します。

**パス**: `src/actions/admin/navigation.ts`

**型定義**:

```typescript
async function deleteSocialLink(id: string): Promise<{ success: boolean; error?: string }>
```

**認証**: 管理者のみ

**キャッシュ無効化**:

- `revalidatePath('/')`を実行

---

#### `updateSiteSettings`

**非推奨**: この関数は削除されました。代わりに`updateBasicSettings`、`updateContactSettings`などの専用関数を使用してください。

**パス**: `src/actions/admin/navigation.ts`

**型定義**:

```typescript
async function updateSiteSettings(data: {
  headerLogoUrl?: string
  footerCopyright?: string
}): Promise<{ success: boolean; error?: string }>
```

**認証**: 管理者のみ

**キャッシュ無効化**:

- `revalidatePath('/')`を実行

---

### 管理画面 - サイト設定

詳細は `[SETTINGS_REQUIREMENTS.md](./SETTINGS_REQUIREMENTS.md)` を参照してください。

#### `getSettings`

サイト設定を取得します。

**パス**: `src/actions/admin/settings.ts`

**型定義**:

```typescript
async function getSettings(): Promise<Settings>
```

**認証**: 管理者のみ

**動作**:

- Settingsテーブルから1レコードを取得（シングルトン）
- レコードが存在しない場合はデフォルト値で作成

---

#### `updateBasicSettings`

サイト基本情報を更新します。

**パス**: `src/actions/admin/settings.ts`

**型定義**:

```typescript
async function updateBasicSettings(data: {
  siteName?: string
  siteDescription?: string
  faviconUrl?: string
  defaultOgpImageUrl?: string
  headerLogoUrl?: string
  footerCopyright?: string
}): Promise<{ success: boolean; error?: string }>
```

**認証**: 管理者のみ

**バリデーション**:

- Zodスキーマ: `src/lib/validations/settings.ts`の`basicSettingsSchema`

**キャッシュ無効化**:

- `revalidatePath('/')`を実行
- `revalidateTag('site-settings', 'max')`を実行（stale-while-revalidate semantics）

---

#### `updateContactSettings`

連絡先情報を更新します。

**パス**: `src/actions/admin/settings.ts`

**型定義**:

```typescript
async function updateContactSettings(data: {
  phoneNumber?: string
  email?: string
  address?: string
  defaultBusinessHours?: Record<string, { start: string; end: string }>
}): Promise<{ success: boolean; error?: string }>
```

**認証**: 管理者のみ

**バリデーション**:

- Zodスキーマ: `src/lib/validations/settings.ts`の`contactSettingsSchema`
- 電話番号形式チェック
- メールアドレス形式チェック
- 営業時間の妥当性チェック（開始時間 < 終了時間）

**キャッシュ無効化**:

- `revalidatePath('/')`を実行
- `revalidateTag('site-settings', 'max')`を実行（stale-while-revalidate semantics）

---

#### `updateEmailSettings`

メール設定を更新します。

**パス**: `src/actions/admin/settings.ts`

**型定義**:

```typescript
async function updateEmailSettings(data: {
  senderEmail?: string
  senderName?: string
  replyToEmail?: string
}): Promise<{ success: boolean; error?: string }>
```

**認証**: 管理者のみ

**バリデーション**:

- Zodスキーマ: `src/lib/validations/settings.ts`の`emailSettingsSchema`
- メールアドレス形式チェック

**キャッシュ無効化**:

- `revalidateTag('site-settings', 'max')`を実行（stale-while-revalidate semantics）

---

#### `updateSeoSettings`

SEO設定を更新します。

**パス**: `src/actions/admin/settings.ts`

**型定義**:

```typescript
async function updateSeoSettings(data: {
  defaultMetaDescription?: string
  defaultMetaKeywords?: string
  defaultOgpTitle?: string
  defaultOgpDescription?: string
  googleAnalyticsId?: string
  googleSearchConsoleId?: string
}): Promise<{ success: boolean; error?: string }>
```

**認証**: 管理者のみ

**バリデーション**:

- Zodスキーマ: `src/lib/validations/settings.ts`の`seoSettingsSchema`
- Google Analytics ID形式チェック（G-XXXXXXXXXX形式）

**キャッシュ無効化**:

- `revalidatePath('/')`を実行
- `revalidatePath('/spaces')`を実行
- `revalidatePath('/blog')`を実行
- `revalidatePath('/news')`を実行
- `revalidateTag('site-settings')`を実行

---

#### `updateReservationSettings`

予約設定を更新します。

**パス**: `src/actions/admin/settings.ts`

**型定義**:

```typescript
async function updateReservationSettings(data: {
  defaultTimeSlot?: number
  minReservationDuration?: number
  maxReservationDuration?: number
  cancellationPolicy?: string
  sendReservationConfirmationEmail?: boolean
  sendAdminNotificationEmail?: boolean
}): Promise<{ success: boolean; error?: string }>
```

**認証**: 管理者のみ

**バリデーション**:

- Zodスキーマ: `src/lib/validations/settings.ts`の`reservationSettingsSchema`
- デフォルト時間枠: 15分、30分、60分のいずれか
- 最小時間 <= 最大時間

**キャッシュ無効化**:

- `revalidateTag('site-settings', 'max')`を実行（stale-while-revalidate semantics）

---

#### `updateNotificationSettings`

通知設定を更新します。

**パス**: `src/actions/admin/settings.ts`

**型定義**:

```typescript
async function updateNotificationSettings(data: {
  notifyNewReservation?: boolean
  notifyReservationChange?: boolean
  notifyReservationCancel?: boolean
  notifyNewInquiry?: boolean
  notificationEmailAddresses?: string
}): Promise<{ success: boolean; error?: string }>
```

**認証**: 管理者のみ

**バリデーション**:

- Zodスキーマ: `src/lib/validations/settings.ts`の`notificationSettingsSchema`
- 通知先メールアドレス: カンマ区切りの複数メールアドレスの形式チェック

**キャッシュ無効化**:

- `revalidateTag('site-settings', 'max')`を実行（stale-while-revalidate semantics）

---

#### `updateOtherSettings`

その他の設定を更新します。

**パス**: `src/actions/admin/settings.ts`

**型定義**:

```typescript
async function updateOtherSettings(data: {
  timezone?: string
  language?: string
  maintenanceMode?: boolean
  maintenanceMessage?: string
}): Promise<{ success: boolean; error?: string }>
```

**認証**: 管理者のみ

**バリデーション**:

- Zodスキーマ: `src/lib/validations/settings.ts`の`otherSettingsSchema`
- タイムゾーン: IANAタイムゾーン識別子
- 言語: ISO 639-1言語コード（2文字）

**キャッシュ無効化**:

- メンテナンスモード変更時: `revalidatePath('/')`を実行
- その他: `revalidateTag('site-settings', 'max')`を実行（stale-while-revalidate semantics）

**メンテナンスモード**:

- `maintenanceMode`が`true`の場合、管理者以外のアクセスを制限
- Middlewareでメンテナンスモードをチェックし、専用ページを表示

---

### 管理画面 - メールテンプレート管理

詳細は `[SETTINGS_REQUIREMENTS.md](./SETTINGS_REQUIREMENTS.md)` の「メールテンプレート管理」セクションを参照してください。

#### `getEmailTemplates`

Resend APIからメールテンプレート一覧を取得します。

**パス**: `src/actions/admin/email-templates.ts`

**型定義**:

```typescript
async function getEmailTemplates(): Promise<{
  success: boolean
  templates?: Array<{
    id: string
    name: string
    createdAt: string
    updatedAt: string
    published: boolean
  }>
  error?: string
}>
```

**認証**: 管理者のみ

**動作**:

- Resend API (`GET /templates`) を呼び出してテンプレート一覧を取得
- エラー時はエラーメッセージを返す

---

#### `getEmailTemplate`

特定のメールテンプレートの詳細を取得します。

**パス**: `src/actions/admin/email-templates.ts`

**型定義**:

```typescript
async function getEmailTemplate(templateId: string): Promise<{
  success: boolean
  template?: {
    id: string
    name: string
    html: string
    subject: string
    variables: Array<{
      key: string
      type: 'string' | 'number' | 'date'
      fallbackValue?: string
    }>
    published: boolean
    createdAt: string
    updatedAt: string
  }
  error?: string
}>
```

**認証**: 管理者のみ

**動作**:

- Resend API (`GET /templates/:id`) を呼び出してテンプレート詳細を取得
- エラー時はエラーメッセージを返す

---

#### `createEmailTemplate`

新しいメールテンプレートを作成します。

**パス**: `src/actions/admin/email-templates.ts`

**型定義**:

```typescript
async function createEmailTemplate(data: {
  name: string
  subject: string
  html: string
  variables?: Array<{
    key: string
    type: 'string' | 'number' | 'date'
    fallbackValue?: string
  }>
}): Promise<{
  success: boolean
  templateId?: string
  error?: string
}>
```

**認証**: 管理者のみ

**バリデーション**:

- テンプレート名: 1-100文字、スネークケース推奨
- 件名: 1-200文字
- HTMLコンテンツ: 有効なHTML形式
- テンプレート変数: 最大20個まで、予約済み変数名は使用不可

**動作**:

- Resend API (`POST /templates`) を呼び出してテンプレートを作成
- 作成されたテンプレートIDを返す
- エラー時はエラーメッセージを返す

---

#### `updateEmailTemplate`

メールテンプレートの内容を更新します。

**パス**: `src/actions/admin/email-templates.ts`

**型定義**:

```typescript
async function updateEmailTemplate(
  templateId: string,
  data: {
    name?: string
    subject?: string
    html?: string
    variables?: Array<{
      key: string
      type: 'string' | 'number' | 'date'
      fallbackValue?: string
    }>
  }
): Promise<{
  success: boolean
  error?: string
}>
```

**認証**: 管理者のみ

**バリデーション**:

- テンプレート名: 1-100文字（更新時）
- 件名: 1-200文字（更新時）
- HTMLコンテンツ: 有効なHTML形式（更新時）
- テンプレート変数: 最大20個まで、予約済み変数名は使用不可（更新時）

**動作**:

- Resend API (`PATCH /templates/:id`) を呼び出してテンプレートを更新
- 更新はDraft状態で保存される（公開には`publishEmailTemplate`が必要）
- エラー時はエラーメッセージを返す

---

#### `publishEmailTemplate`

メールテンプレートを公開（Publish）して使用可能にします。

**パス**: `src/actions/admin/email-templates.ts`

**型定義**:

```typescript
async function publishEmailTemplate(templateId: string): Promise<{
  success: boolean
  error?: string
}>
```

**認証**: 管理者のみ

**動作**:

- Resend API (`POST /templates/:id/publish`) を呼び出してテンプレートを公開
- 公開後、テンプレートIDを使用してメール送信が可能になる
- エラー時はエラーメッセージを返す

---

#### `deleteEmailTemplate`

メールテンプレートを削除します。

**パス**: `src/actions/admin/email-templates.ts`

**型定義**:

```typescript
async function deleteEmailTemplate(templateId: string): Promise<{
  success: boolean
  error?: string
}>
```

**認証**: 管理者のみ

**動作**:

- Resend API (`DELETE /templates/:id`) を呼び出してテンプレートを削除
- 削除後、テンプレートIDを使用したメール送信は失敗する
- エラー時はエラーメッセージを返す

---

### 管理画面 - ページ管理

公開ページ（ブログ・お知らせを除く）のコンテンツを管理します。

#### `getPages`

ページ一覧を取得します。

**パス**: `src/actions/admin/pages.ts`

**型定義**:

```typescript
async function getPages(): Promise<Page[]>
```

**認証**: 管理者のみ

**動作**:

- すべてのページを取得
- `isActive`が`true`のページのみ取得（オプション）

---

#### `getPageBySlug`

スラッグでページを取得します。

**パス**: `src/actions/admin/pages.ts`

**型定義**:

```typescript
async function getPageBySlug(slug: string): Promise<Page | null>
```

**認証**: 公開ページでは認証不要、管理画面では管理者のみ

**動作**:

- スラッグでページを検索
- 公開ページでは`isPublished`が`true`かつ`isActive`が`true`のページのみ返却

---

#### `createPage`

新規ページを作成します。

**パス**: `src/actions/admin/pages.ts`

**型定義**:

```typescript
async function createPage(data: {
  slug: string
  title: string
  description?: string
  content: string
  metaDescription?: string
  metaKeywords?: string
  ogpTitle?: string
  ogpDescription?: string
  ogpImageUrl?: string
  isPublished?: boolean
}): Promise<{ success: boolean; pageId?: string; error?: string }>
```

**認証**: 管理者のみ

**バリデーション**:

- Zodスキーマ: `src/lib/validations/page.ts`の`pageSchema`
- スラッグ形式チェック（英小文字、数字、ハイフンのみ）
- スラッグ重複チェック
- 予約済みスラッグの保護（`admin`, `api`など）
- HTMLコンテンツのサニタイゼーション（XSS対策）

**キャッシュ無効化**:

- `revalidatePath('/[slug]')`を実行（スラッグに基づく）

---

#### `updatePage`

ページを更新します。

**パス**: `src/actions/admin/pages.ts`

**型定義**:

```typescript
async function updatePage(
  slug: string,
  data: Partial<CreatePageData>
): Promise<{ success: boolean; error?: string }>
```

**認証**: 管理者のみ

**バリデーション**:

- Zodスキーマ: `src/lib/validations/page.ts`の`pageSchema`
- HTMLコンテンツのサニタイゼーション（XSS対策）

**キャッシュ無効化**:

- `revalidatePath('/[slug]')`を実行（スラッグに基づく）

---

#### `deletePage`

ページを削除します。

**パス**: `src/actions/admin/pages.ts`

**型定義**:

```typescript
async function deletePage(slug: string): Promise<{ success: boolean; error?: string }>
```

**認証**: 管理者のみ

**注意**: 既存ページのスラッグ（`home`, `reservation`, `spaces`, `contact`, `privacy`, `terms`）は削除不可

**キャッシュ無効化**:

- `revalidatePath('/[slug]')`を実行（スラッグに基づく）

---

#### `togglePagePublish`

ページの公開フラグを切り替えます。

**パス**: `src/actions/admin/pages.ts`

**型定義**:

```typescript
async function togglePagePublish(
  slug: string,
  isPublished: boolean
): Promise<{ success: boolean; error?: string }>
```

**認証**: 管理者のみ

**キャッシュ無効化**:

- `revalidatePath('/[slug]')`を実行（スラッグに基づく）

---

### 管理画面 - 顧客管理

予約した顧客のプロフィールを一元管理します。

#### `getCustomerById`

顧客IDで顧客を取得します。

**パス**: `src/actions/admin/customers.ts`

**型定義**:

```typescript
async function getCustomerById(id: string): Promise<Customer | null>
```

**認証**: 管理者のみ

**動作**:

- 顧客IDで顧客を検索
- 関連する予約履歴も取得（`include`でN+1問題を回避）

---

#### `getCustomerByEmail`

メールアドレスで顧客を取得します。

**パス**: `src/actions/admin/customers.ts`

**型定義**:

```typescript
async function getCustomerByEmail(email: string): Promise<Customer | null>
```

**認証**: 管理者のみ（予約作成時は認証不要）

**動作**:

- メールアドレスで顧客を検索
- 予約作成時の自動顧客作成で使用

---

#### `createCustomer`

新規顧客を作成します。

**パス**: `src/actions/admin/customers.ts`

**型定義**:

```typescript
async function createCustomer(data: {
  lastName: string
  firstName: string
  email: string
  phoneNumber?: string
  address?: string
  status?: CustomerStatus
}): Promise<{ success: boolean; customerId?: string; error?: string }>
```

**認証**: 管理者のみ（予約作成時は認証不要）

**バリデーション**:

- Zodスキーマ: `src/lib/validations/customer.ts`の`customerSchema`
- メールアドレスの形式チェック、重複チェック

**エラーハンドリング**:

- Prismaエラー（一意制約違反など）を適切に処理

**キャッシュ無効化**:

- `revalidatePath('/admin/customers')`を実行
- `revalidateTag('customers', 'max')`を実行（stale-while-revalidate semantics）

---

#### `updateCustomer`

顧客情報を更新します。

**パス**: `src/actions/admin/customers.ts`

**型定義**:

```typescript
async function updateCustomer(
  id: string,
  data: {
    lastName?: string
    firstName?: string
    phoneNumber?: string
    address?: string
    status?: CustomerStatus
    notes?: string
    isActive?: boolean
  }
): Promise<{ success: boolean; error?: string }>
```

**認証**: 管理者のみ

**バリデーション**:

- Zodスキーマ: `src/lib/validations/customer.ts`の`customerUpdateSchema`
- メールアドレスは更新不可（一意制約のため）

**エラーハンドリング**:

- Zodバリデーションエラー
- Prismaエラー

**キャッシュ無効化**:

- `revalidatePath('/admin/customers')`を実行
- `revalidatePath(`/admin/customers/${id}`)`を実行
- `revalidateTag('customers', 'max')`を実行（stale-while-revalidate semantics）

---

#### `deleteCustomer`

顧客を削除します（論理削除）。

**パス**: `src/actions/admin/customers.ts`

**型定義**:

```typescript
async function deleteCustomer(id: string): Promise<{ success: boolean; error?: string }>
```

**認証**: 管理者のみ

**動作**:

- 論理削除（`isActive = false`）を推奨
- 関連する予約が存在する場合は削除不可（または`onDelete: SetNull`で処理）

**キャッシュ無効化**:

- `revalidatePath('/admin/customers')`を実行
- `revalidateTag('customers', 'max')`を実行（stale-while-revalidate semantics）

---

#### `getCustomerReservations`

顧客の予約履歴を取得します。

**パス**: `src/actions/admin/customers.ts`

**型定義**:

```typescript
async function getCustomerReservations(
  customerId: string,
  params?: {
    page?: number
    pageSize?: number
  }
): Promise<{ reservations: Reservation[]; total: number }>
```

**認証**: 管理者のみ

**Prisma最適化**:

- `include`でスペース情報も一度に取得（N+1問題を回避）
- `select`で必要なフィールドのみ取得
- `Promise.all`でカウントとデータ取得を並列実行

---

#### `recalculateCustomerStats`

顧客の統計情報を再計算します。

**パス**: `src/actions/admin/customers.ts`

**型定義**:

```typescript
async function recalculateCustomerStats(
  customerId: string
): Promise<{ success: boolean; error?: string }>
```

**認証**: 管理者のみ

**動作**:

- トランザクション内で統計情報を計算
- `Promise.all`で予約情報を並列取得
- 総予約回数、総利用金額、初回/最終予約日時を更新

**Prisma最適化**:

- トランザクション（`prisma.$transaction`）を使用
- `Promise.all`で並列取得
- `select`で必要なフィールドのみ取得

**キャッシュ無効化**:

- `revalidatePath(`/admin/customers/${customerId}`)`を実行

---

### 予約作成時の自動顧客管理

`createReservation` Server Actionを拡張して、予約作成時に自動的に顧客を管理します。

**パス**: `src/actions/reservation.ts`

**改善点**:

- `upsert`を使用して顧客作成・更新を効率化
- トランザクションで予約作成と顧客管理を実行
- 統計情報の自動更新をトランザクション内で実行

**実装例**:

```typescript
export async function createReservation(data: {
  spaceId: string
  customerLastName: string
  customerFirstName: string
  customerEmail: string
  startTime: Date
  endTime: Date
}): Promise<{ success: boolean; reservationId?: string; error?: string }> {
  // トランザクションで予約作成と顧客管理を実行
  const result = await prisma.$transaction(async (tx) => {
    // 1. 顧客をupsert（存在すれば更新、存在しなければ作成）
    const customer = await tx.customer.upsert({
      where: { email: data.customerEmail },
      update: {
        lastName: data.customerLastName,
        firstName: data.customerFirstName,
        lastReservationAt: data.startTime,
      },
      create: {
        lastName: data.customerLastName,
        firstName: data.customerFirstName,
        email: data.customerEmail,
        status: 'NEW',
        firstReservationAt: data.startTime,
        lastReservationAt: data.startTime,
        totalReservations: 0,
        totalSpent: new Decimal(0),
      },
    })

    // 2. 予約を作成（customerIdを設定）
    const reservation = await tx.reservation.create({
      data: {
        spaceId: data.spaceId,
        customerId: customer.id,
        startTime: data.startTime,
        endTime: data.endTime,
        status: 'pending',
        // totalPriceは計算が必要
      },
      include: {
        space: {
          select: {
            hourlyPrice: true,
          },
        },
      },
    })

    // 3. 料金を計算
    const duration = (data.endTime.getTime() - data.startTime.getTime()) / (1000 * 60) // 分単位
    const totalPrice = reservation.space.hourlyPrice.mul(duration / 60)

    // 4. 予約の料金を更新
    await tx.reservation.update({
      where: { id: reservation.id },
      data: { totalPrice },
    })

    // 5. 顧客の統計情報を更新
    await tx.customer.update({
      where: { id: customer.id },
      data: {
        totalReservations: { increment: 1 },
        totalSpent: { increment: totalPrice },
        lastReservationAt: data.startTime,
        firstReservationAt: customer.firstReservationAt || data.startTime,
      },
    })

    return { customer, reservation }
  })

  return { success: true, reservationId: result.reservation.id }
}
```

**Prisma最適化**:

- `upsert`で顧客作成・更新を効率化
- トランザクションで複数操作を保証
- `increment`で統計情報を効率的に更新

---

## Route Handlers

### 認証関連

#### `POST /api/auth/[...nextauth]`

Auth.jsの認証エンドポイント。

**パス**: `src/app/api/auth/[...nextauth]/route.ts`

**実装**: Auth.js 5の標準実装

**機能**:

- ログイン
- ログアウト
- セッション管理
- OAuth認証（必要に応じて）

---

### Bot対策

#### `POST /api/turnstile/verify`

Cloudflare Turnstile検証エンドポイント。

**パス**: `src/app/api/turnstile/verify/route.ts`

**型定義**:

```typescript
async function POST(request: NextRequest): Promise<NextResponse<{
  success: boolean
  error?: string
  errorCode?: string
}>>
```

**リクエスト**:

```json
{
  "token": "string" // Turnstileトークン（cf-turnstile-response）
}
```

**レスポンス**:

```json
{
  "success": true
}
```

または

```json
{
  "success": false,
  "error": "Turnstile verification failed",
  "errorCode": "invalid-input-response"
}
```

**エラーハンドリング**:

- トークンが提供されていない場合: `400 Bad Request`
- Turnstile検証失敗時: `200 OK`（success: false）
- サーバーエラー時: `500 Internal Server Error`

**詳細**: `[TURNSTILE_REQUIREMENTS.md](./TURNSTILE_REQUIREMENTS.md)`を参照してください。

---

### 外部API連携

#### `POST /api/webhooks/supabase`

Supabase Webhook受信エンドポイント。

**パス**: `src/app/api/webhooks/supabase/route.ts`

**用途**: Supabaseからのイベント通知を受信

**認証**: Webhookシークレット検証

---

### ファイルダウンロード

#### `GET /api/files/[id]`

ファイルダウンロードエンドポイント。

**パス**: `src/app/api/files/[id]/route.ts`

**用途**: 認証が必要なファイルのダウンロード

**認証**: 管理者のみ

---

## エラーハンドリング

**重要**: すべてのServer ActionsとAPI Routesは、以下の統一されたエラーハンドリング形式を使用します。

**公式準拠**: この形式はNext.js公式ドキュメントの推奨パターンに準拠しています：

- 予期されるエラー（バリデーションエラーなど）はエラーメッセージを返す（throwしない）
- 予期しないエラーはthrowしてError Boundaryでキャッチ
- `useActionState`フックとの互換性を確保

### Server Actionsのエラーレスポンス形式

Server Actionsでは判別可能なユニオン型を使用して型安全性を確保します。

```typescript
// 成功レスポンス
{
  success: true
  data: T
}

// エラーレスポンス
{
  success: false
  error: string
  code?: string
  details?: unknown
}
```

**実装例**:

```typescript
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string; details?: unknown }

export async function createSpace(
  data: CreateSpaceInput
): Promise<Result<Space>> {
  try {
    const validatedData = createSpaceSchema.parse(data)
    const space = await prisma.space.create({ data: validatedData })
    return { success: true, data: space }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: error.errors,
      }
    }
    // ... その他のエラーハンドリング
  }
}
```

### API Routesのエラーレスポンス形式

API RoutesではHTTPステータスコードと組み合わせてエラーを返します。

```typescript
// 成功レスポンス（200, 201など）
{
  data: T
}

// エラーレスポンス（400, 401, 403, 404, 500など）
{
  error: string
  code?: string
  details?: unknown
}
```

**実装例**:

```typescript
try {
  const validatedData = reservationSchema.parse(body)
  const reservation = await prisma.reservation.create({ data: validatedData })
  return NextResponse.json({ data: reservation }, { status: 201 })
} catch (error) {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        error: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: error.errors,
      },
      { status: 400 }
    )
  }
  return NextResponse.json(
    {
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    },
    { status: 500 }
  )
}
```

### エラーコード

以下のエラーコードを標準として使用します：

- `VALIDATION_ERROR`: バリデーションエラー（Zodエラー、Turnstile検証失敗など）
- `AUTHENTICATION_ERROR`: 認証エラー（未ログインなど）
- `AUTHORIZATION_ERROR`: 認可エラー（権限不足など）
- `NOT_FOUND`: リソースが見つからない
- `CONFLICT`: リソースの競合（例: 時間枠の重複、重複エントリ）
- `RATE_LIMIT_EXCEEDED`: レート制限超過
- `INTERNAL_ERROR`: サーバー内部エラー（予期しないエラー）

**Prismaエラーのマッピング**:

- `P2002` (Unique constraint violation) → `CONFLICT`
- `P2025` (Record not found) → `NOT_FOUND`

**Turnstileエラーのマッピング**:

Turnstile検証関数（`verifyTurnstileToken`）はTurnstile固有のエラーコード（例: `invalid-input-response`）を`code`に返しますが、Server ActionsやAPI Routesで使用する際は、プロジェクト標準エラーコード（`VALIDATION_ERROR`）にマッピングし、Turnstile固有のエラーコードは`details.turnstileCode`に保持します：

```typescript
const turnstileResult = await verifyTurnstileToken(token)
if (!turnstileResult.success) {
  return {
    success: false,
    error: turnstileResult.error || 'Turnstile verification failed',
    code: 'VALIDATION_ERROR', // プロジェクト標準エラーコード
    details: {
      turnstileCode: turnstileResult.code, // Turnstile固有のエラーコードを保持
    },
  }
}
```

---

## バリデーション

すべてのServer ActionsはZodスキーマでバリデーションを行います。

**バリデーションスキーマの場所**:

- `src/lib/validations/reservation.ts`
- `src/lib/validations/inquiry.ts`
- `src/lib/validations/space.ts`
- `src/lib/validations/navigation.ts`

**バリデーションタイミング**:

1. クライアントサイド（フォーム送信前）
2. サーバーサイド（Server Action実行時）

---

## 認証・認可

### 認証チェック

すべての管理画面用Server Actionsは認証チェックを実装します。

```typescript
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export async function createSpace(data: CreateSpaceData) {
  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    redirect('/login')
  }
  // ... 実装
}
```

**注意**: Auth.js 5では`auth()`メソッドを使用します。`getServerSession`は非推奨です。

### 認可チェック

ロールベースのアクセス制御を実装します。

- `admin`: すべての操作が可能
- `user`: 予約作成、お問い合わせ送信のみ

---

## キャッシュ無効化

データ更新時は、関連するページのキャッシュを無効化します。詳細は `[CACHING_STRATEGY.md](./CACHING_STRATEGY.md)` を参照してください。

### パスベースの無効化

```typescript
import { revalidatePath } from 'next/cache'

// スペース更新時
revalidatePath('/spaces')
revalidatePath('/spaces/[id]')
revalidatePath('/') // ホームページにも表示される場合

// ナビゲーション更新時
revalidatePath('/')

// ブログ記事更新時
revalidatePath('/blog')
revalidatePath('/blog/[slug]')
```

### タグベースの無効化

```typescript
import { revalidateTag } from 'next/cache'

// タグに関連するすべてのキャッシュを無効化（stale-while-revalidate semantics）
revalidateTag('spaces-list', 'max')
revalidateTag('blog-posts-list', 'max')
```

### その他の無効化方法

```typescript
import { updateTag, refresh } from 'next/cache'

// タグのタイムスタンプを更新（より細かい制御）
updateTag('spaces-list')

// 現在のページのキャッシュを更新
refresh()
```

---

## ブログ関連

### ブログ記事関連

#### `createBlogPost`

ブログ記事を作成します。

**パス**: `src/actions/admin/blog.ts`

**型定義**:

```typescript
async function createBlogPost(data: {
  title: string
  slug: string
  excerpt: string
  content: string
  thumbnailUrl: string
  ogpImageUrl?: string
  categoryId: string
  tags?: string[]
  metaDescription?: string
  metaKeywords?: string
  ogpTitle?: string
  ogpDescription?: string
  publishedAt?: Date
  isPublished: boolean
  isDraft: boolean
}): Promise<{ success: boolean; blogPostId?: string; error?: string }>
```

**リクエスト**:

- `title`: タイトル（必須、1-200文字）
- `slug`: スラッグ（必須、英数字・ハイフン・アンダースコアのみ、ユニーク）
- `excerpt`: 概要（必須、1-500文字）
- `content`: 本文（必須、HTML形式）
- `thumbnailUrl`: サムネイル画像URL（必須、Supabase Storage URL）
- `ogpImageUrl`: OGP画像URL（オプション、Supabase Storage URL）
- `categoryId`: カテゴリID（必須）
- `tags`: タグID配列（オプション）
- `metaDescription`: メタディスクリプション（オプション、1-160文字）
- `metaKeywords`: メタキーワード（オプション、カンマ区切り）
- `ogpTitle`: OGPタイトル（オプション、1-60文字）
- `ogpDescription`: OGP説明（オプション、1-200文字）
- `publishedAt`: 公開日時（オプション、未来日時可能）
- `isPublished`: 公開フラグ（必須）
- `isDraft`: 下書きフラグ（必須）

**認証**: 管理者のみ

**バリデーション**:

- Zodスキーマ: `src/lib/validations/blog.ts`

**エラーハンドリング**:

- スラッグの重複チェック
- カテゴリの存在確認
- 画像URLの検証（Supabase Storage URLのみ許可）

---

#### `updateBlogPost`

ブログ記事を更新します。

**パス**: `src/actions/admin/blog.ts`

**型定義**:

```typescript
async function updateBlogPost(
  id: string,
  data: {
    title?: string
    slug?: string
    excerpt?: string
    content?: string
    thumbnailUrl?: string
    ogpImageUrl?: string
    categoryId?: string
    tags?: string[]
    metaDescription?: string
    metaKeywords?: string
    ogpTitle?: string
    ogpDescription?: string
    publishedAt?: Date
    isPublished?: boolean
    isDraft?: boolean
  }
): Promise<{ success: boolean; error?: string }>
```

**認証**: 管理者のみ（著者のみ編集可能、または管理者はすべて編集可能）

---

#### `deleteBlogPost`

ブログ記事を削除します。

**パス**: `src/actions/admin/blog.ts`

**型定義**:

```typescript
async function deleteBlogPost(id: string): Promise<{ success: boolean; error?: string }>
```

**認証**: 管理者のみ

---

#### `getBlogPost`

ブログ記事を取得します。

**パス**: `src/actions/admin/blog.ts`（管理画面用）、`src/app/blog/[slug]/page.tsx`（公開ページ用）

**型定義**:

```typescript
async function getBlogPost(slug: string): Promise<BlogPost | null>
```

**認証**: 公開ページは認証不要、管理画面は管理者のみ

---

#### `getBlogPosts`

ブログ記事一覧を取得します。

**パス**: `src/actions/admin/blog.ts`（管理画面用）、`src/app/blog/page.tsx`（公開ページ用）

**型定義**:

```typescript
async function getBlogPosts(params?: {
  page?: number
  limit?: number
  categoryId?: string
  tagId?: string
  search?: string
  isPublished?: boolean
}): Promise<{ posts: BlogPost[]; total: number; totalPages: number }>
```

**認証**: 公開ページは認証不要、管理画面は管理者のみ

---

#### `incrementViewCount`

ブログ記事の閲覧数をカウントします。

**パス**: `src/actions/blog.ts`

**型定義**:

```typescript
async function incrementViewCount(slug: string): Promise<{ success: boolean; error?: string }>
```

**認証**: 認証不要（公開API）

---

### ブログカテゴリ関連

#### `createBlogCategory`

ブログカテゴリを作成します。

**パス**: `src/actions/admin/blog.ts`

**型定義**:

```typescript
async function createBlogCategory(data: {
  name: string
  slug: string
  description?: string
  order?: number
}): Promise<{ success: boolean; categoryId?: string; error?: string }>
```

**リクエスト**:

- `name`: カテゴリ名（必須、1-50文字、ユニーク）
- `slug`: スラッグ（必須、英数字・ハイフン・アンダースコアのみ、ユニーク）
- `description`: 説明（オプション、1-500文字）
- `order`: 表示順序（オプション、Int）

**認証**: 管理者のみ

---

#### `updateBlogCategory`

ブログカテゴリを更新します。

**パス**: `src/actions/admin/blog.ts`

**型定義**:

```typescript
async function updateBlogCategory(
  id: string,
  data: {
    name?: string
    slug?: string
    description?: string
    order?: number
  }
): Promise<{ success: boolean; error?: string }>
```

**認証**: 管理者のみ

---

#### `deleteBlogCategory`

ブログカテゴリを削除します。

**パス**: `src/actions/admin/blog.ts`

**型定義**:

```typescript
async function deleteBlogCategory(id: string): Promise<{ success: boolean; error?: string }>
```

**認証**: 管理者のみ

**エラーハンドリング**:

- 記事が紐づいている場合は削除不可

---

### ブログタグ関連

#### `createBlogTag`

ブログタグを作成します。

**パス**: `src/actions/admin/blog.ts`

**型定義**:

```typescript
async function createBlogTag(data: {
  name: string
  slug: string
}): Promise<{ success: boolean; tagId?: string; error?: string }>
```

**リクエスト**:

- `name`: タグ名（必須、1-30文字、ユニーク）
- `slug`: スラッグ（必須、英数字・ハイフン・アンダースコアのみ、ユニーク）

**認証**: 管理者のみ

---

#### `updateBlogTag`

ブログタグを更新します。

**パス**: `src/actions/admin/blog.ts`

**型定義**:

```typescript
async function updateBlogTag(
  id: string,
  data: {
    name?: string
    slug?: string
  }
): Promise<{ success: boolean; error?: string }>
```

**認証**: 管理者のみ

---

#### `deleteBlogTag`

ブログタグを削除します。

**パス**: `src/actions/admin/blog.ts`

**型定義**:

```typescript
async function deleteBlogTag(id: string): Promise<{ success: boolean; error?: string }>
```

**認証**: 管理者のみ

**エラーハンドリング**:

- 記事が紐づいている場合は削除不可

---

### Route Handlers（公開API）

#### `GET /api/blog/posts`

ブログ記事一覧を取得します（公開API）。

**パス**: `src/app/api/blog/posts/route.ts`

**クエリパラメータ**:

- `page`: ページ番号（オプション、デフォルト: 1）
- `limit`: 1ページあたりの件数（オプション、デフォルト: 12）
- `category`: カテゴリスラッグ（オプション）
- `tag`: タグスラッグ（オプション）
- `search`: 検索キーワード（オプション）

**レスポンス**:

```typescript
{
  posts: BlogPost[]
  total: number
  totalPages: number
  currentPage: number
}
```

**認証**: 認証不要

---

#### `GET /api/blog/posts/[slug]`

ブログ記事詳細を取得します（公開API）。

**パス**: `src/app/api/blog/posts/[slug]/route.ts`

**レスポンス**:

```typescript
BlogPost | null
```

**認証**: 認証不要

**エラーハンドリング**:

- 非公開記事は404エラー

---

#### `GET /api/blog/categories`

ブログカテゴリ一覧を取得します（公開API）。

**パス**: `src/app/api/blog/categories/route.ts`

**レスポンス**:

```typescript
BlogCategory[]
```

**認証**: 認証不要

---

#### `GET /api/blog/tags`

ブログタグ一覧を取得します（公開API）。

**パス**: `src/app/api/blog/tags/route.ts`

**レスポンス**:

```typescript
BlogTag[]
```

**認証**: 認証不要

---

## 参考資料

### プロジェクトドキュメント

- `[AGENTS.md](../AGENTS.md)` - プロジェクト全体の仕様書
- `[DATABASE_DESIGN.md](./DATABASE_DESIGN.md)` - データベース設計
- `[SECURITY.md](./SECURITY.md)` - セキュリティポリシー
- `[ARCHITECTURE.md](./ARCHITECTURE.md)` - システムアーキテクチャ

### 外部リソース

- [Next.js Server Actions Documentation](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations)
- [Next.js Route Handlers Documentation](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [Zod Documentation](https://zod.dev/)
- [Auth.js Documentation](https://authjs.dev)

### ブログ機能の詳細

ブログ機能の詳細なAPI仕様については、`[BLOG_REQUIREMENTS.md](./BLOG_REQUIREMENTS.md)` を参照してください。

### ベストプラクティス

Server Actionsの実装ベストプラクティスについては、`[BEST_PRACTICES.md](./BEST_PRACTICES.md)` を参照してください。