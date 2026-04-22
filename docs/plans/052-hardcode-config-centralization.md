# Plan 052: ハードコード改善 - 設定一元管理

## 概要

ハードコードされた値を環境変数バリデーション層と定数ファイルに集約し、型安全で保守しやすい構成に改善。

## 完了フェーズ

- [x] Phase 1: 環境変数バリデーション基盤 (`@t3-oss/env-nextjs`)
- [x] Phase 2: 定数ファイル作成 (SITE_DEFAULTS, SESSION_CONFIG, PAGINATION_DEFAULTS, URL helpers)
- [x] Phase 3: URL フォールバック移行 (18箇所 → 統一ヘルパー)
- [x] Phase 4: サービス名移行 (`'Myrrh Rental Space'` → `SITE_DEFAULTS.name`)
- [x] Phase 5: 数値定数移行 (SESSION_CONFIG 適用)
- [x] Phase 6: 検証 (type-check/lint/build 成功)

## 新規ファイル

### 環境変数バリデーション

| ファイル                       | 説明                                                           |
| ------------------------------ | -------------------------------------------------------------- |
| `src/shared/lib/env/server.ts` | サーバー専用環境変数（DATABASE_URL, BETTER_AUTH_SECRET, etc.） |
| `src/shared/lib/env/client.ts` | クライアント環境変数（NEXT*PUBLIC*\*）                         |
| `src/shared/lib/env/index.ts`  | 統合エクスポート                                               |

### 定数ファイル

| ファイル                                 | 説明                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------- |
| `src/shared/lib/constants/defaults.ts`   | サイトデフォルト値（name, description）                              |
| `src/shared/lib/constants/session.ts`    | セッション設定（expiresIn, updateAge, cookieCacheMaxAge）            |
| `src/shared/lib/constants/pagination.ts` | ページネーション設定（admin/public）                                 |
| `src/shared/lib/constants/urls.ts`       | URL ヘルパー関数（getBaseUrl, getAppUrl, getAdminUrl, getPublicUrl） |
| `src/shared/lib/constants/index.ts`      | バレルエクスポート                                                   |

## 変更ファイル

### 環境変数バリデーション適用

- `next.config.ts` - ビルド時検証のためのインポート追加

### URL フォールバック移行

- `src/app/sitemap.ts`
- `src/app/robots.ts`
- `src/app/(public)/_shared/lib/seo/metadata-factory.ts`
- `src/app/(public)/_shared/lib/seo/json-ld-config.ts`
- `src/app/(public)/_shared/components/seo/JsonLd.tsx`
- `src/app/(public)/blog/[slug]/page.tsx`
- `src/app/(public)/news/[id]/page.tsx`
- `src/app/(public)/p/[slug]/page.tsx`
- `src/app/(public)/spaces/[id]/page.tsx`
- `src/shared/lib/auth.ts`
- `src/shared/lib/auth-client.ts`
- `src/shared/lib/email-service.ts`
- `src/app/(admin)/admin/(dashboard)/_shared/actions/staff-invitation.ts`
- `src/app/api/admin/login-tokens/route.ts`

### サービス名移行

- `src/app/layout.tsx` - metadata
- `src/shared/lib/email.ts` - EMAIL_FROM_NAME
- `src/app/(public)/_shared/components/layouts/Header.tsx`
- `src/app/(public)/_shared/components/layouts/Footer.tsx`
- `src/app/(public)/about/page.tsx`

### セッション設定移行

- `src/shared/lib/auth.ts` - SESSION_CONFIG 適用

## 使用方法

### 環境変数

```typescript
import { env } from "@/shared/lib/env";

// サーバーサイド
console.log(env.DATABASE_URL);
console.log(env.BETTER_AUTH_SECRET);

// クライアントサイド
console.log(env.NEXT_PUBLIC_BASE_URL);
```

### 定数

```typescript
import {
  SITE_DEFAULTS,
  SESSION_CONFIG,
  getBaseUrl,
  getAdminUrl,
} from "@/shared/lib/constants";

// サイト名フォールバック
const siteName = settings?.siteName ?? SITE_DEFAULTS.name;

// URL 構築
const url = getBaseUrl(); // 'https://example.com' or env value
const adminUrl = getAdminUrl("/reservations/123"); // 'https://example.com/admin/reservations/123'

// セッション設定
const session = {
  expiresIn: SESSION_CONFIG.expiresIn, // 30日（秒）
  updateAge: SESSION_CONFIG.updateAge, // 1日（秒）
};
```

## 環境変数定義

### サーバー専用（必須）

| 変数                 | 説明              | 検証                 |
| -------------------- | ----------------- | -------------------- |
| `DATABASE_URL`       | PostgreSQL接続URL | `z.string().url()`   |
| `BETTER_AUTH_SECRET` | 認証シークレット  | `z.string().min(32)` |

### サーバー専用（オプション）

| 変数                   | 説明                    |
| ---------------------- | ----------------------- |
| `BETTER_AUTH_URL`      | 認証ベースURL           |
| `RESEND_API_KEY`       | Resend APIキー          |
| `GOOGLE_CLIENT_ID`     | Google OAuth            |
| `GOOGLE_CLIENT_SECRET` | Google OAuth            |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile    |
| `ENCRYPTION_KEY`       | 暗号化キー（64文字hex） |
| `CRON_SECRET`          | Cronジョブ認証          |

### クライアント（必須）

| 変数                   | 説明          |
| ---------------------- | ------------- |
| `NEXT_PUBLIC_BASE_URL` | 公開サイトURL |
| `NEXT_PUBLIC_APP_URL`  | アプリURL     |

### クライアント（オプション）

| 変数                             | 説明               |
| -------------------------------- | ------------------ |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Turnstile Site Key |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID`  | Google Analytics   |

## 検証

```bash
# 型チェック
bun run type-check

# lint
bun run lint

# ビルド（環境変数検証スキップ）
SKIP_ENV_VALIDATION=true bun run build
```
