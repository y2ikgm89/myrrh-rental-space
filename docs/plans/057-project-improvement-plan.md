# 057 - プロジェクト全体改善計画

## 概要

プロジェクトスコア評価に基づく包括的改善。セキュリティ強化、テスト追加、コード品質改善を3フェーズで実施。

**実施日**: 2026-01-20
**ステータス**: ✅ 完了

---

## Phase 1: セキュリティ強化 (P0) ✅

### 1.1 環境変数の本番必須化 ✅
- `ENCRYPTION_KEY`: 本番環境で64文字必須
- `CRON_SECRET`: 本番環境で32文字以上必須
- **ファイル**: `src/shared/lib/env/server.ts`

### 1.2 APIレート制限の実装 ✅
- LRU Cacheベースのレート制限（100リクエスト/分/IP）
- Webhooks/CRONエンドポイントは除外
- **新規ファイル**: `src/shared/lib/rate-limit.ts`
- **変更ファイル**: `src/proxy.ts`

### 1.3 Google Calendar Webhook トークン検証 ✅
- `x-goog-channel-token` ヘッダーによる認証
- Webhook設定時にランダムトークン生成・保存
- **DBマイグレーション**: `add-webhook-token`
- **変更ファイル**: 
  - `src/shared/lib/google-calendar.ts`
  - `src/app/api/webhooks/google-calendar/route.ts`

---

## Phase 2: テスト強化 (P1) ✅

### 2.1 API Routes テスト追加 ✅
- `__tests__/integration/api/health.test.ts`
- `__tests__/integration/api/cron/calendar-sync.test.ts`
- `__tests__/integration/api/webhooks/google-calendar.test.ts`
- `__tests__/integration/api/ical.test.ts`

### 2.2 async-utils.ts 作成 ✅
- `fireAndForget()`: Promiseの安全な非同期実行
- `settleAllWithLogging()`: 並列実行とエラーログ
- `withTimeout()`: タイムアウト付き実行
- `withRetry()`: リトライ付き実行
- **新規ファイル**: `src/shared/lib/async-utils.ts`

---

## Phase 3: コード品質改善 (P2) ✅

### 3.1 settings.ts 分割 ✅
**変更前**: 1,570行の単一ファイル

**変更後**: 9ファイルに分割
```
_shared/actions/settings/
├── index.ts           # エクスポート統合
├── types.ts           # 型定義
├── schemas.ts         # Zodスキーマ
├── basic.ts           # 基本情報
├── business.ts        # 事業者情報
├── email.ts           # メール設定
├── google-calendar.ts # Google Calendar
├── stripe.ts          # Stripe
└── other.ts           # その他
```

### 3.2 NavigationManager.tsx 分割 ✅
**変更前**: 1,035行

**変更後**: 5ファイルに分割
```
_components/navigation/
├── NavigationManager.tsx  # 親コンポーネント
├── NavigationList.tsx     # リスト表示
├── NavigationDialog.tsx   # 編集ダイアログ
├── SortableNavItem.tsx    # ドラッグ可能アイテム
└── hooks/use-navigation-form.ts
```

### 3.3 AnnouncementBarManager.tsx 分割 ✅
**変更前**: 1,105行

**変更後**: 5ファイルに分割
```
_components/announcement-bar/
├── AnnouncementBarManager.tsx  # 親コンポーネント
├── BarList.tsx                 # リスト表示
├── BarDialog.tsx               # 編集ダイアログ
├── CarouselSettings.tsx        # カルーセル設定
└── DesignPreview.tsx           # プレビュー
```

---

## 依存関係追加

```bash
bun add lru-cache
```

---

## 検証結果

- ✅ type-check
- ✅ lint
- ✅ build
- ✅ test

---

## Critical Files

| ファイル | 変更内容 |
|---------|---------|
| `src/shared/lib/env/server.ts` | 環境変数必須化 |
| `src/proxy.ts` | レート制限追加 |
| `src/shared/lib/rate-limit.ts` | 新規作成 |
| `src/shared/lib/async-utils.ts` | 新規作成 |
| `src/shared/lib/google-calendar.ts` | Webhookトークン |
| `src/app/api/webhooks/google-calendar/route.ts` | トークン検証 |
| `prisma/schema.prisma` | webhookTokenフィールド追加 |
| `_shared/actions/settings/` | 分割（9ファイル） |
| `_components/navigation/` | 分割（5ファイル） |
| `_components/announcement-bar/` | 分割（5ファイル） |
| `__tests__/integration/api/` | 新規テスト（4ファイル） |
