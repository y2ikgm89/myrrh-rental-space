# 006: お知らせバー機能 + お知らせ管理tiptap統合

## 概要

サイト上部に表示するお知らせバー（AnnouncementBar）機能の新規実装と、
お知らせ管理（News）へのtiptapリッチテキストエディター統合。

## 実装内容

### 1. お知らせ管理にtiptapエディター導入

**変更ファイル**:
- `src/app/admin/news/_components/NewsForm.tsx` - Textarea → RichTextEditor
- `src/app/(public)/news/[id]/_components/NewsContent.tsx` - DOMPurify拡張（iframe対応）

**機能**:
- 画像・YouTube動画の埋め込み対応
- XSS対策: DOMPurifyで信頼できるiframeホストのみ許可
  - youtube.com, youtube-nocookie.com, player.vimeo.com

### 2. AnnouncementBar機能の新規実装

**新規ファイル**:
- `src/actions/admin/announcement-bar.ts` - Server Actions (CRUD + 認証)
- `src/app/admin/settings/announcement-bar/page.tsx` - 管理画面
- `src/components/site/AnnouncementBar.tsx` - 表示コンポーネント
- `src/components/site/AnnouncementBarWrapper.tsx` - Server Component ラッパー

**変更ファイル**:
- `prisma/schema.prisma` - AnnouncementBarモデル追加
- `src/app/(public)/layout.tsx` - AnnouncementBarWrapper追加

**データモデル**:
```prisma
model AnnouncementBar {
  id        String    @id @default(uuid())
  message   String    @db.VarChar(200)
  type      String    @default("info") // info, warning, promo
  linkUrl   String?
  linkText  String?
  bgColor   String?   // カスタム背景色 (hex)
  textColor String?   // カスタム文字色 (hex)
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

**機能**:
- 3種類のタイプ: info（青）, warning（黄）, promo（緑）
- カスタム背景色・文字色対応
- 表示期間指定（開始日時・終了日時）
- 優先度による表示順制御
- 閉じるボタン（セッション中のみ記憶）
- useSyncExternalStoreでセッションストレージ管理

## セキュリティ対策

1. **Server Actions認証**: 全ての変更系アクションに`auth()`チェック追加
2. **XSS対策**: DOMPurifyで信頼できるホストのみiframe許可
3. **バリデーション**: Zodスキーマでサーバーサイド検証
4. **色コード正規化**: hex値を小文字に統一

## デプロイ時の作業

```bash
bunx prisma migrate dev --name add_announcement_bar
```

## 検証結果

- type-check: ✅ Pass
- lint: ✅ Pass
- build: ✅ Pass
- code-reviewer: ✅ Pass (セキュリティ修正済み)
