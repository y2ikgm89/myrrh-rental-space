# Google Business Profile Sync — Design Spec (MEO Phase 2)

> **⚠️ Archive note (2026-05-11)**: 本 spec の `withGbpApiRetry` / `retry.ts` への参照は archive 当時の設計。**現実装は `@/shared/lib/google-api/retry.ts` に統合され、`withGoogleApiRetry` 単一 SSoT で運用中**。新規実装時は `external-api-retry-patterns.md` を参照。

**日付**: 2026-04-28
**種別**: 機能追加 + 外部 API 統合
**ステータス**: 設計中
**親プロジェクト**: MEO 改善（5 サブプロジェクトの第 2 段）
**前段**: Multi-Location SEO Foundation (ADR 0023, 完了)
**後続**: Review 収集導線 / Service Schema 移行 / 業種特化 amenityFeature

---

## 1. 目的

Phase 1 で確立した `Location` モデルの MEO フィールド（Place ID / 住所 / 営業時間 / 価格帯等）を Google Business Profile (GBP) に外向き同期する。管理画面が SSoT、GBP は表示窓となる片方向同期パターンで、ローカル検索 / Google Maps 表示の MEO スコア改善を狙う。

### 背景

Phase 1 完了時点で:

- 各 Location が `googleBusinessPlaceId` / `latitude` / `longitude` / `phoneNumber` / `email` / `businessHours` / `priceRange` 等を保持
- per-location LocalBusiness JSON-LD は実装済み（Google 検索結果向け）
- ただし Google Business Profile（マイビジネス）への登録情報は手動更新が必要

GBP は Google Maps / ローカル検索結果に直接表示される情報源で、JSON-LD よりも MEO スコアへの影響度が高い（Google 公式: GBP は MEO の primary signal）。手動更新を継続すると拠点数の増加に応じて運用負荷が線形増加し、誤差・更新漏れが発生するため、自動同期が必要。

### 公式仕様の確認結果（2026-04-28 時点）

Google Business Profile API の主要制約:

- **Authentication**: OAuth 2.0 のみ（service account 不可、Google 公式制約）。scope: `https://www.googleapis.com/auth/business.manage`
- **Access**: Google Cloud Console での API 有効化 + [Business Profile API access request form](https://developers.google.com/my-business/content/prereqs#api-access) 申請 + 承認待ち（数日〜数週間）
- **Endpoints**:
  - Account discovery: `mybusinessaccountmanagement.googleapis.com/v1/accounts`
  - Location read/update: `mybusinessbusinessinformation.googleapis.com/v1/locations/{locationId}` (PATCH + FieldMask)
- **Rate limit**: account あたり 600 req/min（公式 quota、変更時は再申請）
- **同期可能フィールド**（Phase 2 minimum scope）:
  - `title` (Location name)
  - `storefrontAddress` (postalAddress: postalCode / regionCode / locality / addressLines)
  - `phoneNumbers.primaryPhone`
  - `regularHours` (businessHours JSON → GBP TimePeriod 変換)
  - `websiteUri`
  - `latlng`（変更検知時のみ更新、自動 geocoding は GBP 側に委譲）
- **Phase 3 以降スコープ**: `categories.primaryCategory` / `priceRange` (GBP API では別フィールド扱いの可能性、実装時要確認) / `attributes` (amenityFeature) / `photos` / `posts` / `qanda` / `services`

### 採用方針

- **App SSoT、GBP は表示窓**（outbound only、bidirectional 不採用）
- **single-account OAuth**（現運用: 単一事業者が全拠点管理）
- **stub mode** で API access 申請待ちでも実装完遂可能に
- **fireAndForget on save + manual button**（Calendar outbound と同パターン）
- **error はバッジ表示**、retry は `withGoogleApiRetry()` 同型 helper を流用

---

## 2. アーキテクチャ

### 2.1 データモデル変更

**`Settings` モデル拡張**（OAuth 認証情報保管）:

```prisma
model Settings {
  // ... existing fields ...

  // Phase 2 追加
  googleBusinessProfileAuth     Json?    // { accessToken, refreshToken, expiresAt, accountId } encrypted
  googleBusinessProfileEnabled  Boolean  @default(false)
}
```

**`Location` モデル拡張**（同期状態保管）:

```prisma
model Location {
  // ... existing fields (Phase 1 完了済み) ...

  // Phase 2 追加
  gbpSyncEnabled Boolean   @default(true)  // この Location の同期 ON/OFF
  gbpSyncedAt    DateTime?                  // 最終成功同期時刻
  gbpSyncError   String?   @db.Text         // 直近のエラーメッセージ（成功時 null）
}

@@index([gbpSyncError]) // 同期エラー件数の admin dashboard 用
```

`googleBusinessPlaceId` (Phase 1 で追加済み) は GBP location resource ID として継続使用。

### 2.2 ライブラリ構造（`google-calendar/` と同型）

```
src/shared/lib/google-business-profile/
├── client.ts           // OAuth クライアント生成（既存 OAuth token 復号 + setCredentials）
├── oauth.ts            // OAuth flow（authorize URL 生成 / callback 処理 / token 暗号化保管）
├── account.ts          // GBP account discovery (`accounts.list`)
├── location-sync.ts    // Location 単位の同期ロジック（patch with FieldMask）
├── retry.ts            // withGbpApiRetry()（withGoogleApiRetry と同型）
├── stub.ts             // GBP_STUB_MODE=true 時の no-op 実装
├── settings.ts         // Settings から auth 読み書き helper（暗号化 wrapper）
├── types.ts            // GbpSyncResult / GbpAuthState / GbpLocationPayload
└── helpers.ts          // formatGbpError / buildBusinessHoursPayload 等
```

全ファイル `import "server-only"` 必須（Node-only `googleapis` 依存、`server-only-patterns.md` §追加対象）。

### 2.3 OAuth Flow

Calendar OAuth と同パターン:

1. 管理画面 `/admin/settings/integrations` に「Google Business Profile 連携」セクション追加
2. 「Google で連携」ボタン → Server Action `initiateGbpAuth` が `oauth2Client.generateAuthUrl({ scope: ["https://www.googleapis.com/auth/business.manage"], access_type: "offline", prompt: "consent" })` で URL 生成 → リダイレクト
3. Google 認証後、`/api/gbp-callback` route handler（既存 `/api/google-calendar/callback` と同パターン）で `oauth2Client.getToken(code)` → token を `encrypt()` で暗号化 → `Settings.googleBusinessProfileAuth` に保存
4. `accounts.list()` で GBP アカウント発見 → 単一アカウント想定、複数アカウント時は最初のものを採用（管理画面で warning 表示）→ `accountId` を auth JSON に追加保管
5. 管理画面で「連携済み（アカウント名表示）」+「解除」ボタン
6. 解除時は token revoke + DB クリア

OAuth client は既存 `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` を流用（Calendar 統合と共有、Cloud Console で scope 追加のみ）。

### 2.4 同期 Flow

**Trigger 1: Location save（fireAndForget）**

```typescript
// _shared/actions/location.ts
export async function updateLocation(id: string, input: LocationFormInput) {
  return executeAdminMutationResult({
    resource: "location",
    action: "update",
    resourceId: id,
    execute: async () => updateLocationCommand(id, input),
    afterSuccess: (data) => {
      updateTag(CACHE_TAGS.LOCATIONS);
      updateTag(getCacheTag.locations.detail(data.slug));
      // GBP outbound sync (non-blocking, gracefully degrades on error)
      fireAndForget(syncLocationToGbpCommand({ locationId: data.id }), {
        operation: "syncLocationToGbp",
        category: ErrorCategory.EXTERNAL_API,
      });
    },
  });
}
```

**Trigger 2: Manual sync button**

管理画面 Location 編集 form に「今すぐ GBP 同期」ボタン追加 → Server Action `triggerGbpSync(locationId)` → `executeAdminMutationResult` 経由で同期コマンド実行 → 結果を `MutationResult<{ syncedAt: Date }>` で返却（fireAndForget ではなく、ユーザーフィードバックあり）。

**Domain command**:

```typescript
// src/shared/domain/locations/gbp-sync-commands.ts
import "server-only";

export type SyncLocationToGbpInput = {
  locationId: string;
};

export type SyncLocationToGbpResult = {
  locationId: string;
  syncedAt: Date;
};

export async function syncLocationToGbpCommand(
  input: SyncLocationToGbpInput,
): Promise<SyncLocationToGbpResult> {
  // 1. GBP_STUB_MODE 判定 → no-op 早期 return
  // 2. Location 取得 + gbpSyncEnabled / googleBusinessPlaceId 判定（false / null なら skip）
  // 3. Settings から auth 取得 + 復号 + Settings.googleBusinessProfileEnabled 判定
  // 4. GBP API 呼び出し（withGbpApiRetry 経由 PATCH with FieldMask）
  // 5. 成功時: gbpSyncedAt 更新、gbpSyncError null クリア
  // 6. 失敗時: gbpSyncError 記録（throw せず graceful degradation、logError は MEDIUM）
}
```

**FieldMask 構築**:

```typescript
// helpers.ts
export function buildGbpFieldMask(location: Location): string {
  const fields = [
    "title",
    "storefrontAddress",
    "phoneNumbers.primaryPhone",
    "regularHours",
    "websiteUri",
  ];
  if (location.latitude !== null && location.longitude !== null) {
    fields.push("latlng");
  }
  return fields.join(",");
}
```

### 2.5 Stub Mode

`GBP_STUB_MODE=true` 環境変数で API call を no-op 化。承認待ち期間の開発・staging で使用:

```typescript
// google-business-profile/stub.ts
import "server-only";

export async function syncLocationStub(
  input: SyncLocationToGbpInput,
): Promise<SyncLocationToGbpResult> {
  logger.info("GBP sync stubbed", {
    locationId: input.locationId,
    reason: "GBP_STUB_MODE=true",
  });
  return { locationId: input.locationId, syncedAt: new Date() };
  // DB 更新も stub では行わない（gbpSyncedAt は実 API 呼び出し成功時のみ更新）
}
```

`location-sync.ts` の冒頭で `if (serverEnv.GBP_STUB_MODE === "true") return syncLocationStub(input)` で分岐。

`serverEnv` に `GBP_STUB_MODE: z.string().optional()` を追加。

### 2.6 UI Changes

**管理画面 `/admin/settings/integrations`** (`src/app/(admin)/admin/(dashboard)/settings/integrations/_components/`):

- 新セクション「Google Business Profile」
- 連携状態（未連携 / 連携済み（アカウント名）/ エラー）
- 「Google で連携」/「解除」ボタン
- 接続テストボタン（`accounts.list()` を呼び 401/403 を即時検出）

**管理画面 `/admin/locations`（一覧）** (`src/app/(admin)/admin/(dashboard)/locations/_components/LocationTable.tsx`):

- 各行に GBP 同期状態バッジ（同期済 / エラー / 同期 OFF / 未連携 / Place ID 未設定）
- エラー時は tooltip でエラーメッセージ表示

**管理画面 `/admin/locations/[id]/edit`（編集）** (`src/app/(admin)/admin/(dashboard)/locations/[id]/edit/_components/LocationMeoTab.tsx`):

- 既存の MEO タブ（Phase 1）に「GBP 同期」サブセクション追加
- 「今すぐ同期」ボタン（Phase 2 の domain command を呼ぶ）
- 最終同期時刻表示
- `gbpSyncEnabled` トグル
- エラーメッセージ表示

### 2.7 Cache Invalidation

GBP 同期は管理画面のみに影響するため、公開ページキャッシュは無関係。`CACHE_TAGS.LOCATIONS`（管理画面の locations 一覧再取得）のみ更新（既存 `updateLocation` の `afterSuccess` で実施済み）。

新規 cache tag は追加不要。Settings の `googleBusinessProfileAuth` は admin 専用クエリのため `CACHE_TAGS.INTEGRATION_SETTINGS` で既存 tag 範囲内。

### 2.8 エラー処理

- **retry 対象**: 429 / 500 / 503 + ネットワークエラー（`withGbpApiRetry()` で 3 回 exponential backoff、`external-api-retry-patterns.md` §共通原則準拠）
- **403 reason 検査**: `rateLimitExceeded` / `userRateLimitExceeded` / `quotaExceeded` は 429 と機能的同等として retry 対象（Google Calendar 同型）
- **即時失敗**: 400 / 401 / 403 (`forbidden` 等 usageLimits 以外) / 404 / 410（公式準拠）
- **graceful degradation**: 同期失敗時は throw せず `Location.gbpSyncError` に記録 → UI バッジ表示
- **logError**: `category: ErrorCategory.EXTERNAL_API`、`severity: ErrorSeverity.MEDIUM`（同期失敗は MEO 改善の遅延であり業務継続可能）
- **catch で `logError` 重複禁止**: command 内で `gbpSyncError` 記録のみ、catch ブロックでの追加 logError は `logError` SSoT に集約（`ical-patterns.md` §GCal Outbound Sync 同型）

---

## 3. 申請ワークフロー（並行作業）

実装と並行する事務手続きを `docs/guides/admin/google-business-profile-setup.md` に記載:

1. **Google Cloud Console**:
   - プロジェクト作成 / 既存プロジェクト選択（Calendar 統合と共有）
   - "My Business Business Information API" + "My Business Account Management API" 有効化
2. **OAuth 2.0 Client ID**:
   - 既存 `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` を流用
   - Authorized redirect URIs に `https://<domain>/api/gbp-callback` を追加
3. **API Access Request**:
   - [Business Profile API access form](https://developers.google.com/my-business/content/prereqs) 提出
   - 用途記載: "MEO management for rental space business with multiple locations"
   - 承認待ち（数日〜数週間）
4. **承認後**:
   - Stub mode 解除（`GBP_STUB_MODE` env 削除）
   - Production で OAuth flow 実行 → 動作確認

---

## 4. テスト戦略

### Unit Tests (`__tests__/unit/lib/google-business-profile/`)

- `withGbpApiRetry()` のリトライ判定ロジック（HTTP status / reason 検査、retry 対象 / 即時失敗の境界）
- `helpers.ts` の FieldMask 構築（latlng の有無で結果分岐）
- `helpers.ts` の `buildBusinessHoursPayload()`（`Location.businessHours` JSON → GBP TimePeriod 配列変換）
- `stub.ts` の no-op 動作

### Integration Tests (`__tests__/integration/domain/locations/gbp-sync-commands.test.ts`)

- `syncLocationToGbpCommand` の DB 更新（成功時: `gbpSyncedAt` 更新 / 失敗時: `gbpSyncError` 記録）
- `gbpSyncEnabled = false` 時の skip
- `googleBusinessPlaceId = null` 時の skip
- `googleBusinessProfileEnabled = false` 時の skip
- Settings から auth 取得 + 復号フロー
- `GBP_STUB_MODE=true` 時の早期 return
- `cloudflare` mock pollution 回避（C5 Phase 2 で確立した全 stub テンプレ準拠）

### Server Action Tests (`__tests__/integration/actions/admin/location-gbp-sync.test.ts`)

- `triggerGbpSync` Server Action の認証 / 権限チェック
- 成功時 / 失敗時の `MutationResult` shape

### E2E Tests

- 管理画面 Location 編集 → 「今すぐ同期」ボタン → 成功表示（stub mode 環境）
- OAuth 連携フロー（Google authorize は Playwright で skip、callback の DB 更新のみ確認）

実 API 呼び出しは stub mode、production smoke test は手動（access 承認後）。

---

## 5. マイグレーション

```sql
-- prisma/migrations/<ts>_add_gbp_sync_fields/migration.sql
ALTER TABLE "Settings" ADD COLUMN "googleBusinessProfileAuth" JSONB;
ALTER TABLE "Settings" ADD COLUMN "googleBusinessProfileEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Location" ADD COLUMN "gbpSyncEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Location" ADD COLUMN "gbpSyncedAt" TIMESTAMP(3);
ALTER TABLE "Location" ADD COLUMN "gbpSyncError" TEXT;

-- Index for staff filtering by sync error in admin dashboard
CREATE INDEX "Location_gbpSyncError_idx" ON "Location" ("gbpSyncError") WHERE "gbpSyncError" IS NOT NULL;
```

非破壊（全 ADD COLUMN with DEFAULT）のため `prisma migrate dev` で適用可能。

Settings シングルトンは既存レコード 1 行に対し `DEFAULT false` 適用で安全。

---

## 6. リスク・代替案

### リスク

| リスク                             | 軽減策                                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API access 承認が長期遅延          | stub mode で UI/domain 完成、承認後 env 切替で即稼働                                                                                                    |
| GBP API 仕様変更（Google 公式）    | adapter layer (`location-sync.ts`) で SDK 呼び出しを集約、テストで検出                                                                                  |
| OAuth token 失効                   | `withGbpApiRetry` 内で 401 時 refresh token 試行（Calendar 同型 `oauth2Client.on("tokens", ...)` パターン）                                             |
| Rate limit 超過（600 req/min）     | fireAndForget が複数同時実行されないよう Settings レベルで in-flight token 管理（v1 では skip、Phase 3 で追加）。Phase 2 では拠点数 <100 想定で問題なし |
| 単一 OAuth で全拠点管理の制約      | adapter 設計で将来 per-tenant OAuth 拡張可能に。Phase 2 では `Settings.googleBusinessProfileAuth` を SSoT、Phase 3 で `LocationGbpAuth` テーブル追加    |
| 単一 GBP アカウント != 全 Place ID | `accounts.list()` 後の locations.list() で範囲確認、Place ID が GBP アカウント外なら `gbpSyncError` に "Place ID not in account" 記録                   |

### Alternatives Considered

**A. service account による認証**: Google 公式制約で GBP API は service account 不可（owner consent 必須）。**却下**。

**B. bidirectional sync**: GBP 側の手動編集を detect する仕組みは GBP API に push 通知なく polling 必須で実装複雑度高。Conflict resolution UI も必要。Phase 2 では outbound only、Phase 3 以降で検討。**Phase 2 では却下**。

**C. per-tenant OAuth**: 各拠点オーナーが独自 GBP を接続。multi-tenant SaaS 化時に必要だが現運用では single-account で十分。adapter 設計で将来拡張可能に。**Phase 2 では却下**。

**D. cron による定期 sync**: Save 時 fireAndForget だけだと、外部編集後の差分検出ができない。Phase 2 では outbound only のため不要、Phase 3 で bidirectional 採用時に検討。**Phase 2 では却下**。

---

## 7. Phase 2 スコープ境界

### 含む

- OAuth 認証フロー（authorize / callback / revoke）
- Location → GBP outbound sync（minimum scope: name / address / phone / hours / website / latlng）
- 管理画面 UI（連携 / 解除 / 同期状態 / 手動同期）
- Stub mode（GBP_STUB_MODE env）
- エラー処理 + バッジ表示
- 申請ワークフロー documentation
- ADR 0027 採番

### 含まない（Phase 3+）

- Categories / amenityFeature 同期（業種特化が必要）
- Photos / Posts / Q&A / Services 同期
- bidirectional sync
- per-tenant OAuth
- 自動 geocoding（GBP 側に委譲）
- Rate limit token 管理（拠点数 100+ で必要、現運用では不要）

---

## 8. ADR ドラフト

`docs/architecture/decisions/0027-google-business-profile-sync.md` を実装時に新設:

- **Status**: Accepted (実装完了時に変更)
- **Date**: 実装完了日
- **Context**: GBP は MEO の primary signal で、Phase 1 完了時点では Location 情報の手動更新が運用負荷
- **Decision**:
  1. OAuth-based outbound sync（service account 不可、Google 公式制約）
  2. App SSoT、GBP は表示窓
  3. Single-account OAuth（multi-tenant 拡張は Phase 3）
  4. fireAndForget on save + manual button（Calendar outbound 同パターン）
  5. graceful degradation: error はバッジ表示、業務継続
  6. Stub mode で API access 承認待ち期間も実装完遂可能に
- **Alternatives**: service account / bidirectional / per-tenant / cron polling
- **Consequences**:
  - 利点: 拠点情報の二重管理解消、MEO スコア改善の自動化、`google-calendar/` パターン再利用
  - 欠点: API access 承認待ち（数日〜数週間）、外部編集との競合（運用ルールで吸収）

---

## 9. 実装の前提となる ground truth 確認

Plan 作成前に以下を実体検証する（CLAUDE.md §調査・監査の learning 適用）:

1. `serverEnv` への `GBP_STUB_MODE` 追加位置: `src/shared/lib/env/server.ts` の structure 確認
2. 既存 `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` の使用箇所と scope 追加可否（Calendar 統合との共有確認）
3. `encrypt()` / `decrypt()` の所在と Calendar OAuth token 保管との一貫性
4. `Location` テーブルの既存 index 構造確認（gbpSyncError partial index 衝突回避）
5. ADR 0027 番号衝突チェック（feature branch 含む）
6. `executeAdminMutationResult` の `afterSuccess` 戻り値型契約（`updateLocationCommand` の return が `{ id, slug }` を含むか実装で確認）
7. `withGoogleApiRetry` の export 位置と `withGbpApiRetry` の同型実装方針（外部 API retry 統一原則）

これらの ground truth は plan 作成時に grep で確定させ、plan 内に明記する。
