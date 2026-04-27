# データベース設計

> **Note**: このドキュメントには詳細なデータベーススキーマが記載されています。Codex 作業では [`AGENTS.md`](../../AGENTS.md) と [`prisma-data-change`](../../.agents/skills/prisma-data-change/SKILL.md) を入口にしてください。

---

## 主要テーブル

### Users（認証ユーザー）

- `id`, `email`, `name`, `role` (admin, user), `createdAt`, `updatedAt`
- Better Auth のセッション管理と統合

### Spaces（レンタルスペース）

- **基本フィールド**:
  - `id`: 一意識別子（String, UUID）
  - `name`: スペース名（String, 必須）
  - `description`: 説明（String, 必須）
  - `address`: 住所（String, 必須）
  - `access`: アクセス情報（String, オプション）
  - `capacity`: 収容人数（Int, 必須）
  - `area`: 面積（Decimal, 平方メートル, オプション）
- **料金情報**:
  - `hourlyPrice`: 時間単位料金（Decimal, 必須）
  - `dailyPrice`: 日単位料金（Decimal, nullable）
- **画像情報**:
  - `mainImageUrl`: メイン画像URL（String, 必須）
  - `imageUrls`: サブ画像URL配列（JSON配列, オプション）
- **設備**:
  - `facilities`: 設備情報（JSON配列, 例: ["Wi-Fi", "Projector", "Whiteboard"]）
- **営業時間**:
  - `businessHours`: 営業時間（JSON, 曜日別の開始/終了時間）
- **公開設定**:
  - `isPublished`: 公開フラグ（Boolean, デフォルト: false）
  - `publishedAt`: 公開日時（DateTime, nullable）
- **その他**:
  - `isActive`: アクティブフラグ（Boolean, デフォルト: true）
  - `createdAt`: 作成日時（DateTime）
  - `updatedAt`: 更新日時（DateTime）

### Reservations（予約）

- **基本フィールド**:
  - `id`: 一意識別子（String, UUID）
  - `spaceId`: スペースID（String, FK, 必須）
  - `userId`: ユーザーID（String, FK, nullable、ログインユーザーの場合）
  - `customerId`: 顧客ID（String, FK, 必須）
  - `startTime`: 開始日時（DateTime, 必須）
  - `endTime`: 終了日時（DateTime, 必須）
  - `status`: ステータス（Enum: 'pending', 'confirmed', 'cancelled'）
  - `totalPrice`: 合計金額（Decimal, nullable, Decimal(10, 2)）
  - `createdAt`: 作成日時（DateTime）
  - `updatedAt`: 更新日時（DateTime）
- **リレーション**:
  - `spaceId` → Spaces.id (FK, onDelete: Cascade)
  - `userId` → Users.id (FK, nullable, onDelete: SetNull)
  - `customerId` → Customers.id (FK, onDelete: SetNull)
- **インデックス**:
  - `spaceId`: スペース別の予約検索
  - `startTime`, `endTime`: 日時範囲での検索
  - `status`: ステータス別の検索
  - `customerId`: 顧客別の予約検索
  - 複合インデックス: `[spaceId, startTime, endTime]`（重複チェック用）
  - 複合インデックス: `[customerId, startTime]`（顧客別予約履歴検索用）

### Inquiries（お問い合わせ）

- `id`, `name`, `email`, `subject`, `message`, `status`, `createdAt`, `updatedAt`

### News（お知らせ）

- `id`, `title`, `content`, `publishedAt`, `isPublished`, `createdAt`, `updatedAt`

### Posts（投稿記事）

- **基本フィールド**:
  - `id`: 一意識別子（String, UUID）
  - `title`: タイトル（String, 必須, 1-200文字）
  - `slug`: スラッグ（String, 必須, ユニーク）
  - `excerpt`: 概要（String, 必須, 1-500文字）
  - `content`: 本文（String, 必須, リッチテキスト（HTML形式））
  - `thumbnailUrl`: サムネイル画像URL（String, 必須, Cloudflare R2 URL）
  - `ogpImageUrl`: OGP画像URL（String, nullable, Cloudflare R2 URL）
- **分類**:
  - `categoryId`: カテゴリID（String, FK, 必須）
  - `tags`: タグ配列（Json, String[]）, デフォルト: []
- **SEO設定**:
  - `metaDescription`: メタディスクリプション（String, nullable, 1-160文字）
  - `metaKeywords`: メタキーワード（String, nullable, カンマ区切り）
  - `ogpTitle`: OGPタイトル（String, nullable, 1-60文字）
  - `ogpDescription`: OGP説明（String, nullable, 1-200文字）
- **公開設定**:
  - `publishedAt`: 公開日時（DateTime, nullable）
  - `isPublished`: 公開フラグ（Boolean, デフォルト: false）
  - `isDraft`: 下書きフラグ（Boolean, デフォルト: true）
  - `authorId`: 著者ID（String, FK, 必須）
- **統計情報**:
  - `viewCount`: 閲覧数（Int, デフォルト: 0）
- **タイムスタンプ**:
  - `createdAt`: 作成日時（DateTime）
  - `updatedAt`: 更新日時（DateTime）
- **リレーション**:
  - `categoryId` → PostCategories.id (FK)
  - `authorId` → Users.id (FK)
- **インデックス**:
  - `slug`: ユニークインデックス
  - `[isPublished, publishedAt]`: 複合インデックス（公開済み記事の日時順ソート）
  - `[categoryId, isPublished, publishedAt]`: 複合インデックス（カテゴリ別公開済み記事の日時順ソート）
  - `viewCount`: 人気記事検索用

### PostCategories（投稿カテゴリ）

- **基本フィールド**:
  - `id`: 一意識別子（String, UUID）
  - `name`: カテゴリ名（String, 必須, 1-50文字, ユニーク）
  - `slug`: スラッグ（String, 必須, ユニーク）
  - `description`: 説明（String, nullable, 1-500文字）
  - `order`: 表示順序（Int, 必須, デフォルト: 0）
- **タイムスタンプ**:
  - `createdAt`: 作成日時（DateTime）
  - `updatedAt`: 更新日時（DateTime）
- **インデックス**:
  - `slug`: ユニークインデックス
  - `order`: 表示順序ソート用

### PostTags（投稿タグ）

- **基本フィールド**:
  - `id`: 一意識別子（String, UUID）
  - `name`: タグ名（String, 必須, 1-30文字, ユニーク）
  - `slug`: スラッグ（String, 必須, ユニーク）
- **タイムスタンプ**:
  - `createdAt`: 作成日時（DateTime）
  - `updatedAt`: 更新日時（DateTime）
- **インデックス**:
  - `slug`: ユニークインデックス

### Settings（設定）

- **基本フィールド**:
  - `id`: 一意識別子（String, UUID）
  - `createdAt`: 作成日時（DateTime）
  - `updatedAt`: 更新日時（DateTime）
- **サイト基本情報**:
  - `siteName`: サイト名（String, nullable, 1-100文字）
  - `siteDescription`: サイト説明（String, nullable, 1-500文字）
  - `faviconUrl`: ファビコンURL（String, nullable, Cloudflare R2 URL）
  - `defaultOgpImageUrl`: デフォルトOGP画像URL（String, nullable, Cloudflare R2 URL）
  - `headerLogoUrl`: ヘッダーロゴURL（String, nullable, Cloudflare R2 URL）
  - `footerCopyright`: フッターコピーライトテキスト（String, nullable, 1-200文字）
- **連絡先情報**:
  - `phoneNumber`: 電話番号（String, nullable）
  - `email`: メールアドレス（String, nullable）
  - `address`: 住所（String, nullable, 1-200文字）
  - `defaultBusinessHours`: デフォルト営業時間（Json, nullable, 曜日別の開始/終了時間）
- **メール設定**:
  - `senderEmail`: 送信元メールアドレス（String, nullable）
  - `senderName`: 送信者名（String, nullable, 1-100文字）
  - `replyToEmail`: 返信先メールアドレス（String, nullable）
  - `reservationConfirmationTemplateId`: 予約確認メールテンプレートID（String, nullable、オプション、キャッシュ用）
  - `reservationCancelledTemplateId`: キャンセル通知メールテンプレートID（String, nullable、オプション、キャッシュ用）
  - `reservationUpdatedTemplateId`: 変更通知メールテンプレートID（String, nullable、オプション、キャッシュ用）
  - `adminNotificationTemplateId`: 管理者通知メールテンプレートID（String, nullable、オプション、キャッシュ用）
  - **注意**: テンプレートIDはResend APIで管理されるため、Settingsテーブルへの保存はオプション（パフォーマンス向上のためのキャッシュとして使用可能）
- **SEO設定**:
  - `defaultMetaDescription`: デフォルトメタディスクリプション（String, nullable, 1-160文字）
  - `defaultMetaKeywords`: デフォルトメタキーワード（String, nullable）
  - `defaultOgpTitle`: デフォルトOGPタイトル（String, nullable, 1-60文字）
  - `defaultOgpDescription`: デフォルトOGP説明（String, nullable, 1-200文字）
  - `googleAnalyticsId`: Google Analytics ID（String, nullable, G-XXXXXXXXXX形式）
  - `googleSearchConsoleId`: Google Search Console ID（String, nullable）
- **予約設定**:
  - `defaultTimeSlot`: デフォルト時間枠（Int, nullable, 分単位、デフォルト: 60）
  - `minReservationDuration`: 予約可能な最小時間（Int, nullable, 分単位、デフォルト: 60）
  - `maxReservationDuration`: 予約可能な最大時間（Int, nullable, 分単位、デフォルト: 480）
  - `cancellationTermsId`: キャンセルポリシー（String, nullable, Terms.idへの参照）
  - `sendReservationConfirmationEmail`: 予約確認メール送信フラグ（Boolean, デフォルト: true）
  - `sendAdminNotificationEmail`: 管理者通知メール送信フラグ（Boolean, デフォルト: true）
- **通知設定**:
  - `notifyNewReservation`: 新規予約通知（Boolean, デフォルト: true）
  - `notifyReservationChange`: 予約変更通知（Boolean, デフォルト: true）
  - `notifyReservationCancel`: 予約キャンセル通知（Boolean, デフォルト: true）
  - `notifyNewInquiry`: 新規お問い合わせ通知（Boolean, デフォルト: true）
  - `notificationEmailAddresses`: 通知先メールアドレス（String, nullable, カンマ区切り）
- **その他の設定**:
  - `timezone`: タイムゾーン（String, nullable, デフォルト: 'Asia/Tokyo'）
  - `language`: 言語設定（String, nullable, デフォルト: 'ja'）
  - `maintenanceMode`: メンテナンスモード（Boolean, デフォルト: false）
  - `maintenanceMessage`: メンテナンスメッセージ（String, nullable, Text型）
- **設計方針**:
  - **シングルトン**: Settingsテーブルは1レコードのみ存在（ID固定または`findFirst`で取得）
  - **型安全性**: 専用フィールドを使用して型安全性を確保

### Pages（公開ページコンテンツ）

- **基本フィールド**:
  - `id`: 一意識別子（String, UUID）
  - `slug`: URLスラッグ（String, unique, 例: 'home', 'reservation', 'privacy'）
  - `title`: ページタイトル（String, 必須, 1-200文字, SEO用）
  - `description`: ページ説明（String, nullable, 1-500文字, SEO用）
- **コンテンツ**:
  - `content`: リッチテキストコンテンツ（String, 必須, Text型, HTML形式）
- **SEO設定**:
  - `metaDescription`: メタディスクリプション（String, nullable, 1-160文字）
  - `metaKeywords`: メタキーワード（String, nullable, カンマ区切り）
  - `ogpTitle`: OGPタイトル（String, nullable, 1-60文字）
  - `ogpDescription`: OGP説明（String, nullable, 1-200文字）
  - `ogpImageUrl`: OGP画像URL（String, nullable, Cloudflare R2 URL）
- **公開設定**:
  - `isPublished`: 公開フラグ（Boolean, デフォルト: true）
  - `publishedAt`: 公開日時（DateTime, nullable）
- **その他**:
  - `isActive`: アクティブフラグ（Boolean, デフォルト: true）
  - `createdAt`: 作成日時（DateTime）
  - `updatedAt`: 更新日時（DateTime）
- **インデックス**:
  - `slug`: ユニークインデックス
  - `[isPublished, isActive]`: 複合インデックス（公開済みページの検索用）
- **既存ページのスラッグ定義**:
  - `home` - トップページ (`/`)
  - `reservation` - 予約ページ (`/reservation`)
  - `spaces` - スペース一覧ページ (`/spaces`)
  - `contact` - お問い合わせページ (`/contact`)
  - `privacy` - プライバシーポリシー (`/privacy`)
  - `terms` - 利用規約 (`/terms`)
- **設計方針**:
  - **スラッグベース**: URLスラッグでページを識別
  - **予約済みスラッグ**: `admin`, `api`などは使用不可
  - **リッチテキスト**: Tiptapエディタで編集可能なHTML形式で保存
  - **SEO対応**: 各ページでメタタグ、OGP設定を管理可能

### Customers（顧客）

- **基本フィールド**:
  - `id`: 一意識別子（String, UUID）
  - `lastName`: 姓（String, 必須, 1-50文字）
  - `firstName`: 名（String, 必須, 1-50文字）
  - `email`: メールアドレス（String, 必須, unique, 1-255文字）
  - `phoneNumber`: 電話番号（String, nullable, 1-20文字）
  - `address`: 住所（String, nullable, 1-200文字）
- **顧客ステータス**:
  - `status`: 顧客ステータス（Enum: CustomerStatus, デフォルト: NEW）
    - `NEW`: 新規顧客
    - `REGULAR`: リピーター
    - `VIP`: VIP顧客
    - `INACTIVE`: 非アクティブ
    - `BLACKLIST`: ブラックリスト
  - `notes`: 備考・メモ（String, nullable, Text型）
- **統計情報（自動計算）**:
  - `totalReservations`: 総予約回数（Int, デフォルト: 0）
  - `totalSpent`: 総利用金額（Decimal, nullable, Decimal(10, 2)）
  - `lastReservationAt`: 最終予約日時（DateTime, nullable）
  - `firstReservationAt`: 初回予約日時（DateTime, nullable）
- **その他**:
  - `isActive`: アクティブフラグ（Boolean, デフォルト: true）
  - `createdAt`: 作成日時（DateTime）
  - `updatedAt`: 更新日時（DateTime）
- **リレーション**:
  - `reservations`: 予約履歴（Reservation[]）
- **インデックス**:
  - `email`: ユニークインデックス（メールアドレス検索用）
  - `lastName`: 姓での検索・ソート用
  - `status`: ステータス別検索用
  - `isActive`: アクティブ/非アクティブ検索用
  - `lastReservationAt`: 最終予約日時順ソート用
  - 複合インデックス: `[lastName, firstName]`（姓名での検索・ソート用）
- **設計方針**:
  - **姓名を分離**: 姓（`lastName`）と名（`firstName`）を分けて管理
    - **国際化対応**: 日本（姓→名）、欧米（名→姓）、中国・韓国（姓→名）など、文化によって名前の順序が異なるため、分離することで言語ごとに適切な表示順序を実装可能
    - **メール送信時のパーソナライゼーション**: 「山田太郎様」「John Smith様」など、文化に応じた適切な敬称を付与可能
    - **ソート・検索の精度向上**: 姓でのソート、姓のみ・名のみでの検索が可能。複合インデックス`[lastName, firstName]`で効率的な検索・ソートを実現
    - **ビジネス環境での一般的な慣習**: 日本のビジネス環境では姓名を分けて管理することが一般的。データベース設計のベストプラクティスとしても正規化の観点から柔軟性が高い
  - **表示用フルネーム**: アプリケーション層で`${lastName} ${firstName}`として結合（日本）、`${firstName} ${lastName}`として結合（国際化対応時）

    ```typescript
    // src/lib/customer.ts
    export function getCustomerFullName(
      customer: { lastName: string; firstName: string },
      locale: string = "ja",
    ): string {
      if (locale === "ja") {
        // 日本語: 姓 名
        return `${customer.lastName} ${customer.firstName}`;
      } else {
        // 英語など: FirstName LastName
        return `${customer.firstName} ${customer.lastName}`;
      }
    }

    // 敬称付きフルネーム
    export function getCustomerFullNameWithHonorific(
      customer: { lastName: string; firstName: string },
      locale: string = "ja",
    ): string {
      const fullName = getCustomerFullName(customer, locale);
      return locale === "ja" ? `${fullName}様` : `${fullName}様`;
    }
    ```

  - **バリデーション**: Zodスキーマで型安全なバリデーションを実装

    ```typescript
    // src/lib/validations/customer.ts
    import { z } from "zod";

    export const customerSchema = z.object({
      lastName: z
        .string()
        .min(1, "姓を入力してください")
        .max(50, "姓は50文字以内で入力してください"),
      firstName: z
        .string()
        .min(1, "名を入力してください")
        .max(50, "名は50文字以内で入力してください"),
      email: z
        .string()
        .email("有効なメールアドレスを入力してください")
        .max(255),
      phoneNumber: z
        .string()
        .regex(/^[0-9-+()]+$/)
        .max(20)
        .optional()
        .nullable(),
      address: z.string().max(200).optional().nullable(),
      status: customerStatusEnum.optional(),
      notes: z.string().optional().nullable(),
      isActive: z.boolean().optional(),
    });
    ```

  - **検索・ソート機能**: 型安全なPrismaクエリで実装

    ```typescript
    // 型安全なwhere条件の構築
    const where: Prisma.CustomerWhereInput = {};
    if (searchParams.search) {
      where.OR = [
        { lastName: { contains: searchParams.search, mode: "insensitive" } },
        { firstName: { contains: searchParams.search, mode: "insensitive" } },
        { email: { contains: searchParams.search, mode: "insensitive" } },
        { phoneNumber: { contains: searchParams.search, mode: "insensitive" } },
      ];
    }

    // 型安全なorderBy条件の構築
    const orderBy: Prisma.CustomerOrderByWithRelationInput = {};
    if (searchParams.sortBy === "name") {
      orderBy.lastName = searchParams.sortOrder || "asc";
      orderBy.firstName = searchParams.sortOrder || "asc";
    }
    ```

  - **将来の拡張**: 多言語対応、ミドルネーム対応など、柔軟に拡張可能
    - 多言語対応時は言語ごとの名前表示順序を実装可能
    - ミドルネームが必要になった場合は`middleName`フィールドを追加可能
  - **メールアドレスをキー**: メールアドレスで顧客を識別（ユニーク制約）
  - **自動顧客作成**: 予約作成時にメールアドレスで顧客を検索、存在しなければ自動作成（`upsert`を使用）
  - **統計情報の自動更新**: 予約作成・更新・削除時に顧客の統計情報を自動更新（トランザクション内で実行）

### NavigationItems（ナビゲーションメニュー）

- **基本フィールド**:
  - `id`: 一意識別子（String, UUID）
  - `type`: タイプ（Enum: 'header', 'footer'）
  - `parentId`: 親メニューID（String, nullable, サブメニュー用）
  - `label`: 表示名（String, 必須, 1-100文字）
  - `url`: リンクURL（String, 必須）
  - `isExternal`: 外部リンクフラグ（Boolean, デフォルト: false）
  - `order`: 表示順序（Int, 必須）
  - `isActive`: アクティブフラグ（Boolean, デフォルト: true）
  - `createdAt`: 作成日時（DateTime）
  - `updatedAt`: 更新日時（DateTime）
- **制約**:
  - メニュー階層は最大1階層（サブメニューのみ）
  - ヘッダーメニューは最大10項目、フッターメニューは最大15項目

### SocialLinks（SNSアイコン）

- **基本フィールド**:
  - `id`: 一意識別子（String, UUID）
  - `platform`: プラットフォーム（Enum: 'twitter', 'facebook', 'instagram', 'youtube', 'line', 'tiktok', 'other'）
  - `url`: リンクURL（String, 必須）
  - `iconUrl`: カスタムアイコンURL（String, nullable, プラットフォームが'other'の場合）
  - `order`: 表示順序（Int, 必須）
  - `isActive`: アクティブフラグ（Boolean, デフォルト: true）
  - `createdAt`: 作成日時（DateTime）
  - `updatedAt`: 更新日時（DateTime）
- **対応プラットフォーム**:
  - Twitter/X, Facebook, Instagram, YouTube, LINE, TikTok
  - その他（カスタムURLサポート、カスタムアイコン設定可能）

---

## Prismaスキーマベストプラクティス

### 命名規則

- **モデル名**: PascalCase（例: `User`, `Space`, `Reservation`）
- **フィールド名**: camelCase（例: `createdAt`, `isPublished`）
- **リレーション名**: 明確で一貫性のある名前（例: `reservations`, `space`）

### 型の使用

- **Decimal型**: 価格、面積など精度が重要な数値に使用
  ```prisma
  hourlyPrice Decimal @db.Decimal(10, 2)
  ```
- **DateTime型**: 日時情報に使用（タイムゾーンはアプリケーション層で管理）
- **Json型**: 構造化データ（営業時間、設備情報など）に使用
- **Enum型**: 固定値のセット（ステータス、ロールなど）に使用

### リレーションの定義

#### 一対多（One-to-Many）

```prisma
model Space {
  id           String        @id @default(uuid())
  reservations Reservation[]
}

model Reservation {
  id      String @id @default(uuid())
  spaceId String
  space   Space  @relation(fields: [spaceId], references: [id], onDelete: Cascade)
}
```

#### 多対一（Many-to-One）

```prisma
model Reservation {
  id      String @id @default(uuid())
  spaceId String
  userId  String?
  space   Space  @relation(fields: [spaceId], references: [id], onDelete: Cascade)
  user    User?  @relation(fields: [userId], references: [id], onDelete: SetNull)
}
```

#### カスケード削除の設定

- **`onDelete: Cascade`**: 親レコード削除時に子レコードも削除
  - 例: スペース削除時に予約も削除
- **`onDelete: SetNull`**: 親レコード削除時に子レコードの外部キーをNULLに設定
  - 例: ユーザー削除時に予約のuserIdをNULLに設定
- **`onDelete: Restrict`**: 親レコードに子レコードが存在する場合は削除を拒否
  - 例: 予約が存在するスペースは削除不可

### インデックスの設定

パフォーマンス向上のため、頻繁にクエリされるフィールドにインデックスを設定します。

#### 単一フィールドインデックス

```prisma
model Reservation {
  id        String   @id @default(uuid())
  spaceId   String
  startTime DateTime
  endTime   DateTime

  @@index([spaceId])
  @@index([startTime])
  @@index([endTime])
}
```

#### 複合インデックス

```prisma
model Reservation {
  id        String   @id @default(uuid())
  spaceId   String
  startTime DateTime
  endTime   DateTime
  status    String

  // スペースと日時範囲での検索を最適化
  @@index([spaceId, startTime, endTime])
  // ステータスと日時での検索を最適化
  @@index([status, startTime])
}
```

#### 推奨インデックス設定

**Reservationsテーブル**:

- `spaceId`: スペース別の予約検索
- `startTime`, `endTime`: 日時範囲での検索
- `status`: ステータス別の検索
- `customerId`: 顧客別の予約検索
- 複合インデックス: `[spaceId, startTime, endTime]`（重複チェック用）
- 複合インデックス: `[customerId, startTime]`（顧客別予約履歴検索用）

**Customersテーブル**:

- `email`: ユニークインデックス（メールアドレス検索用）
- `status`: ステータス別検索用
- `isActive`: アクティブ/非アクティブ検索用
- `lastReservationAt`: 最終予約日時順ソート用

**Spacesテーブル**:

- `isPublished`: 公開済みスペースの検索
- `isActive`: アクティブなスペースの検索
- 複合インデックス: `[isPublished, isActive]`

**Newsテーブル**:

- `publishedAt`: 公開日時順のソート
- `isPublished`: 公開済みお知らせの検索
- 複合インデックス: `[isPublished, publishedAt]`

**Postsテーブル**:

- `slug`: ユニークインデックス（スラッグ検索用）
- `isPublished`: 公開済み記事の検索
- `publishedAt`: 公開日時順のソート
- `categoryId`: カテゴリ別の検索
- `viewCount`: 人気記事検索用
- 複合インデックス: `[isPublished, publishedAt]`（公開済み記事の日時順ソート）
- 複合インデックス: `[categoryId, isPublished, publishedAt]`（カテゴリ別公開済み記事の日時順ソート）

**PostCategoriesテーブル**:

- `slug`: ユニークインデックス（スラッグ検索用）
- `order`: 表示順序でのソート

**PostTagsテーブル**:

- `slug`: ユニークインデックス（スラッグ検索用）

**NavigationItemsテーブル**:

- `type`: ヘッダー/フッター別の検索
- `order`: 表示順序でのソート
- 複合インデックス: `[type, order]`

### Prisma Clientシングルトン実装

接続リークを防ぐため、Prisma Clientはシングルトンパターンで実装します。

**Prisma 7の設定**:

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client"
  output   = "./generated/prisma/client"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

**Prisma Clientの実装**:

```typescript
// src/lib/prisma.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

**注意**:

- Prisma 7 では、カスタム出力パス（`output`）の指定が必須です（schema.prisma の `generator client { output = "../generated/prisma/client" }` を参照）。
- Prisma 7 では、データベース接続にドライバーアダプターが必要です。PostgreSQL の場合は `@prisma/adapter-pg` を使用します（実装は `src/shared/db/prisma/factory.ts`、enum gateway は ADR 0002 を参照）。

### クエリ最適化

詳細は [Prisma Best Practices](https://www.prisma.io/docs/guides/performance-and-optimization) を参照してください。

#### selectで必要なフィールドのみ取得

```typescript
// ✅ 良い例: 必要なフィールドのみ取得
const spaces = await prisma.space.findMany({
  select: {
    id: true,
    name: true,
    mainImageUrl: true,
    hourlyPrice: true,
  },
});

// ❌ 悪い例: すべてのフィールドを取得
const spaces = await prisma.space.findMany();
```

#### includeの適切な使用（N+1問題の回避）

```typescript
// ✅ 良い例: 一度のクエリで関連データも取得
const reservations = await prisma.reservation.findMany({
  include: {
    space: {
      select: {
        id: true,
        name: true,
        mainImageUrl: true,
      },
    },
    user: {
      select: {
        id: true,
        name: true,
        email: true,
      },
    },
  },
});

// ❌ 悪い例: N+1問題が発生
const reservations = await prisma.reservation.findMany();
for (const reservation of reservations) {
  const space = await prisma.space.findUnique({
    where: { id: reservation.spaceId },
  });
}
```

#### ページネーションの実装

```typescript
// ✅ 良い例: 効率的なページネーション
const page = 1;
const pageSize = 12;

const [spaces, total] = await Promise.all([
  prisma.space.findMany({
    where: { isPublished: true },
    skip: (page - 1) * pageSize,
    take: pageSize,
    orderBy: { createdAt: "desc" },
  }),
  prisma.space.count({
    where: { isPublished: true },
  }),
]);

const totalPages = Math.ceil(total / pageSize);
```

#### トランザクションの使用

```typescript
// ✅ 良い例: トランザクションで複数の操作を保証
await prisma.$transaction(async (tx) => {
  const space = await tx.space.create({
    data: spaceData,
  });

  await tx.reservation.create({
    data: {
      spaceId: space.id,
      // ...
    },
  });

  return space;
});
```

### マイグレーション管理

#### マイグレーション命名規則

```
<timestamp>_<description>.sql
```

例: `20250105120000_add_indexes_to_reservations.sql`

#### マイグレーション実行

```bash
# 開発環境: マイグレーション作成と適用
bunx --bun prisma migrate dev --name add_indexes_to_reservations

# 本番環境: マイグレーション適用のみ
bunx --bun prisma migrate deploy
```

#### データ移行時の注意事項

1. **バックアップ**: 本番環境のマイグレーション前に必ずバックアップを取得
2. **段階的移行**: 大きな変更は複数のマイグレーションに分割
3. **ロールバック計画**: 問題発生時のロールバック手順を事前に準備
4. **テスト**: ステージング環境で十分にテストしてから本番環境に適用

### 接続プーリング

接続プーリング対応 PostgreSQL URL を使用して、データベース接続を最適化します。

```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL") // 接続プーリングURLを使用
}
```

**接続プーリングURLの形式**:

```
postgresql://user:password@host:6543/database?pgbouncer=true
```

### エラーハンドリング

```typescript
try {
  const space = await prisma.space.create({
    data: spaceData,
  });
  return { success: true, data: { id: space.id } };
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      // 一意制約違反
      return {
        success: false,
        error: "Duplicate entry",
        code: "CONFLICT",
      };
    }
    if (error.code === "P2025") {
      return {
        success: false,
        error: "Record not found",
        code: "NOT_FOUND",
      };
    }
  }
  console.error("Unexpected error:", error);
  return {
    success: false,
    error: "An unexpected error occurred",
    code: "INTERNAL_ERROR",
  };
}
```

---

## 参考資料

### プロジェクトドキュメント

- [`AGENTS.md`](../../AGENTS.md) - Codex 向けプロジェクト指示
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) - システムアーキテクチャ

### 外部リソース

- [Prisma Schema Reference](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference)
- [Prisma Best Practices](https://www.prisma.io/docs/guides/performance-and-optimization)
- [Prisma Indexes](https://www.prisma.io/docs/concepts/components/prisma-schema/indexes)
- [Prisma Relations](https://www.prisma.io/docs/concepts/components/prisma-schema/relations)
- [Prisma Connection Management](https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections)

### ベストプラクティス

Prisma 7の詳細なベストプラクティスについては、[Prisma 公式ドキュメント](https://www.prisma.io/docs/guides/performance-and-optimization) を参照してください。
