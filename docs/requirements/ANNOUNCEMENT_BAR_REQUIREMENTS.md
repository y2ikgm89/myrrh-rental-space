# お知らせバー要件定義書

## 概要

サイト上部（ヘッダーの上）に表示するお知らせバー機能。
キャンペーン告知、重要なお知らせ、緊急情報などをユーザーに伝達する。

## 機能要件

### 1. 表示機能

#### 1.1 基本表示
- サイト全ページのヘッダー上部に固定表示
- 短いメッセージ（最大200文字）を表示
- オプションでリンク付きテキストを追加可能

#### 1.2 タイプ別スタイル
| タイプ | 用途 | デフォルト色 |
|--------|------|-------------|
| info | 一般的なお知らせ | 青 (#2563eb) |
| warning | 注意喚起 | 黄 (#f59e0b) |
| promo | キャンペーン・プロモーション | 緑 (#16a34a) |

#### 1.3 カスタマイズ
- カスタム背景色（hex形式）
- カスタム文字色（hex形式）
- リンクURL・リンクテキスト

### 2. 表示制御

#### 2.1 有効/無効
- 各お知らせバーを個別に有効/無効切り替え
- 無効化されたバーは公開ページに表示されない

#### 2.2 表示期間
- 開始日時（startAt）: 指定日時以降に表示
- 終了日時（endAt）: 指定日時まで表示
- 両方省略: 常時表示

#### 2.3 優先度
- 0-100の数値で優先度を設定
- 複数の有効なバーがある場合、最も優先度の高いものを表示
- 同一優先度の場合は新しいものを優先

### 3. ユーザーインタラクション

#### 3.1 閉じる機能
- 閉じるボタン（×）で非表示にできる
- 非表示状態はセッションストレージに保存
- 同一セッション中は再表示されない
- 新規セッションで再表示される

### 4. 管理機能

#### 4.1 CRUD操作
- 作成: 新規お知らせバー追加
- 一覧: 全お知らせバー表示（優先度・作成日時順）
- 編集: 既存お知らせバー更新
- 削除: お知らせバー削除

#### 4.2 管理画面UI
- パス: `/admin/settings/announcement-bar`
- テーブル形式での一覧表示
- ダイアログでの作成・編集
- リアルタイムプレビュー
- 削除確認ダイアログ

## 非機能要件

### セキュリティ
- Server Actionsに認証チェック必須
- Zodバリデーションによる入力検証
- XSS対策（エスケープ処理）

### パフォーマンス
- 公開ページでのDBクエリは1回のみ
- インデックス: `[isActive, priority]`, `[startAt, endAt]`

### アクセシビリティ
- `role="alert"` 属性
- 閉じるボタンに`aria-label`

## データモデル

```prisma
model AnnouncementBar {
  id        String    @id @default(uuid())
  message   String    @db.VarChar(200)
  type      String    @default("info")
  linkUrl   String?
  linkText  String?
  bgColor   String?
  textColor String?
  isActive  Boolean   @default(true)
  priority  Int       @default(0)
  startAt   DateTime?
  endAt     DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@index([isActive, priority])
  @@index([startAt, endAt])
  @@map("announcement_bars")
}
```

## 実装状況

- [x] Prismaスキーマ
- [x] Server Actions
- [x] 管理画面
- [x] 公開ページ表示コンポーネント
- [x] セキュリティ対策（認証・バリデーション）
- [ ] DBマイグレーション（デプロイ時）
