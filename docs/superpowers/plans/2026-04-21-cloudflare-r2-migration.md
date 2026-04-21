# Cloudflare R2 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Supabase Storage を Cloudflare R2 に完全置換し、`@aws-sdk/client-s3` v3 による S3 互換 API 経由で画像アップロード・削除を行う。後方互換性なし、リリース前のクリーン実装。

**Architecture:** 単一 R2 bucket + key prefix 構成（`spaces/` / `posts/` / `site/` / `media/`）、server-only な `S3Client` singleton、Server Action プロキシ方式（Presigned URL 不使用）、カスタムドメイン公開 URL。既存の `src/shared/lib/supabase.ts` と `src/shared/lib/storage.ts` は削除し、`src/shared/lib/r2/{client,keys,upload,delete}.ts` の 4 ファイル構成に置換する。`Media.bucket` フィールドは prefix 値を保存する意味に再解釈（スキーマ変更なし、値 `"media"` のまま書き込み継続）。

**Tech Stack:** Cloudflare R2 (S3 互換 API) / `@aws-sdk/client-s3` v3 / Next.js 16 Server Actions / Prisma 7 / TypeScript 6 / Bun 1.3 / `@t3-oss/env-nextjs`

---

## Prerequisites（ユーザー側の事前作業）

実装着手前に以下を完了しておくこと。未完了でも実装は進むが、動作確認は不可能。

1. Cloudflare ダッシュボードで R2 バケット作成
   - バケット名（例）: `myrrh-media`（以降、env `R2_BUCKET_NAME` で参照）
   - Location: 自動（R2 はリージョン自動選択、`auto`）
2. R2 API Token 発行
   - Type: **Object Read & Write**
   - Scope: 作成したバケットに限定
   - Access Key ID / Secret Access Key を記録
3. Account ID 取得
   - Cloudflare ダッシュボード右サイドバー / R2 概要ページから取得
4. カスタムドメイン接続（本番環境）
   - 例: `media.<yourdomain>` を Cloudflare DNS で R2 バケットにバインド
   - 未用意時は dev 用 `pub-<hash>.r2.dev` を `R2_PUBLIC_URL` に仮設定
5. CORS 設定（アップロードは Server Action プロキシ経由なので不要、削除可）

env 値の例:

```
R2_ACCOUNT_ID=abc123def456...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=myrrh-media
R2_PUBLIC_URL=https://media.example.com        # 末尾スラッシュなし
```

---

## File Structure

### Create

- `src/shared/lib/r2/client.ts` — `server-only` singleton `S3Client`（`globalThis` キャッシュ）
- `src/shared/lib/r2/keys.ts` — `STORAGE_PREFIXES`, `StoragePrefix`, `generateStorageKey()`, `buildPublicUrl()`, `extractKeyFromUrl()`（client-safe pure utilities）
- `src/shared/lib/r2/upload.ts` — `server-only` `uploadFile()` / `uploadFiles()`, `validateFile()`, `UploadResult` 型, `DEFAULT_VALIDATION` / `IMAGE_VALIDATION` 定数
- `src/shared/lib/r2/delete.ts` — `server-only` `deleteFile()` / `deleteFiles()`
- `__tests__/unit/shared/lib/r2/keys.test.ts` — pure utilities のテスト
- `__tests__/unit/shared/lib/r2/upload.test.ts` — upload + validation のテスト（`mock.module("@aws-sdk/client-s3")` 使用）
- `__tests__/unit/shared/lib/r2/delete.test.ts` — delete のテスト

### Modify

- `package.json` — `@supabase/supabase-js` 削除、`@aws-sdk/client-s3@^3` 追加
- `bun.lock` — 上記の再生成
- `src/shared/lib/env/server.ts` — R2 env 追加、`validateProductionEnv` に R2 必須チェック追加
- `src/shared/lib/env/client.ts` — `NEXT_PUBLIC_SUPABASE_*` 削除
- `.env.example` — R2 env 例に差し替え
- `next.config.ts` — `remotePatterns` の `*.supabase.co` エントリを R2 カスタムドメインに変更
- `src/proxy.ts` — CSP の `img-src` / `connect-src` 更新
- `Dockerfile` — `NEXT_PUBLIC_SUPABASE_*` ARG 削除
- `cloudbuild.yaml` — `_NEXT_PUBLIC_SUPABASE_*` substitutions 削除、R2 ランタイム secret 追加
- `src/shared/domain/media/commands.ts` — import path `@/shared/lib/supabase` / `@/shared/lib/storage` を `@/shared/lib/r2/*` に変更、`STORAGE_BUCKETS.MEDIA` を `STORAGE_PREFIXES.MEDIA` に変更
- `prisma/seed.ts` — Supabase URL を含む placeholder 画像 URL を R2 URL（または `images.unsplash.com`）に変更
- `src/shared/lib/terms-templates.ts` — プライバシーポリシー本文の Supabase Storage 言及を Cloudflare R2 に置換
- `__tests__/unit/domain/media/commands.test.ts` — `mock.module("@/shared/lib/storage")` を `mock.module("@/shared/lib/r2/upload")` / `mock.module("@/shared/lib/r2/delete")` に変更
- `__tests__/setup.ts` — Supabase 関連の env mock を R2 に置換（必要なら）
- `CLAUDE.md` — SSoT テーブル（存在すれば）から Supabase 言及を削除、R2 追加
- `.claude/rules/api-routes.md` — env / Storage 言及を R2 化
- `.claude/rules/gotchas.md` — Supabase 言及を削除
- `.claude/rules/ops/deployment-patterns.md` — Dockerfile ARG / cloudbuild 例を R2 に更新
- `.claude/rules/external-api-retry-patterns.md` — Supabase 言及を削除（該当あれば）
- `.claude/skills/cloud-run-debug/SKILL.md` — Supabase 診断セクションを R2 化
- `.claude/agents/db-migration-reviewer.md` — Supabase 言及削除
- `.claude/agents/security-reviewer.md` — Supabase 言及削除
- `docs/architecture/ARCHITECTURE.md` — ストレージ層の記述を R2 化
- `docs/architecture/TECH_STACK.md` — Supabase Storage → Cloudflare R2
- `docs/architecture/DATABASE_DESIGN.md` — Media モデルの Storage 説明
- `docs/operations/deployment.md` — Supabase secret セクション削除、R2 secret 追加
- `docs/operations/README.md` — 外部依存リスト更新
- `docs/guides/testing.md` — test env 設定 R2 化
- `docs/guides/prisma.md` — Storage パス記述
- `docs/quality/TEST_COVERAGE_ANALYSIS.md` — Supabase 言及
- `docs/requirements/settings.md` — Storage 要件記述
- `docs/requirements/posts.md` — 画像ストレージ記述
- `docs/reference/codex-rules/deployment-patterns.md` — codex 用 ruleset 同期更新
- `docs/plans/README.md` — plans index
- `docs/plans/{060-ci-quality-improvements,052-hardcode-config-centralization,042-complete-separation-architecture,030-media-management,026-remove-as-const-assertions,007-tiptap,002-stripe-payment-settings,2026-02-28-csp-nonce-migration,2026-02-28-csp-nonce-migration-design}.md` — 過去 plan 内の Supabase 言及（履歴ドキュメントのため言及削除ではなく「完了当時の名称」として注記に変更、または R2 に書き換え。セッション中に方針を Task 13 で確定）

### Delete

- `src/shared/lib/supabase.ts`
- `src/shared/lib/storage.ts`
- `__tests__/unit/shared/lib/storage.test.ts`（新規 `r2/*.test.ts` で置換）

---

## Task 1: Swap package dependencies

**Files:**

- Modify: `package.json`
- Modify: `bun.lock`（自動再生成、編集禁止ファイルだが CLI 経由で更新可能）

- [ ] **Step 1: `@supabase/supabase-js` を削除**

```bash
bun remove @supabase/supabase-js
```

- [ ] **Step 2: `@aws-sdk/client-s3` を追加**

```bash
bun add @aws-sdk/client-s3@^3
```

- [ ] **Step 3: `package.json` の `dependencies` で差し替えを確認**

```bash
grep -E '"@(aws-sdk|supabase)"' package.json
```

Expected: `"@aws-sdk/client-s3": "^3.x.x"` のみ出力される（Supabase エントリなし）

- [ ] **Step 4: `bun install --frozen-lockfile` で整合性確認**

```bash
bun install --frozen-lockfile
```

Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lock
git commit -m "chore(deps): swap @supabase/supabase-js for @aws-sdk/client-s3"
```

---

## Task 2: Update env schemas (server + client + .env.example)

**Files:**

- Modify: `src/shared/lib/env/server.ts`
- Modify: `src/shared/lib/env/client.ts`
- Modify: `.env.example`

- [ ] **Step 1: `src/shared/lib/env/server.ts` の `serverEnv.server` に R2 env を追加**

以下の 5 変数を `server: {}` ブロック内、`NODE_ENV` の直前に追加:

```typescript
    // Cloudflare R2（本番必須 - ランタイム検証）
    // 画像ストレージ（S3 互換 API）
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET_NAME: z.string().optional(),
    R2_PUBLIC_URL: z.string().url().optional(),
```

同じく `runtimeEnv:` ブロック内に:

```typescript
    R2_ACCOUNT_ID: process.env["R2_ACCOUNT_ID"],
    R2_ACCESS_KEY_ID: process.env["R2_ACCESS_KEY_ID"],
    R2_SECRET_ACCESS_KEY: process.env["R2_SECRET_ACCESS_KEY"],
    R2_BUCKET_NAME: process.env["R2_BUCKET_NAME"],
    R2_PUBLIC_URL: process.env["R2_PUBLIC_URL"],
```

- [ ] **Step 2: `validateProductionEnv()` に R2 必須チェックを追加**

`validateProductionEnv()` 関数内の `requiredInProd` 配列を以下に置換:

```typescript
const requiredInProd = [
  { name: "ENCRYPTION_KEY", value: serverEnv.ENCRYPTION_KEY },
  { name: "CRON_SECRET", value: serverEnv.CRON_SECRET },
  { name: "ADMIN_LOGIN_TOKEN", value: serverEnv.ADMIN_LOGIN_TOKEN },
  // Cloudflare R2 — 画像ストレージ必須
  { name: "R2_ACCOUNT_ID", value: serverEnv.R2_ACCOUNT_ID },
  { name: "R2_ACCESS_KEY_ID", value: serverEnv.R2_ACCESS_KEY_ID },
  { name: "R2_SECRET_ACCESS_KEY", value: serverEnv.R2_SECRET_ACCESS_KEY },
  { name: "R2_BUCKET_NAME", value: serverEnv.R2_BUCKET_NAME },
  { name: "R2_PUBLIC_URL", value: serverEnv.R2_PUBLIC_URL },
  // Google OAuth は env / Secret Manager を正本とする
];
```

- [ ] **Step 3: `src/shared/lib/env/client.ts` から Supabase を削除**

以下 4 箇所を削除:

- `client:` ブロック内の `NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),`
- `client:` ブロック内の `NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),`
- `runtimeEnv:` ブロック内の `NEXT_PUBLIC_SUPABASE_URL: process.env["NEXT_PUBLIC_SUPABASE_URL"],`
- `runtimeEnv:` ブロック内の `NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"],`

結果、`clientEnv.client` は以下のみになる:

```typescript
  client: {
    NEXT_PUBLIC_BASE_URL: z.string().url(),
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
    NEXT_PUBLIC_GA_MEASUREMENT_ID: z.string().optional(),
  },
```

- [ ] **Step 4: `.env.example` を更新**

`NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` の 2 行を削除し、代わりに Server-only section（`# ----- Required (production only) -----` の前）に以下を追加:

```
# ----------------------------------------------
# Cloudflare R2 (画像ストレージ / 本番必須)
# ----------------------------------------------
R2_ACCOUNT_ID="your-cloudflare-account-id"
R2_ACCESS_KEY_ID="your-r2-access-key-id"
R2_SECRET_ACCESS_KEY="your-r2-secret-access-key"
R2_BUCKET_NAME="myrrh-media"
R2_PUBLIC_URL="https://media.example.com"
```

- [ ] **Step 5: Type-check**

```bash
bun run type-check
```

Expected: exit 0

- [ ] **Step 6: Commit**

```bash
git add src/shared/lib/env/server.ts src/shared/lib/env/client.ts .env.example
git commit -m "feat(env): add R2_* server env, drop NEXT_PUBLIC_SUPABASE_*"
```

---

## Task 3: Create R2 client module (singleton S3Client)

**Files:**

- Create: `src/shared/lib/r2/client.ts`

- [ ] **Step 1: ディレクトリ作成**

```bash
mkdir -p src/shared/lib/r2
```

- [ ] **Step 2: `src/shared/lib/r2/client.ts` を作成**

```typescript
/**
 * Cloudflare R2 S3Client Singleton（server-only）
 *
 * - `globalThis` ベースの singleton（hot reload でのコネクション枯渇を防ぐ、
 *   Prisma と同じパターン）
 * - region は `"auto"`（Cloudflare R2 公式要件、SDK 側が region 値を要求するため）
 * - endpoint は Account ID ベースの R2 S3 API エンドポイント
 * - `forcePathStyle` は設定しない（Cloudflare 公式例に従い virtual-hosted を使用）
 *
 * @see https://developers.cloudflare.com/r2/api/s3/api/
 * @see https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/
 */

import "server-only";

import { S3Client } from "@aws-sdk/client-s3";
import { serverEnv } from "@/shared/lib/env/server";

type GlobalStore = {
  r2Client?: S3Client;
};

const globalStore = globalThis as unknown as GlobalStore;
const isProduction = serverEnv.NODE_ENV === "production";

/**
 * R2 S3 API エンドポイント URL を構築する。
 *
 * 例: https://<ACCOUNT_ID>.r2.cloudflarestorage.com
 *
 * @throws Error R2_ACCOUNT_ID が未設定の場合
 */
function buildR2Endpoint(): string {
  const accountId = serverEnv.R2_ACCOUNT_ID;
  if (!accountId) {
    throw new Error(
      "R2_ACCOUNT_ID is not configured. Set it in the environment variables.",
    );
  }
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

/**
 * R2 S3Client を取得する（遅延初期化 + singleton）。
 *
 * モジュールロード時に credentials 欠損で失敗させると、
 * ビルド時や env 未設定のローカル環境でも import 可能にする。
 * 実際の send() 時点で存在しなければエラーになる。
 *
 * @throws Error R2 env が未設定の場合
 */
export function getR2Client(): S3Client {
  if (globalStore.r2Client) return globalStore.r2Client;

  const accessKeyId = serverEnv.R2_ACCESS_KEY_ID;
  const secretAccessKey = serverEnv.R2_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2 credentials are not configured. Set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.",
    );
  }

  const client = new S3Client({
    region: "auto",
    endpoint: buildR2Endpoint(),
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  if (!isProduction) {
    globalStore.r2Client = client;
  }
  return client;
}

/**
 * R2 が設定済みかを判定する（public URL・credentials・bucket 名の存在確認）。
 *
 * Domain / UI 層で「R2 未設定時はエラーメッセージを返す」判定に使用する。
 */
export function isR2Configured(): boolean {
  return Boolean(
    serverEnv.R2_ACCOUNT_ID &&
    serverEnv.R2_ACCESS_KEY_ID &&
    serverEnv.R2_SECRET_ACCESS_KEY &&
    serverEnv.R2_BUCKET_NAME &&
    serverEnv.R2_PUBLIC_URL,
  );
}

/**
 * R2 バケット名（env から取得、未設定時は throw）。
 * PutObjectCommand / DeleteObjectCommand の Bucket パラメータで使用する。
 */
export function getR2BucketName(): string {
  const bucket = serverEnv.R2_BUCKET_NAME;
  if (!bucket) {
    throw new Error(
      "R2_BUCKET_NAME is not configured. Set it in the environment variables.",
    );
  }
  return bucket;
}
```

- [ ] **Step 3: Type-check**

```bash
bun run type-check
```

Expected: exit 0（`@aws-sdk/client-s3` の型が見つからない場合は Task 1 未実施 → 戻ってやり直し）

- [ ] **Step 4: Commit**

```bash
git add src/shared/lib/r2/client.ts
git commit -m "feat(r2): add S3Client singleton for Cloudflare R2"
```

---

## Task 4: Create R2 keys module (pure utilities, TDD)

**Files:**

- Create: `__tests__/unit/shared/lib/r2/keys.test.ts`
- Create: `src/shared/lib/r2/keys.ts`
- Modify: `package.json` — test スクリプトに `__tests__/unit/shared/lib/r2` バッチ追加

- [ ] **Step 1: テスト作成 `__tests__/unit/shared/lib/r2/keys.test.ts`**

```typescript
import { describe, test, expect } from "bun:test";
import {
  STORAGE_PREFIXES,
  generateStorageKey,
  buildPublicUrl,
  extractKeyFromUrl,
  type StoragePrefix,
} from "@/shared/lib/r2/keys";

describe("STORAGE_PREFIXES", () => {
  test("4 つの prefix をすべて持つ", () => {
    expect(STORAGE_PREFIXES.SPACES).toBe("spaces");
    expect(STORAGE_PREFIXES.POSTS).toBe("posts");
    expect(STORAGE_PREFIXES.SITE).toBe("site");
    expect(STORAGE_PREFIXES.MEDIA).toBe("media");
  });
});

describe("generateStorageKey", () => {
  test("prefix + folder + timestamp + uuid + ext で key を生成", () => {
    const key = generateStorageKey({
      prefix: STORAGE_PREFIXES.SPACES,
      filename: "photo.jpg",
      folder: "space-1",
    });
    expect(key).toMatch(/^spaces\/space-1\/\d+-[0-9a-f-]+\.jpg$/);
  });

  test("folder 省略時は prefix 直下に配置", () => {
    const key = generateStorageKey({
      prefix: STORAGE_PREFIXES.MEDIA,
      filename: "doc.pdf",
    });
    expect(key).toMatch(/^media\/\d+-[0-9a-f-]+\.pdf$/);
  });

  test("大文字拡張子は小文字化", () => {
    const key = generateStorageKey({
      prefix: STORAGE_PREFIXES.POSTS,
      filename: "IMAGE.PNG",
    });
    expect(key).toMatch(/\.png$/);
  });

  test("拡張子なしファイルは ext 空で生成", () => {
    const key = generateStorageKey({
      prefix: STORAGE_PREFIXES.MEDIA,
      filename: "noext",
    });
    expect(key).toMatch(/^media\/\d+-[0-9a-f-]+$/);
  });
});

describe("buildPublicUrl", () => {
  test("publicUrl + key を連結", () => {
    const url = buildPublicUrl(
      "spaces/abc/123.jpg",
      "https://media.example.com",
    );
    expect(url).toBe("https://media.example.com/spaces/abc/123.jpg");
  });

  test("publicUrl の末尾スラッシュは正規化", () => {
    const url = buildPublicUrl("media/x.jpg", "https://media.example.com/");
    expect(url).toBe("https://media.example.com/media/x.jpg");
  });

  test("key 先頭のスラッシュは正規化", () => {
    const url = buildPublicUrl("/spaces/y.jpg", "https://media.example.com");
    expect(url).toBe("https://media.example.com/spaces/y.jpg");
  });
});

describe("extractKeyFromUrl", () => {
  test("public URL から key 部分のみ抽出", () => {
    const key = extractKeyFromUrl(
      "https://media.example.com/spaces/abc/123.jpg",
      "https://media.example.com",
    );
    expect(key).toBe("spaces/abc/123.jpg");
  });

  test("末尾スラッシュ混在でも抽出", () => {
    const key = extractKeyFromUrl(
      "https://media.example.com/media/x.png",
      "https://media.example.com/",
    );
    expect(key).toBe("media/x.png");
  });

  test("public URL に一致しない URL は null", () => {
    const key = extractKeyFromUrl(
      "https://other.example.com/foo.jpg",
      "https://media.example.com",
    );
    expect(key).toBeNull();
  });
});

describe("StoragePrefix 型", () => {
  test("各 prefix は StoragePrefix に代入可能", () => {
    const values: StoragePrefix[] = [
      STORAGE_PREFIXES.SPACES,
      STORAGE_PREFIXES.POSTS,
      STORAGE_PREFIXES.SITE,
      STORAGE_PREFIXES.MEDIA,
    ];
    expect(values).toHaveLength(4);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

```bash
bun test __tests__/unit/shared/lib/r2/keys.test.ts
```

Expected: FAIL（`Cannot find module '@/shared/lib/r2/keys'` 等）

- [ ] **Step 3: `src/shared/lib/r2/keys.ts` を実装**

```typescript
/**
 * Cloudflare R2 Object Key ユーティリティ（client-safe pure functions）
 *
 * Key 構造: `{prefix}/{folder}/{timestamp}-{uuid}.{ext}`
 *
 * - `prefix`: `STORAGE_PREFIXES` の 4 値のいずれか（旧 Supabase Bucket 名相当）
 * - `folder`: 任意サブパス（spaceId / postId / logo 等のスコープ）
 * - `timestamp-uuid.ext`: 衝突回避のためのランダム化ファイル名
 *
 * Public URL: `{R2_PUBLIC_URL}/{key}` で Cloudflare R2 カスタムドメインから配信。
 * Server Action プロキシ方式で保存・削除するため Presigned URL は使わない。
 */

export const STORAGE_PREFIXES = {
  SPACES: "spaces",
  POSTS: "posts",
  SITE: "site",
  MEDIA: "media",
} as const;

export type StoragePrefix =
  (typeof STORAGE_PREFIXES)[keyof typeof STORAGE_PREFIXES];

/**
 * ファイル名から拡張子（小文字、ドットなし）を抽出する。
 * 拡張子がない場合は空文字を返す。
 */
function getFileExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  if (idx < 0 || idx === filename.length - 1) return "";
  return filename.slice(idx + 1).toLowerCase();
}

type GenerateStorageKeyInput = {
  prefix: StoragePrefix;
  filename: string;
  /** 任意のサブフォルダ（例: spaceId / postId / logo）*/
  folder?: string;
};

/**
 * 衝突回避つきの R2 Object Key を生成する。
 *
 * @example
 *   generateStorageKey({ prefix: "spaces", folder: "abc", filename: "hero.jpg" })
 *   // => "spaces/abc/1713654000000-550e8400-e29b-41d4-a716-446655440000.jpg"
 */
export function generateStorageKey(input: GenerateStorageKeyInput): string {
  const ext = getFileExtension(input.filename);
  const uniqueId = crypto.randomUUID();
  const timestamp = Date.now();
  const folderSegment = input.folder ? `${input.folder}/` : "";
  const extSegment = ext ? `.${ext}` : "";
  return `${input.prefix}/${folderSegment}${timestamp}-${uniqueId}${extSegment}`;
}

/**
 * 末尾スラッシュを除去する（URL 結合時の正規化）。
 */
function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/**
 * 先頭スラッシュを除去する（key 正規化）。
 */
function stripLeadingSlash(key: string): string {
  return key.startsWith("/") ? key.slice(1) : key;
}

/**
 * R2 Object Key から公開 URL を構築する。
 *
 * @param key 例: "spaces/abc/123.jpg"
 * @param publicUrl カスタムドメイン URL（例: "https://media.example.com"）
 */
export function buildPublicUrl(key: string, publicUrl: string): string {
  return `${stripTrailingSlash(publicUrl)}/${stripLeadingSlash(key)}`;
}

/**
 * 公開 URL から Object Key 部分を抽出する。
 * Public URL と一致しない URL の場合は null を返す。
 *
 * @param url 例: "https://media.example.com/spaces/abc/123.jpg"
 * @param publicUrl カスタムドメイン URL
 */
export function extractKeyFromUrl(
  url: string,
  publicUrl: string,
): string | null {
  const base = stripTrailingSlash(publicUrl);
  if (!url.startsWith(`${base}/`)) return null;
  return url.slice(base.length + 1);
}
```

- [ ] **Step 4: `package.json` の `test:unit` と `test` スクリプトに新テストバッチ追加**

`test:unit` / `test` の両スクリプトで、`__tests__/unit/shared` バッチの後ろに以下を追加（既に `__tests__/unit/shared` が存在するので、その配下として自動実行される想定）。ただし明示的な batch にしたい場合は以下を追加:

（`__tests__/unit/shared` で一括実行されるため追加は不要。Step 5 で確認）

- [ ] **Step 5: テスト実行して成功を確認**

```bash
bun test __tests__/unit/shared/lib/r2/keys.test.ts
```

Expected: PASS（全 11 テストが green）

- [ ] **Step 6: Commit**

```bash
git add src/shared/lib/r2/keys.ts __tests__/unit/shared/lib/r2/keys.test.ts
git commit -m "feat(r2): add object key utilities (generateStorageKey/buildPublicUrl/extractKeyFromUrl)"
```

---

## Task 5: Create R2 upload module (TDD)

**Files:**

- Create: `__tests__/unit/shared/lib/r2/upload.test.ts`
- Create: `src/shared/lib/r2/upload.ts`

- [ ] **Step 1: テスト作成 `__tests__/unit/shared/lib/r2/upload.test.ts`**

```typescript
import { describe, test, expect, mock, beforeEach } from "bun:test";

// mock @aws-sdk/client-s3 before importing upload module
const sendMock = mock(async () => ({ ETag: '"abc123"' }));
mock.module("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = sendMock;
  },
  PutObjectCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: {
    NODE_ENV: "test",
    R2_ACCOUNT_ID: "test-account",
    R2_ACCESS_KEY_ID: "test-key",
    R2_SECRET_ACCESS_KEY: "test-secret",
    R2_BUCKET_NAME: "test-bucket",
    R2_PUBLIC_URL: "https://media.test.example.com",
  },
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: mock(() => {}),
  ErrorCategory: { EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { MEDIUM: "MEDIUM" },
  normalizeError: (e: unknown) =>
    e instanceof Error ? e : new Error(String(e)),
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
import {
  uploadFile,
  uploadFiles,
  validateFile,
  DEFAULT_VALIDATION,
  IMAGE_VALIDATION,
} from "@/shared/lib/r2/upload";
import { STORAGE_PREFIXES } from "@/shared/lib/r2/keys";

function makeFile(name: string, type: string, size: number): File {
  const buf = new Uint8Array(size).fill(0);
  return new File([buf], name, { type });
}

beforeEach(() => {
  sendMock.mockClear();
});

describe("validateFile", () => {
  test("サイズが上限を超えるとエラー", () => {
    const file = makeFile("big.jpg", "image/jpeg", 20 * 1024 * 1024);
    const err = validateFile(file, IMAGE_VALIDATION);
    expect(err).toContain("MB以下");
  });

  test("未対応 MIME はエラー", () => {
    const file = makeFile("doc.pdf", "application/pdf", 1024);
    const err = validateFile(file, IMAGE_VALIDATION);
    expect(err).toContain("対応していないファイル形式");
  });

  test("OK なファイルは null", () => {
    const file = makeFile("photo.jpg", "image/jpeg", 1024);
    expect(validateFile(file, IMAGE_VALIDATION)).toBeNull();
  });
});

describe("uploadFile", () => {
  test("成功時は url + path を返し S3Client.send を呼ぶ", async () => {
    const file = makeFile("photo.jpg", "image/jpeg", 1024);
    const result = await uploadFile(file, STORAGE_PREFIXES.SPACES, {
      folder: "space-1",
    });
    expect(result.success).toBe(true);
    expect(result.path).toMatch(/^spaces\/space-1\/\d+-[0-9a-f-]+\.jpg$/);
    expect(result.url).toMatch(
      /^https:\/\/media\.test\.example\.com\/spaces\/space-1\/\d+-[0-9a-f-]+\.jpg$/,
    );
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  test("サイズ超過ファイルは success:false で send されない", async () => {
    const file = makeFile("big.jpg", "image/jpeg", 20 * 1024 * 1024);
    const result = await uploadFile(file, STORAGE_PREFIXES.MEDIA);
    expect(result.success).toBe(false);
    expect(result.error).toContain("MB以下");
    expect(sendMock).not.toHaveBeenCalled();
  });

  test("S3Client.send が throw したら success:false", async () => {
    sendMock.mockImplementationOnce(() => {
      throw new Error("network error");
    });
    const file = makeFile("photo.jpg", "image/jpeg", 1024);
    const result = await uploadFile(file, STORAGE_PREFIXES.MEDIA);
    expect(result.success).toBe(false);
    expect(result.error).toContain("アップロードに失敗");
  });
});

describe("uploadFiles", () => {
  test("2 件順次アップロード", async () => {
    const files = [
      makeFile("a.jpg", "image/jpeg", 1024),
      makeFile("b.png", "image/png", 1024),
    ];
    const result = await uploadFiles(files, STORAGE_PREFIXES.POSTS, {
      folder: "post-1",
    });
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  test("途中で失敗したら success:false で短絡", async () => {
    const files = [
      makeFile("a.jpg", "image/jpeg", 1024),
      makeFile("big.jpg", "image/jpeg", 20 * 1024 * 1024),
      makeFile("c.png", "image/png", 1024),
    ];
    const result = await uploadFiles(files, STORAGE_PREFIXES.POSTS);
    expect(result.success).toBe(false);
    expect(result.results).toHaveLength(2); // 最初の1件成功 + 2件目失敗で短絡
    expect(result.error).toContain("big.jpg");
  });
});

describe("DEFAULT_VALIDATION / IMAGE_VALIDATION", () => {
  test("DEFAULT は 5MB / 画像のみ", () => {
    expect(DEFAULT_VALIDATION.maxSize).toBe(5 * 1024 * 1024);
    expect(DEFAULT_VALIDATION.allowedTypes).toContain("image/jpeg");
  });

  test("IMAGE は 10MB / 画像のみ", () => {
    expect(IMAGE_VALIDATION.maxSize).toBe(10 * 1024 * 1024);
    expect(IMAGE_VALIDATION.allowedTypes).toContain("image/webp");
  });
});
```

- [ ] **Step 2: テスト実行（失敗を確認）**

```bash
bun test __tests__/unit/shared/lib/r2/upload.test.ts
```

Expected: FAIL（`Cannot find module '@/shared/lib/r2/upload'`）

- [ ] **Step 3: `src/shared/lib/r2/upload.ts` を実装**

```typescript
/**
 * Cloudflare R2 ファイルアップロード（server-only）
 *
 * PutObjectCommand で `Body: Uint8Array` を送信する。File → arrayBuffer → Uint8Array
 * 変換により、@aws-sdk/client-s3 の Node.js runtime で確実に動作する（File / Blob
 * の直接渡しはバージョンによって挙動が変わるため、Uint8Array に正規化する）。
 *
 * @see https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/
 * @see https://github.com/aws/aws-sdk-js-v3/blob/main/supplemental-docs/EFFECTIVE_PRACTICES.md
 */

import "server-only";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { serverEnv } from "@/shared/lib/env/server";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { getR2BucketName, getR2Client } from "./client";
import { buildPublicUrl, generateStorageKey, type StoragePrefix } from "./keys";

// =============================================================================
// Types
// =============================================================================

export type UploadResult = {
  success: boolean;
  url?: string;
  path?: string;
  error?: string;
};

export type FileValidation = {
  /** バイト単位の上限サイズ */
  maxSize: number;
  /** 許可する MIME type のリスト */
  allowedTypes: string[];
};

// =============================================================================
// Constants
// =============================================================================

export const DEFAULT_VALIDATION: FileValidation = {
  maxSize: 5 * 1024 * 1024, // 5 MB
  allowedTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
};

export const IMAGE_VALIDATION: FileValidation = {
  maxSize: 10 * 1024 * 1024, // 10 MB
  allowedTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
};

const DEFAULT_CACHE_CONTROL = "public, max-age=31536000, immutable";

// =============================================================================
// Validation
// =============================================================================

/**
 * File を validation 規則に照らしてエラーメッセージ（問題あり）または null（OK）を返す。
 */
export function validateFile(
  file: File,
  validation: FileValidation,
): string | null {
  if (file.size > validation.maxSize) {
    const maxSizeMB = Math.round(validation.maxSize / (1024 * 1024));
    return `ファイルサイズは${maxSizeMB}MB以下にしてください`;
  }

  if (!validation.allowedTypes.includes(file.type)) {
    return `対応していないファイル形式です。対応形式: ${validation.allowedTypes.join(
      ", ",
    )}`;
  }

  return null;
}

// =============================================================================
// Upload
// =============================================================================

type UploadOptions = {
  /** 任意のサブフォルダ（prefix 配下のスコープ）*/
  folder?: string;
  /** デフォルトは {@link DEFAULT_VALIDATION} */
  validation?: FileValidation;
  /** デフォルトは Cloudflare CDN 向け immutable long-cache */
  cacheControl?: string;
};

/**
 * 単一 File を R2 にアップロードする。
 *
 * @returns `{ success, url, path, error }` — `success: true` 時のみ `url` / `path` が存在。
 */
export async function uploadFile(
  file: File,
  prefix: StoragePrefix,
  options?: UploadOptions,
): Promise<UploadResult> {
  const validation = options?.validation ?? DEFAULT_VALIDATION;

  const validationError = validateFile(file, validation);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const publicUrl = serverEnv.R2_PUBLIC_URL;
  if (!publicUrl) {
    return {
      success: false,
      error: "R2_PUBLIC_URL is not configured",
    };
  }

  try {
    const key = generateStorageKey({
      prefix,
      filename: file.name,
      ...(options?.folder && { folder: options.folder }),
    });

    const arrayBuffer = await file.arrayBuffer();
    const body = new Uint8Array(arrayBuffer);

    await getR2Client().send(
      new PutObjectCommand({
        Bucket: getR2BucketName(),
        Key: key,
        Body: body,
        ContentType: file.type,
        CacheControl: options?.cacheControl ?? DEFAULT_CACHE_CONTROL,
        ContentLength: file.size,
      }),
    );

    return {
      success: true,
      url: buildPublicUrl(key, publicUrl),
      path: key,
    };
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "uploadFile", prefix },
    });
    return {
      success: false,
      error: "ファイルのアップロードに失敗しました",
    };
  }
}

/**
 * 複数 File を順次アップロードする。失敗時は短絡し、成功分のみ results に残す。
 */
export async function uploadFiles(
  files: File[],
  prefix: StoragePrefix,
  options?: UploadOptions,
): Promise<{
  success: boolean;
  results: UploadResult[];
  error?: string;
}> {
  const results: UploadResult[] = [];

  for (const file of files) {
    const result = await uploadFile(file, prefix, options);
    results.push(result);

    if (!result.success) {
      return {
        success: false,
        results,
        error: `ファイル "${file.name}" のアップロードに失敗しました: ${result.error}`,
      };
    }
  }

  return { success: true, results };
}
```

- [ ] **Step 4: テスト実行（成功を確認）**

```bash
bun test __tests__/unit/shared/lib/r2/upload.test.ts
```

Expected: PASS（全 9 テストが green）

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/r2/upload.ts __tests__/unit/shared/lib/r2/upload.test.ts
git commit -m "feat(r2): add uploadFile/uploadFiles with validation (TDD)"
```

---

## Task 6: Create R2 delete module (TDD)

**Files:**

- Create: `__tests__/unit/shared/lib/r2/delete.test.ts`
- Create: `src/shared/lib/r2/delete.ts`

- [ ] **Step 1: テスト作成 `__tests__/unit/shared/lib/r2/delete.test.ts`**

```typescript
import { describe, test, expect, mock, beforeEach } from "bun:test";

const sendMock = mock(async () => ({}));
mock.module("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = sendMock;
  },
  DeleteObjectCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
  DeleteObjectsCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: {
    NODE_ENV: "test",
    R2_ACCOUNT_ID: "test-account",
    R2_ACCESS_KEY_ID: "test-key",
    R2_SECRET_ACCESS_KEY: "test-secret",
    R2_BUCKET_NAME: "test-bucket",
    R2_PUBLIC_URL: "https://media.test.example.com",
  },
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: mock(() => {}),
  ErrorCategory: { EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { MEDIUM: "MEDIUM" },
  normalizeError: (e: unknown) =>
    e instanceof Error ? e : new Error(String(e)),
}));

// eslint-disable-next-line import-x/first
import { deleteFile, deleteFiles } from "@/shared/lib/r2/delete";

beforeEach(() => {
  sendMock.mockClear();
});

describe("deleteFile", () => {
  test("成功時は success:true", async () => {
    const result = await deleteFile("spaces/a/123.jpg");
    expect(result.success).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  test("send が throw したら success:false", async () => {
    sendMock.mockImplementationOnce(() => {
      throw new Error("network error");
    });
    const result = await deleteFile("spaces/a/123.jpg");
    expect(result.success).toBe(false);
    expect(result.error).toContain("削除に失敗");
  });
});

describe("deleteFiles", () => {
  test("空配列は send せず success:true", async () => {
    const result = await deleteFiles([]);
    expect(result.success).toBe(true);
    expect(sendMock).not.toHaveBeenCalled();
  });

  test("1 件の bulk delete で全 key を送る", async () => {
    const result = await deleteFiles(["a.jpg", "b.png", "c.webp"]);
    expect(result.success).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  test("send が throw したら success:false", async () => {
    sendMock.mockImplementationOnce(() => {
      throw new Error("network error");
    });
    const result = await deleteFiles(["a.jpg"]);
    expect(result.success).toBe(false);
    expect(result.error).toContain("削除に失敗");
  });
});
```

- [ ] **Step 2: テスト実行（失敗を確認）**

```bash
bun test __tests__/unit/shared/lib/r2/delete.test.ts
```

Expected: FAIL（`Cannot find module '@/shared/lib/r2/delete'`）

- [ ] **Step 3: `src/shared/lib/r2/delete.ts` を実装**

```typescript
/**
 * Cloudflare R2 ファイル削除（server-only）
 *
 * - `deleteFile(key)`: 単一 Object を DeleteObjectCommand で削除
 * - `deleteFiles(keys)`: 複数 Object を DeleteObjectsCommand で一括削除（1 API call）
 *
 * bulk 削除は AWS S3 API の上限 1000 件/call 以内を想定。このプロジェクトは
 * 画像アップロードのみで 1000 件を超える同時削除は発生しないため chunking しない。
 *
 * @see https://developers.cloudflare.com/r2/api/s3/api/
 */

import "server-only";

import { DeleteObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import { getR2BucketName, getR2Client } from "./client";

type DeleteResult = { success: boolean; error?: string };

/**
 * 単一 Object を削除する。
 */
export async function deleteFile(key: string): Promise<DeleteResult> {
  try {
    await getR2Client().send(
      new DeleteObjectCommand({
        Bucket: getR2BucketName(),
        Key: key,
      }),
    );
    return { success: true };
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "deleteFile", key },
    });
    return { success: false, error: "ファイルの削除に失敗しました" };
  }
}

/**
 * 複数 Object を一括削除する（S3 DeleteObjects API、最大 1000 件）。
 * 空配列は no-op（success:true）。
 */
export async function deleteFiles(keys: string[]): Promise<DeleteResult> {
  if (keys.length === 0) return { success: true };

  try {
    await getR2Client().send(
      new DeleteObjectsCommand({
        Bucket: getR2BucketName(),
        Delete: {
          Objects: keys.map((Key) => ({ Key })),
          Quiet: true,
        },
      }),
    );
    return { success: true };
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "deleteFiles", count: keys.length },
    });
    return { success: false, error: "ファイルの削除に失敗しました" };
  }
}
```

- [ ] **Step 4: テスト実行（成功を確認）**

```bash
bun test __tests__/unit/shared/lib/r2/delete.test.ts
```

Expected: PASS（全 5 テストが green）

- [ ] **Step 5: Commit**

```bash
git add src/shared/lib/r2/delete.ts __tests__/unit/shared/lib/r2/delete.test.ts
git commit -m "feat(r2): add deleteFile/deleteFiles (TDD)"
```

---

## Task 7: Update next.config.ts / proxy.ts / Dockerfile / cloudbuild.yaml

**Files:**

- Modify: `next.config.ts`
- Modify: `src/proxy.ts`
- Modify: `Dockerfile`
- Modify: `cloudbuild.yaml`

- [ ] **Step 1: `next.config.ts` の `remotePatterns` を更新**

既存の以下エントリを削除:

```typescript
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
```

代わりに R2 カスタムドメインのエントリを追加（`remotePatterns` 配列の先頭）:

```typescript
      {
        protocol: "https",
        // R2 カスタムドメイン（R2_PUBLIC_URL のホスト名と一致させること）
        // env 値をここで参照しない（next.config.ts はビルド時評価）
        hostname: "media.example.com",
      },
      {
        protocol: "https",
        // R2 dev 用サブドメイン（カスタムドメイン未設定時）
        hostname: "*.r2.dev",
      },
```

**注**: ハードコード `media.example.com` は本番ドメインに差し替えるため、カスタムドメイン確定後に `hostname` を実値に変更する。

- [ ] **Step 2: `src/proxy.ts` の `buildCsp()` を更新**

line 53 の `img-src` 行を:

```typescript
    img-src 'self' data: blob: https://*.supabase.co https://img.youtube.com https://*.cdninstagram.com https://*.fbcdn.net;
```

以下に置換:

```typescript
    img-src 'self' data: blob: https://media.example.com https://*.r2.dev https://img.youtube.com https://*.cdninstagram.com https://*.fbcdn.net;
```

line 55 の `connect-src` 行を:

```typescript
    connect-src 'self' https://*.supabase.co https://api.stripe.com https://unpkg.com https://www.google-analytics.com https://analytics.google.com${isDev ? " ws://localhost:*" : ""};
```

以下に置換（Supabase を削除、R2 は Server Action プロキシ方式のためブラウザからの直接接続なし → connect-src には追加不要）:

```typescript
    connect-src 'self' https://api.stripe.com https://unpkg.com https://www.google-analytics.com https://analytics.google.com${isDev ? " ws://localhost:*" : ""};
```

- [ ] **Step 3: `Dockerfile` の ARG を更新**

line 32-33 の以下 2 行を削除:

```dockerfile
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
```

`NEXT_PUBLIC_*` の ARG は変更不要（R2 env は server-only のため build-arg 不要）。

- [ ] **Step 4: `cloudbuild.yaml` を更新**

line 31-32 の substitutions 2 行を削除:

```yaml
_NEXT_PUBLIC_SUPABASE_URL: ""
_NEXT_PUBLIC_SUPABASE_ANON_KEY: ""
```

新しい secret version substitutions を追加（他の `_*_SECRET_VERSION` の隣）:

```yaml
_R2_ACCOUNT_ID_SECRET_VERSION: "1"
_R2_ACCESS_KEY_ID_SECRET_VERSION: "1"
_R2_SECRET_ACCESS_KEY_SECRET_VERSION: "1"
_R2_BUCKET_NAME_SECRET_VERSION: "1"
_R2_PUBLIC_URL_SECRET_VERSION: "1"
```

line 78-79 の Step 3 `docker build` の以下 2 行を削除:

```yaml
- --build-arg=NEXT_PUBLIC_SUPABASE_URL=${_NEXT_PUBLIC_SUPABASE_URL}
- --build-arg=NEXT_PUBLIC_SUPABASE_ANON_KEY=${_NEXT_PUBLIC_SUPABASE_ANON_KEY}
```

line 120 の `--update-env-vars=` の `NEXT_PUBLIC_SUPABASE_URL=${_NEXT_PUBLIC_SUPABASE_URL},NEXT_PUBLIC_SUPABASE_ANON_KEY=${_NEXT_PUBLIC_SUPABASE_ANON_KEY},` を削除。

line 121 の `--update-secrets=` の末尾に R2 secrets を追加（カンマ区切り）:

```yaml
- --update-secrets=DATABASE_URL=DATABASE_URL:${_DATABASE_URL_SECRET_VERSION},BETTER_AUTH_SECRET=BETTER_AUTH_SECRET:${_BETTER_AUTH_SECRET_VERSION},ENCRYPTION_KEY=ENCRYPTION_KEY:${_ENCRYPTION_KEY_SECRET_VERSION},CRON_SECRET=CRON_SECRET:${_CRON_SECRET_VERSION},ADMIN_LOGIN_TOKEN=ADMIN_LOGIN_TOKEN:${_ADMIN_LOGIN_TOKEN_SECRET_VERSION},NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY:${_NEXT_SERVER_ACTIONS_ENCRYPTION_KEY_SECRET_VERSION},R2_ACCOUNT_ID=R2_ACCOUNT_ID:${_R2_ACCOUNT_ID_SECRET_VERSION},R2_ACCESS_KEY_ID=R2_ACCESS_KEY_ID:${_R2_ACCESS_KEY_ID_SECRET_VERSION},R2_SECRET_ACCESS_KEY=R2_SECRET_ACCESS_KEY:${_R2_SECRET_ACCESS_KEY_SECRET_VERSION},R2_BUCKET_NAME=R2_BUCKET_NAME:${_R2_BUCKET_NAME_SECRET_VERSION},R2_PUBLIC_URL=R2_PUBLIC_URL:${_R2_PUBLIC_URL_SECRET_VERSION}
```

コメント（line 4-8 `Required secrets` リスト）にも R2 を追記:

```yaml
# Required secrets (Secret Manager):
#   DATABASE_URL, BETTER_AUTH_SECRET, ENCRYPTION_KEY, CRON_SECRET, ADMIN_LOGIN_TOKEN
#   NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
#   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL
```

- [ ] **Step 5: 検証**

```bash
bun run type-check
```

Expected: exit 0

```bash
grep -c "supabase" next.config.ts src/proxy.ts Dockerfile cloudbuild.yaml
```

Expected: `0`（全て）

- [ ] **Step 6: Commit**

```bash
git add next.config.ts src/proxy.ts Dockerfile cloudbuild.yaml
git commit -m "chore(config): replace supabase.co with R2 in remotePatterns/CSP/Cloud Build"
```

---

## Task 8: Update media domain layer (commands.ts)

**Files:**

- Modify: `src/shared/domain/media/commands.ts`

- [ ] **Step 1: Import を更新**

line 5-6 を:

```typescript
import { STORAGE_BUCKETS } from "@/shared/lib/supabase";
import { deleteFile, deleteFiles, uploadFile } from "@/shared/lib/storage";
```

以下に置換:

```typescript
import { STORAGE_PREFIXES } from "@/shared/lib/r2/keys";
import { uploadFile } from "@/shared/lib/r2/upload";
import { deleteFile, deleteFiles } from "@/shared/lib/r2/delete";
```

- [ ] **Step 2: `STORAGE_BUCKETS.MEDIA` を `STORAGE_PREFIXES.MEDIA` に全置換**

ファイル内で `STORAGE_BUCKETS` が 3 箇所（line 23, 41, 63, 122, 145, 147）使われているため、`Edit` の `replace_all: true` で一括置換:

- `STORAGE_BUCKETS.MEDIA` → `STORAGE_PREFIXES.MEDIA`

- [ ] **Step 3: `deleteFile` / `deleteFiles` の引数を key-only に更新**

旧シグネチャ: `deleteFile(path, bucket)` / `deleteFiles(paths[], bucket)`
新シグネチャ: `deleteFile(key)` / `deleteFiles(keys[])`

line 63 の `await deleteFile(uploadedPath, STORAGE_BUCKETS.MEDIA);` を:

```typescript
await deleteFile(uploadedPath);
```

line 122 の `await deleteFile(media.storagePath, STORAGE_BUCKETS.MEDIA);` を:

```typescript
await deleteFile(media.storagePath);
```

line 145-148 の `deleteFiles(...)` 呼び出しを:

```typescript
await deleteFiles(mediaItems.map((media) => media.storagePath));
```

- [ ] **Step 4: `uploadFile` の第2引数を prefix に更新**

line 23 の `await uploadFile(input.file, STORAGE_BUCKETS.MEDIA, { folder: input.folder });` を:

```typescript
await uploadFile(input.file, STORAGE_PREFIXES.MEDIA, {
  folder: input.folder,
});
```

（`STORAGE_BUCKETS` → `STORAGE_PREFIXES` の置換で自動反映されるが、Step 2 の `replace_all` で一括で済む）

- [ ] **Step 5: `Media.bucket` フィールドに書き込む値は prefix 文字列（"media"）のままで互換維持**

line 41 の `bucket: STORAGE_BUCKETS.MEDIA,` が `bucket: STORAGE_PREFIXES.MEDIA,` に変わる。これで DB には `"media"` が保存される（値は同一、意味が「prefix」に変わる）。Prisma schema 変更不要。

- [ ] **Step 6: Type-check + test**

```bash
bun run type-check
```

Expected: exit 0

```bash
bun test __tests__/unit/domain/media/commands.test.ts
```

Expected: 現時点では既存 mock 対象（`@/shared/lib/storage`）が存在しないため FAIL。Task 10 で修正する。

- [ ] **Step 7: Commit**

```bash
git add src/shared/domain/media/commands.ts
git commit -m "refactor(media): switch domain commands to r2 storage API"
```

---

## Task 9: Update test setup

**Files:**

- Modify: `__tests__/setup.ts`

- [ ] **Step 1: `__tests__/setup.ts` を読んで Supabase 関連の記述を確認**

```bash
grep -n -i "supabase" __tests__/setup.ts
```

Expected: 0〜数件（env mock / module mock）

- [ ] **Step 2: Supabase 関連 mock があれば削除**

`mock.module("@supabase/supabase-js", ...)` / `mock.module("@/shared/lib/supabase", ...)` / `mock.module("@/shared/lib/storage", ...)` があれば削除する。

代わりに R2 の test-safe env mock を追加（既に upload.test.ts / delete.test.ts 内で個別 mock しているため、setup.ts 内では不要。存在する場合のみ統合）。

- [ ] **Step 3: 検証**

```bash
grep -c -i "supabase" __tests__/setup.ts
```

Expected: `0`

- [ ] **Step 4: Commit**

```bash
git add __tests__/setup.ts
git commit -m "chore(test): remove supabase mocks from setup"
```

---

## Task 10: Update media/commands.test.ts

**Files:**

- Modify: `__tests__/unit/domain/media/commands.test.ts`

- [ ] **Step 1: ファイル全体を読んで現状を確認**

```bash
cat __tests__/unit/domain/media/commands.test.ts | head -100
```

- [ ] **Step 2: `mock.module("@/shared/lib/storage", ...)` を `@/shared/lib/r2/upload` と `@/shared/lib/r2/delete` の 2 箇所に分割**

```typescript
// 旧:
mock.module("@/shared/lib/storage", () => ({
  uploadFile: mock(async () => ({
    success: true,
    url: "http://...",
    path: "media/...",
  })),
  deleteFile: mock(async () => ({ success: true })),
  deleteFiles: mock(async () => ({ success: true })),
}));

// 新:
const uploadFileMock = mock(async () => ({
  success: true,
  url: "https://media.test.example.com/media/folder/x.jpg",
  path: "media/folder/x.jpg",
}));
const deleteFileMock = mock(async () => ({ success: true }));
const deleteFilesMock = mock(async () => ({ success: true }));

mock.module("@/shared/lib/r2/upload", () => ({
  uploadFile: uploadFileMock,
}));
mock.module("@/shared/lib/r2/delete", () => ({
  deleteFile: deleteFileMock,
  deleteFiles: deleteFilesMock,
}));
mock.module("@/shared/lib/r2/keys", () => ({
  STORAGE_PREFIXES: {
    SPACES: "spaces",
    POSTS: "posts",
    SITE: "site",
    MEDIA: "media",
  },
}));
```

- [ ] **Step 3: `STORAGE_BUCKETS` → `STORAGE_PREFIXES` の参照更新（テスト内 assertion で使用されていれば）**

```bash
grep -n "STORAGE_BUCKETS" __tests__/unit/domain/media/commands.test.ts
```

ヒットしたら `STORAGE_PREFIXES` に置換。

- [ ] **Step 4: `deleteFile` / `deleteFiles` 呼び出し引数 assertion を key-only に更新**

`expect(deleteFileMock).toHaveBeenCalledWith(path, "media")` のようなパターンを `expect(deleteFileMock).toHaveBeenCalledWith(path)` に変更。

- [ ] **Step 5: テスト実行**

```bash
bun test __tests__/unit/domain/media/commands.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add __tests__/unit/domain/media/commands.test.ts
git commit -m "test(media): update mocks to @/shared/lib/r2/*"
```

---

## Task 11: Delete old Supabase files

**Files:**

- Delete: `src/shared/lib/supabase.ts`
- Delete: `src/shared/lib/storage.ts`
- Delete: `__tests__/unit/shared/lib/storage.test.ts`

- [ ] **Step 1: 残存参照がないことを確認**

```bash
grep -rn "from \"@/shared/lib/storage\"" src/ __tests__/
grep -rn "from \"@/shared/lib/supabase\"" src/ __tests__/
grep -rn "@supabase/supabase-js" src/ __tests__/
```

Expected: 全て 0 件

もし残存があれば対応を Task 8 / Task 10 に戻って実施。

- [ ] **Step 2: ファイル削除**

```bash
git rm src/shared/lib/supabase.ts src/shared/lib/storage.ts __tests__/unit/shared/lib/storage.test.ts
```

- [ ] **Step 3: Validate**

```bash
bun run validate
```

Expected: exit 0

```bash
bun test __tests__/unit/shared/lib/r2 __tests__/unit/domain/media
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(storage): delete legacy supabase.ts/storage.ts and old tests"
```

---

## Task 12: Update prisma/seed.ts

**Files:**

- Modify: `prisma/seed.ts`

- [ ] **Step 1: seed.ts 内の Supabase 関連参照を調査**

```bash
grep -in "supabase\|SUPABASE" prisma/seed.ts
```

- [ ] **Step 2: 見つかったら以下のパターンで置換**

- 画像 URL が Supabase Storage URL を指している場合 → `https://images.unsplash.com/...` 等の既存 placeholder か、R2 placeholder 形式 `${R2_PUBLIC_URL}/...`（env が未設定の dev 環境でも seed 動作する必要があるため、env に依存しない hard-coded placeholder を使うのが無難）に置換
- import 行 `@/shared/lib/supabase` / `@/shared/lib/storage` があれば削除
- コメント内「Supabase Storage に保存」等の記述を「Cloudflare R2 に保存」に変更

- [ ] **Step 3: seed を実行して動作確認**

```bash
bun run db:seed
```

Expected: exit 0、seed 完了メッセージが表示される

- [ ] **Step 4: 冪等性の確認（2 回目も成功する）**

```bash
bun run db:seed
```

Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts
git commit -m "chore(seed): replace supabase URL references"
```

---

## Task 13: Update CLAUDE.md / .claude/rules/ / .claude/agents/ / .claude/skills/

**Files:**

- Modify: `CLAUDE.md`
- Modify: `.claude/rules/api-routes.md`
- Modify: `.claude/rules/gotchas.md`
- Modify: `.claude/rules/ops/deployment-patterns.md`
- Modify: `.claude/rules/external-api-retry-patterns.md`
- Modify: `.claude/skills/cloud-run-debug/SKILL.md`
- Modify: `.claude/agents/db-migration-reviewer.md`
- Modify: `.claude/agents/security-reviewer.md`

- [ ] **Step 1: Supabase 言及のあるファイルを一覧化**

```bash
grep -rln "supabase\|SUPABASE" .claude/
```

- [ ] **Step 2: 各ファイルで以下のパターンで置換**

**パターン A**（env リスト内の `NEXT_PUBLIC_SUPABASE_*`）:

- 削除する

**パターン B**（画像ストレージの説明文）:

- 「Supabase Storage」→「Cloudflare R2」
- 「Supabase URL」→「R2 カスタムドメイン URL」
- 「storage/v1/object/public/」→「R2 key prefix」

**パターン C**（Dockerfile / cloudbuild.yaml 例）:

- `NEXT_PUBLIC_SUPABASE_*` ARG 記述を削除
- R2 secret 記述を追加

**パターン D**（deployment-patterns.md の `Dockerfile の NEXT_PUBLIC_* ARG` セクション）:

- `ARG NEXT_PUBLIC_SUPABASE_URL` / `ARG NEXT_PUBLIC_SUPABASE_ANON_KEY` の 2 行を削除

- [ ] **Step 3: CLAUDE.md の SSoT 定数テーブルを確認**

```bash
grep -n "storage\|Supabase\|STORAGE_BUCKETS" CLAUDE.md
```

もしヒットあれば、`STORAGE_PREFIXES` を `@/shared/lib/r2/keys` の SSoT として追加。テーブル形式で:

```markdown
| `STORAGE_PREFIXES` / `StoragePrefix` | `@/shared/lib/r2/keys` | 画像ストレージの key prefix SSoT（`spaces` / `posts` / `site` / `media`）。Cloudflare R2 バケット内の仮想フォルダ名に対応。upload / delete の第 2 引数で使用 |
```

- [ ] **Step 4: 検証**

```bash
grep -rln "supabase\|SUPABASE" .claude/ | grep -v "\.md.orig$"
```

Expected: 0 件（全て R2 に置換完了）

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md .claude/
git commit -m "docs(rules): replace Supabase with Cloudflare R2 references"
```

---

## Task 14: Update docs/ (architecture / operations / guides / reference / requirements / plans / quality)

**Files:** `docs/` 配下の Supabase 言及全ファイル

**注**: 過去の plans（`docs/plans/*.md`）は履歴ドキュメントのため、**セッション内で以下ルール**を採用する:

- `docs/plans/2026-02-28-*` などの過去 plan で Supabase が「当時の実装」として書かれている箇所 → 更新不要（historical record として維持）
- `docs/plans/README.md` など現行リストの参照 → 更新
- `docs/architecture/` / `docs/operations/` / `docs/guides/` / `docs/reference/codex-rules/` / `docs/requirements/` / `docs/quality/` → 現状の事実なので更新必須

- [ ] **Step 1: 更新対象ファイル一覧**

```bash
grep -rln "supabase\|SUPABASE" docs/ | sort
```

- [ ] **Step 2: 歴史ファイル（`docs/plans/*.md` のうち古い plan）を除外**

```bash
grep -rln "supabase\|SUPABASE" docs/ | grep -v "^docs/plans/" | sort
```

このリストが **更新対象**。

- [ ] **Step 3: 各ファイルで以下を置換**

- 「Supabase Storage」→「Cloudflare R2」
- 「Supabase Auth」記述なし（当プロジェクトは Better Auth）→ 該当なしなら無視
- env 例で `NEXT_PUBLIC_SUPABASE_*` → `R2_*`
- Dockerfile / cloudbuild.yaml 例で Supabase 関連記述 → R2 に書き換え
- 画像ストレージのアーキ図（mermaid 等）→ ラベルを R2 に差し替え

- [ ] **Step 4: `docs/reference/codex-rules/deployment-patterns.md` の同期**

このファイルは `.claude/rules/ops/deployment-patterns.md` と byte-identical を要求されている（CLAUDE.md 記載の policy-docs-sync）。Task 13 で更新した内容を反映:

```bash
# CLAUDE.md 参照: scripts/verify-policy-docs.mjs が両ファイルの byte-identical 同期を要求
bun run docs:verify-policy-sync
```

Expected: exit 0 (同期済み)

同期が取れていない場合、`.claude/rules/ops/deployment-patterns.md` の内容を `docs/reference/codex-rules/deployment-patterns.md` にコピーする。

- [ ] **Step 5: 検証**

```bash
grep -rln "supabase\|SUPABASE" docs/ | grep -v "^docs/plans/2026-" | grep -v "^docs/plans/0[0-9]\{2\}-"
```

Expected: 0 件（過去 plans を除き全て更新済み）

- [ ] **Step 6: Commit**

```bash
git add docs/
git commit -m "docs: replace Supabase with Cloudflare R2 in architecture/ops/guides"
```

---

## Task 15: Update terms-templates.ts (プライバシーポリシー)

**Files:**

- Modify: `src/shared/lib/terms-templates.ts`

`CLAUDE.md` の記述より、新規外部 SaaS 統合時はプライバシーポリシーへの記載が必須。Supabase Storage 削除 + Cloudflare R2 追加のため更新する。

- [ ] **Step 1: `PRIVACY_POLICY_TEMPLATE` 内の Supabase 言及を確認**

```bash
grep -n -i "supabase" src/shared/lib/terms-templates.ts
```

- [ ] **Step 2: §7「利用する外部サービス」セクションを更新**

- `<h3>7.x Supabase ...</h3>` ブロックがあれば Cloudflare R2 に置換
- 事業者: 「Supabase, Inc. (米国)」→「Cloudflare, Inc. (米国)」
- サービス名: 「Supabase Storage」→「Cloudflare R2」
- 提供目的: 「画像ファイルの保管」はそのまま
- 取得する個人データ: 「アップロードされたファイル（画像等）」はそのまま
- 所在国: 米国（変更なし）

- [ ] **Step 3: §8「個人データの越境移転」セクションの事業者列挙を更新**

Supabase 記述を Cloudflare に差し替え（当プロジェクトは既に Turnstile で Cloudflare を使っているので、統合して「Cloudflare, Inc.（米国 / Turnstile + R2）」のように統一）。

- [ ] **Step 4: 検証**

```bash
grep -c -i "supabase" src/shared/lib/terms-templates.ts
```

Expected: `0`

- [ ] **Step 5: Type-check**

```bash
bun run type-check
```

Expected: exit 0

- [ ] **Step 6: Commit**

```bash
git add src/shared/lib/terms-templates.ts
git commit -m "docs(terms): update privacy policy for Cloudflare R2"
```

---

## Task 16: Final verification

**Files:** 変更なし、検証のみ

- [ ] **Step 1: Full validation**

```bash
bun run validate
```

Expected: exit 0

- [ ] **Step 2: Unit tests**

```bash
bun run test:unit
```

Expected: exit 0、全バッチ PASS

- [ ] **Step 3: Build（env 未設定時）**

```bash
bun run build:skip-env
```

Expected: exit 0

- [ ] **Step 4: Supabase 残存チェック**

```bash
grep -rln "supabase\|SUPABASE\|@supabase" src/ __tests__/ prisma/ next.config.ts src/proxy.ts Dockerfile cloudbuild.yaml .env.example
```

Expected: 0 件

`.claude/` / `docs/` 以外にすべて残存ゼロを確認。

- [ ] **Step 5: R2 実装の整合性チェック**

```bash
# STORAGE_PREFIXES は r2/keys でのみ定義
grep -rln "STORAGE_PREFIXES\|STORAGE_BUCKETS" src/ __tests__/

# r2/upload + r2/delete + r2/keys + r2/client の 4 ファイルが存在
ls src/shared/lib/r2/

# Supabase imports が残っていない
grep -rln "@supabase/supabase-js\|@/shared/lib/supabase\|@/shared/lib/storage" src/ __tests__/
```

Expected: R2 定義のみ、Supabase 参照ゼロ

- [ ] **Step 6: Integration test（任意、env 設定あれば）**

```bash
# R2 env が dev で設定されていれば integration test で実アップロード検証可能
# 未設定なら skip
bun run test:integration
```

- [ ] **Step 7: 最終コミット（前 Task までに全て commit 済みなので no-op 想定）**

```bash
git status
```

Expected: clean working tree

- [ ] **Step 8: ブランチ確認 + commit 履歴サマリー**

```bash
git log --oneline main..HEAD
```

以下のような履歴が出るはず:

```
(latest) docs(terms): update privacy policy for Cloudflare R2
         docs: replace Supabase with Cloudflare R2 in architecture/ops/guides
         docs(rules): replace Supabase with Cloudflare R2 references
         chore(seed): replace supabase URL references
         chore(storage): delete legacy supabase.ts/storage.ts and old tests
         test(media): update mocks to @/shared/lib/r2/*
         chore(test): remove supabase mocks from setup
         refactor(media): switch domain commands to r2 storage API
         chore(config): replace supabase.co with R2 in remotePatterns/CSP/Cloud Build
         feat(r2): add deleteFile/deleteFiles (TDD)
         feat(r2): add uploadFile/uploadFiles with validation (TDD)
         feat(r2): add object key utilities (...)
         feat(r2): add S3Client singleton for Cloudflare R2
         feat(env): add R2_* server env, drop NEXT_PUBLIC_SUPABASE_*
         chore(deps): swap @supabase/supabase-js for @aws-sdk/client-s3
```

---

## Post-Implementation Checklist

実装完了後、ユーザー側で以下を実施:

1. [ ] Cloudflare R2 バケット作成（`myrrh-media` 等）
2. [ ] R2 API Token 発行（Object R&W、bucket-scope）
3. [ ] カスタムドメイン接続（`media.<yourdomain>`）
4. [ ] `.env.local` に R2 env を設定
5. [ ] Secret Manager（GCP）に R2 secret を登録:
   ```bash
   echo -n "your-account-id" | gcloud secrets create R2_ACCOUNT_ID --data-file=-
   echo -n "your-access-key" | gcloud secrets create R2_ACCESS_KEY_ID --data-file=-
   echo -n "your-secret-key" | gcloud secrets create R2_SECRET_ACCESS_KEY --data-file=-
   echo -n "myrrh-media" | gcloud secrets create R2_BUCKET_NAME --data-file=-
   echo -n "https://media.example.com" | gcloud secrets create R2_PUBLIC_URL --data-file=-
   ```
6. [ ] Cloud Run サービスアカウントに Secret accessor 権限付与
7. [ ] `next.config.ts` の `remotePatterns` のカスタムドメインを実値に差し替え
8. [ ] dev server で `/admin/media` にアクセスし、画像アップロード動作確認
9. [ ] Cloud Build 実行（`gcloud builds submit --config=cloudbuild.yaml`）
10. [ ] 本番環境で画像アップロード → Cloudflare Dashboard で R2 バケットにオブジェクトが生成されることを確認

---

## Self-Review Checklist

plan 作成者が書き終わり後に自己レビューする項目。

### 1. Spec coverage

- [x] env 変更: Task 2, 7 でカバー（server / client / .env.example / Dockerfile / cloudbuild）
- [x] R2 client 作成: Task 3
- [x] Key utilities: Task 4（TDD）
- [x] Upload: Task 5（TDD）
- [x] Delete: Task 6（TDD）
- [x] CSP / remotePatterns: Task 7
- [x] Domain layer: Task 8
- [x] Test migration: Task 9, 10
- [x] Old file deletion: Task 11
- [x] Seed: Task 12
- [x] CLAUDE.md / rules / agents / skills: Task 13
- [x] docs: Task 14
- [x] Privacy policy: Task 15
- [x] Final validation: Task 16

### 2. Placeholder scan

- 「TBD」「TODO」「implement later」「fill in details」「add appropriate error handling」「handle edge cases」「Similar to Task N」: なし
- 「write tests for the above」（コードなし）: なし
- コード block が必要な Step には実コード記載済み

### 3. Type consistency

- `StoragePrefix` 型: Task 4 で定義、Task 5/6/8 で一貫使用
- `STORAGE_PREFIXES` 定数: Task 4 で定義、Task 5/8 で一貫使用
- `uploadFile(file, prefix, options)` シグネチャ: Task 5, 8, 10 で一致
- `deleteFile(key)` / `deleteFiles(keys[])` シグネチャ: Task 6, 8, 10 で一致
- env 変数名（`R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` / `R2_PUBLIC_URL`）: Task 2, 3, 5, 7 で一致
- `getR2Client()` / `getR2BucketName()` / `isR2Configured()`: Task 3 で定義、Task 5/6 で使用

---

## Execution Handoff

plan 完了、`docs/superpowers/plans/2026-04-21-cloudflare-r2-migration.md` に保存。

2 options:

**1. Subagent-Driven（recommended）** — fresh subagent を per-task dispatch、review checkpoint、高速反復
**2. Inline Execution** — current session で tasks を batch 実行、checkpoint で review

どちらで進めるか？（ユーザー指示: 「遠慮せず進めて」→ Subagent-Driven で一気通貫を採用、Task 1 から順次 dispatch、密結合タスク（Task 1-2 / Task 3-6 / Task 7 / Task 8-11 / Task 12-14 / Task 15 / Task 16）はバンドル化する）
