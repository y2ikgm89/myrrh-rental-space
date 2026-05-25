---
paths:
  - src/shared/lib/**
  - src/app/(admin)/**
  - src/app/(public)/**
---

# server-only パターンルール

> Next.js Data Access Layer / ビルド時サーバー境界強制

## `server-only` の役割

`import 'server-only'` は webpack/Turbopack の `browser` 条件を使い、
クライアントバンドルに含まれた場合に**ビルド時エラー**を発生させる。

| 方式                   | 境界制御                     | 保護レベル                                    |
| ---------------------- | ---------------------------- | --------------------------------------------- |
| `import 'server-only'` | バンドラーレベル（ビルド時） | **最強**：クライアント混入をビルドで検出      |
| `'use server'`         | ランタイム（RPC 境界）       | 関数を Server Action に変換（DB保護ではない） |
| `'use cache'`          | ランタイム（キャッシュ境界） | キャッシュ関数（DB保護ではない）              |

`'use server'` / `'use cache'` はランタイム境界を制御するが、
**`server-only` はバンドラーレベルでクライアントへの混入を物理的に防ぐ**。

## 追加対象ファイル（Data Access Layer）

以下のファイルはシークレット・DB接続・権限定義を含むため `server-only` が必須:

### 共有ライブラリ（`src/shared/lib/`）

| ファイル                                     | 理由                                                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/shared/lib/prisma.ts`                   | DB 接続文字列・PrismaClient                                                                          |
| `src/shared/lib/admin-auth.ts`               | 管理者用 Better Auth 設定・セッション検証                                                            |
| `src/shared/lib/customer-auth.ts`            | 顧客用 Better Auth 設定・セッション検証                                                              |
| `src/shared/lib/errors/logger.ts`            | サーバー専用構造化ロガー                                                                             |
| `src/shared/lib/env/server.ts`               | 全サーバーシークレット（`DATABASE_URL`、`BETTER_AUTH_SECRET` 等）                                    |
| `src/shared/lib/crypto.ts`                   | `ENCRYPTION_KEY` 読み取り・暗号化/復号化関数                                                         |
| `src/shared/lib/email.ts`                    | `RESEND_API_KEY` 読み取り・Resend クライアント生成                                                   |
| `src/shared/lib/email-service.ts`            | Resend + DB アクセス（メール送信サービス）                                                           |
| `src/shared/lib/google-calendar.ts`          | DB から OAuth シークレットを復号して Google Calendar API 呼び出し                                    |
| `src/shared/lib/google-oauth-credentials.ts` | `GOOGLE_CLIENT_ID/SECRET` + DB 読み取り                                                              |
| `src/shared/lib/cloudflare.ts`               | DB から Cloudflare API Token を復号してキャッシュパージ                                              |
| `src/shared/lib/turnstile.ts`                | DB から Turnstile Secret Key を復号してトークン検証                                                  |
| `src/shared/lib/calendar-sync.ts`            | DB + Google Calendar API（双方向同期）                                                               |
| `src/shared/lib/analytics/ga-data-api.ts`    | Google Analytics サービスアカウント認証                                                              |
| `src/shared/lib/r2/client.ts`                | Cloudflare R2 S3Client singleton・API トークン読み取り                                               |
| `src/shared/lib/r2/upload.ts`                | `@aws-sdk/client-s3` の `PutObjectCommand` 呼び出し                                                  |
| `src/shared/lib/r2/delete.ts`                | `@aws-sdk/client-s3` の `DeleteObject` / `DeleteObjectsCommand`                                      |
| `src/shared/lib/stripe.ts`                   | Stripe SDK 直接 import + DB 復号して `Stripe` クライアント生成（PR #232 で `@/admin/lib/` から移管） |
| `src/shared/lib/ssrf-guard.ts`               | `node:dns/promises` 直接 import で DNS rebinding 対策（PR #232 で `@/admin/lib/` から移管）          |

### 管理画面ライブラリ（`src/app/(admin)/.../_shared/lib/`）

| ファイル                                                   | 理由                                                                                                                                                                                                              |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/(admin)/.../_shared/lib/action-auth.ts`           | 権限チェック関数群                                                                                                                                                                                                |
| `src/app/(admin)/.../_shared/lib/permissions.ts`           | server-only セッション/Prisma 連携ヘルパー（純粋 RBAC は `@/shared/lib/admin-permissions` SSoT、本ファイルは `userHasPermission` / `userHasResourceAccess` / `canAccessAdmin` / `checkReadPermissionFor` を担う） |
| `src/app/(admin)/.../_shared/lib/audit.ts`                 | 監査ログ記録関数                                                                                                                                                                                                  |
| `src/app/(admin)/.../_shared/lib/server-action-helpers.ts` | `admin-auth.ts`（`server-only`）を import する Server Action HOF                                                                                                                                                  |
| `src/app/(admin)/.../_shared/lib/api-keys/resend.ts`       | Resend SDK（Node.js 専用）の直接 import                                                                                                                                                                           |
| `src/app/(admin)/.../_shared/lib/api-keys/index.ts`        | barrel — `resend.ts` を推移的に含むため全体を server-only 化                                                                                                                                                      |

## 追加不要なファイル

| ファイル                                | 理由                                             |
| --------------------------------------- | ------------------------------------------------ |
| `src/shared/lib/logger.ts`              | クライアントコンポーネントでも使用する汎用ロガー |
| `src/app/(admin)/.../actions/*.ts`      | `'use server'` ディレクティブで境界制御済み      |
| `src/app/(public)/_shared/actions/*.ts` | `'use cache'` ディレクティブで境界制御済み       |

## 実装パターン

```typescript
// NG: 独自実装（ランタイムチェックのみ → バンドルには含まれる）
if (typeof window !== "undefined") throw new Error("server only");

// OK: npm パッケージ（ビルド時にクライアントバンドルへの混入を防ぐ）
import "server-only";

// ファイル先頭に1行追加（JSDocコメントの後、最初のimportの前）
import "server-only";

import { PrismaClient } from "...";
```

## 追加方法

```bash
# インストール（既にインストール済み）
bun add server-only

# 各ファイル先頭の最初の import の前に1行追加
import 'server-only'
```

## 検出 grep（監査用）

Node-only npm パッケージを直接 import しているのに `import "server-only"` マーカーが欠落しているファイルを検出:

```bash
grep -rlE '^import .+ from "(ical-generator|googleapis|resend|@touch4it|nodemailer|stripe|google-auth-library|@google-analytics|@aws-sdk/client-s3|node:)' src/ | while read f; do
  head -30 "$f" | grep -q '^import "server-only"' || echo "MISSING: $f"
done
```

追加対象（Data Access Layer）の変更時・新規 SDK 統合時・監査時に実行する。Explore subagent の「違反なし」報告は grep hallucination リスクがあるため、このコマンドでの ground truth 検証を必須とする。

## Dual-use barrel 分離パターン

1 つのモジュールが「Node-only SDK 依存のビルダー」と「純粋関数（URL 組立等）」を両方提供する場合、同一 barrel から `export *` / named export すると、Client Component が純粋関数を import した瞬間 Node SDK が client bundle に引き込まれ Turbopack エラーになる。

**canonical 分離パターン（`@/shared/lib/ical` が参照実装）**:

| ファイル                   | 保護        | 内容                                     |
| -------------------------- | ----------- | ---------------------------------------- |
| `ical/index.ts`            | server-only | ICS ビルダー（ical-generator 依存）      |
| `ical/urls.ts`             | client-safe | Add to Calendar URL ビルダー（純粋関数） |
| `ical/uid.ts` / `types.ts` | client-safe | UID・型定義                              |

Client Component / SSR Email コンポーネントは必ずサブパスから import する（`@/shared/lib/ical/urls`）。barrel 経由（`@/shared/lib/ical`）は `import "server-only"` ガードでビルドエラーになる。

## 禁止事項

1. **独自 `server-only` 実装禁止**
   - `typeof window` チェック等はランタイムのみ → バンドル保護にならない
   - npm `server-only` パッケージを使用する

2. **`server-only` ファイルをクライアントコンポーネントに import 禁止**
   - `'use client'` ファイルから import するとビルドエラー（これが目的）
   - クライアントで必要なロジックは `server-only` なしの別ファイルに切り出す

3. **`server-only` 対象ファイルに誤ってクライアントコードを追加禁止**
   - `use client` hooks（`useState`, `useEffect` 等）はクライアント限定 → 別ファイルに

## Gotchas

- **`@/shared/lib/errors` はクライアントセーフのみ** — `getErrorMessage`, `ErrorCategory`, `ErrorSeverity`, `normalizeError`, `ReservationOverlapError` のみ。Client Component から import 可能
- **`@/shared/lib/errors/server` はサーバー専用** — `logError`, `safeFetch`, `criticalFetch`, `createErrorLogger`。Client Component から import すると `server-only` ビルドエラー。上記クライアントセーフシンボルも全て re-export するので、サーバー側は `/server` に統一できる
- **バレルファイルに server-only と client-safe を混在させない** — `import "server-only"` を含むモジュールを re-export したバレルは丸ごと server-only 扱いになる（Client Component からは一切使用不可）
- **`"use client"` モジュールから export された非-Component 関数を Server Component から呼べない** — Client Reference 化して `Attempted to call X() from the server but X is on the client` ランタイムエラー。pure helper（pure な計算・style 組み立て関数）は `"use client"` 境界外の別 module に分離する。`SectionWrapper.tsx` の pure helpers を `section-style-helpers.ts` に分離した参照実装あり（2026-05-05、22 consumer 一括 refactor）。Component 経由（`<Component prop={value} />` で渡す）または props 経由のみが Server→Client function 伝送の許可パターン
- **`"use client"` directive は hooks 使用時のみ必要** — `useState` / `useEffect` / `useRef` / `useContext` 等 client hooks を使わず、children として `"use client"` Component を render するだけなら Server Component で十分（公式推奨）。新規 / 既存コンポーネントを編集する際、hooks の有無を確認し不要なら `"use client"` を削除する
