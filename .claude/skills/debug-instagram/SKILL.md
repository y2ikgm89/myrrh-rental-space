---
name: debug-instagram
description: >
  Instagram フィード同期の診断スキル。トークン有効期限、cron 実行状況、DB 投稿数、CDN URL 疎通を
  一括チェック。「インスタが表示されない」「フィードが更新されない」場面で使用する。
when_to_use: Instagram フィード表示・同期に問題が発生したとき。開発者が状況判断して手動で起動する。AI による自動起動は不可。
disable-model-invocation: true
---

# Instagram デバッグ

> Myrrh Rental Space の Instagram 統合診断ガイド

## アーキテクチャ概要

```
認証フロー:
  1. OAuth: /api/instagram/oauth/authorize → Instagram 認証 → /api/instagram/oauth/callback
  2. 手動: 管理画面 > 設定 > 外部連携 > Instagram で長期トークンを貼り付け

データフロー:
  トークン保存（暗号化）→ cron フィード同期（毎時）→ DB InstagramPost → 'use cache' → 公開ページ
  トークンリフレッシュ cron（毎日）→ 残り10日以内で自動更新

トークン形式:
  IGQ*  →  Instagram Graph API 長期アクセストークン（60日有効）
```

**関連ファイル**:

| ファイル                                                       | 役割                                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `src/shared/lib/instagram/index.ts`                            | Graph API クライアント（フィード取得、接続テスト、トークンリフレッシュ） |
| `src/shared/domain/instagram/commands.ts`                      | トークン保存、フィード同期、投稿管理                                     |
| `src/shared/domain/instagram/queries.ts`                       | 設定取得、投稿取得（`'use cache'`）、トークン復号                        |
| `src/app/api/cron/instagram-sync/route.ts`                     | フィード同期 cron（毎時）                                                |
| `src/app/api/cron/instagram-refresh/route.ts`                  | トークンリフレッシュ cron（毎日）                                        |
| `src/app/api/instagram/oauth/authorize/route.ts`               | OAuth 認証開始                                                           |
| `src/app/api/instagram/oauth/callback/route.ts`                | OAuth コールバック                                                       |
| `src/app/(admin)/.../settings/_components/sections/instagram/` | 管理画面 UI                                                              |
| `src/app/(public)/_components/InstagramSection.tsx`            | 公開ページ表示（Server Component）                                       |

---

## 診断ステップ

### Step 1 — 接続状態の確認

管理画面 > 設定 > 外部連携 > Instagram タブで確認:

- **連携済み**: ユーザー名、アカウントタイプ、トークン有効期限が表示される
- **未連携**: 「Instagramアカウントと連携して投稿を表示できます」が表示される

**DB で直接確認**:

```sql
SELECT
  "instagramAccessToken" IS NOT NULL AS has_token,
  "instagramUserId",
  "instagramUsername",
  "instagramTokenExpiresAt",
  "instagramFeedEnabled"
FROM settings WHERE id = 'singleton';
```

### Step 2 — トークン有効期限の確認

| 状態                              | 対処                                                      |
| --------------------------------- | --------------------------------------------------------- |
| 残り 10日以上                     | 正常。リフレッシュ cron が 10日以内で自動更新             |
| 残り 1-10日                       | リフレッシュ cron が未実行の可能性。Step 4 で cron を確認 |
| 期限切れ                          | トークン再取得が必要。OAuth 再認証 or 手動トークン再入力  |
| `instagramTokenExpiresAt` が NULL | トークン保存時に有効期限が記録されなかった。再認証推奨    |

### Step 3 — DB の投稿データ確認

```sql
SELECT COUNT(*) AS total_posts FROM instagram_posts;
SELECT id, "postId", "mediaUrl" IS NOT NULL AS has_media, "mediaType", "sortOrder"
FROM instagram_posts ORDER BY "sortOrder" LIMIT 5;
```

| 結果                               | 意味                                                                 |
| ---------------------------------- | -------------------------------------------------------------------- |
| 0件                                | フィード同期 cron が未実行、またはトークンが無効                     |
| 件数あるが `mediaUrl` が NULL      | API レスポンスに media_url が含まれていない（権限不足の可能性）      |
| 件数あるが公開ページに表示されない | キャッシュが古い、または InstagramSection がページに配置されていない |

### Step 4 — Cron 実行状況の確認

**フィード同期 cron** (`/api/cron/instagram-sync`):

```bash
# ローカルで手動実行（CRON_SECRET が設定済みの場合）
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/instagram-sync

# 期待レスポンス（正常）:
# { "synced": 12, "timestamp": "..." }
# 期待レスポンス（トークンなし）:
# { "skipped": true, "reason": "No Instagram token" }
```

**トークンリフレッシュ cron** (`/api/cron/instagram-refresh`):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/instagram-refresh

# 期待レスポンス（正常 — まだ更新不要）:
# { "skipped": true, "reason": "Token is still valid (45 days remaining)", "daysRemaining": 45 }
# 期待レスポンス（更新実行）:
# { "previousDaysRemaining": 8, "newDaysRemaining": 60, ... }
```

### Step 5 — CDN URL 疎通確認

Instagram 画像は `*.cdninstagram.com` または `*.fbcdn.net` から配信される:

```bash
# DB の mediaUrl を1件取得して疎通確認
# URL が有効期限付きの場合、古い投稿は 404 になる → フィード再同期で解決
```

**CSP / remotePatterns の確認**:

- `src/proxy.ts` の `img-src` に `https://*.cdninstagram.com https://*.fbcdn.net` が含まれているか
- `next.config.ts` の `remotePatterns` に `*.cdninstagram.com` と `*.fbcdn.net` が含まれているか

### Step 6 — キャッシュの確認

`getInstagramPosts()` は `'use cache'` + `cacheTag(CACHE_TAGS.INSTAGRAM_FEED)` でキャッシュされる:

- cron が `revalidateTag(CACHE_TAGS.INSTAGRAM_FEED, CACHE_LIFE.PUBLIC_CONTENT)` を呼んでいるか
- 手動でキャッシュを無効化するには管理画面で「連携解除」→「再連携」

### Step 7 — 公開ページの確認

`InstagramSection` がページに配置されているか:

```sql
SELECT id, type, "pageId" FROM sections WHERE type = 'instagram';
```

0件ならセクションが未追加。管理画面 > ページ編集 > セクション追加 > Instagram を選択。

---

## よくあるエラーと対処

| エラー                                 | 原因                                     | 対処                                     |
| -------------------------------------- | ---------------------------------------- | ---------------------------------------- |
| `Invalid OAuth access token`           | トークン期限切れ or 無効                 | OAuth 再認証 or 手動トークン再入力       |
| `Error validating access token`        | アプリが削除された or 権限取り消し       | Meta Developer App を確認、再認証        |
| `Application does not have permission` | Graph API の権限不足                     | Meta App に `instagram_basic` 権限を追加 |
| 画像が表示されない（broken image）     | CSP `img-src` 未設定 or CDN URL 期限切れ | proxy.ts 確認 + フィード再同期           |
| 「投稿を準備中です」が表示される       | DB に投稿がない                          | フィード同期 cron を手動実行             |
| cron が `{ skipped: true }` を返す     | トークン未設定                           | 管理画面で Instagram を連携              |

---

## 前提条件

- Instagram **Professional アカウント**（ビジネスまたはクリエイター）が必須
- Meta Developer App が必要（Instagram Graph API 有効化）
- OAuth 使用時は App に `instagram_basic` + `instagram_manage_insights` 権限
- Cloud Scheduler で 2 つの cron を設定: フィード同期（毎時）+ トークンリフレッシュ（毎日）

---

## 禁止事項

- アクセストークンをログに出力しない（`logError` の `context` に含めない）
- `instagramAccessToken` を復号した値をレスポンスに含めない
- Basic Display API（廃止済み）の URL を使わない
