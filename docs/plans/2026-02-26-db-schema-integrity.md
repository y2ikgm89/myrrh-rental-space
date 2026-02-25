# DB スキーマ整合性・型安全修正 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prisma スキーマの型不整合・データ整合性リスク・暗黙の制約を修正し、公式ベストプラクティス準拠のクリーンな状態にする

**Architecture:** 2回のマイグレーション（低リスク型安全修正 → 破壊的変更データ整合性修正）。CAST migration で既存データ無損失変換。Partial Unique Index は raw SQL migration で実装（Prisma 未サポートのため公式 workaround）。

**Tech Stack:** Prisma 7.4.1 + PostgreSQL 16、Bun、TypeScript 6.0-beta

**Design Doc:** `docs/plans/2026-02-26-db-schema-integrity-design.md`

---

## Migration 1: 型安全修正（低リスク）

### Task 1: `Reservation.taxRateType` スキーマ変更

**Files:**

- Modify: `prisma/schema.prisma`（line 491）

**Step 1: `schema.prisma` を編集**

```prisma
// Before (line 491)
taxRateType       String?  // "standard" | "reduced" - 適用された税率タイプ

// After
taxRateType       TaxRateType?  // 適用された税率タイプ（Space と統一）
```

**Step 2: `Settings.cancellationTerms` に `onDelete: SetNull` を追加**

```prisma
// Before (line 1089)
cancellationTerms Terms? @relation("CancellationPolicy", fields: [cancellationTermsId], references: [id])

// After
cancellationTerms Terms? @relation("CancellationPolicy", fields: [cancellationTermsId], references: [id], onDelete: SetNull)
```

**Step 3: type-check で現状確認**

```bash
bun run type-check
```

Expected: スキーマは未適用のためエラーなし（generated types はまだ String のまま）

---

### Task 2: Migration 1 を生成して SQL を確認・修正

**Files:**

- Create: `prisma/migrations/<timestamp>_fix_reservation_taxratetype_and_settings_cascade/migration.sql`

**Step 1: マイグレーションを生成（DB 未適用）**

```bash
bunx --bun prisma migrate dev --name fix_reservation_taxratetype_and_settings_cascade --create-only
```

Expected: `prisma/migrations/<timestamp>_fix_reservation_taxratetype_and_settings_cascade/migration.sql` が作成される

**Step 2: 生成された SQL を確認**

生成 SQL に以下が含まれているか確認（Prisma が自動生成する）:

```sql
-- Expected content
ALTER TABLE "reservations" ALTER COLUMN "taxRateType" TYPE "TaxRateType" USING "taxRateType"::"TaxRateType";
```

もし Prisma が `DROP COLUMN` + `ADD COLUMN` で生成した場合（データ消失リスク）は手動で CAST 形式に修正する。

**Step 3: `db-migration-reviewer` エージェントでレビュー**

```
Task ツールで db-migration-reviewer エージェントを呼び出し、
生成された migration.sql を SAFE / REVIEW NEEDED / BREAKING で評価する
```

**Step 4: マイグレーションを適用**

```bash
bunx --bun prisma migrate dev
```

**Step 5: Prisma クライアントを再生成**

```bash
bun run db:generate
```

Expected: `src/shared/generated/prisma/models/Reservation.ts` の `taxRateType` が `TaxRateType | null` に更新される

---

### Task 3: Migration 1 後のコード修正

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/space.ts`（line 107）

**Step 1: `space.ts` の手動型注釈を更新**

`formatSpaceToPlain` 関数のパラメータ型（line 107）を確認。

`Space.taxRateType` は元々 `TaxRateType @default(standard)` なので、この修正は Reservation の変更とは無関係だが、`string | null` という loose な型注釈が残っているため修正する:

```typescript
// Before (line 104-107 のパラメータ型)
discountType: string | null;
discountValue: number | null;
durationDiscountOverride: string | null;
taxRateType: string | null;

// After: Prisma 生成型に合わせる
discountType: DiscountType;
discountValue: number | null;
durationDiscountOverride: DurationDiscountOverride;
taxRateType: TaxRateType;
```

必要な import を追加:

```typescript
import type {
  DiscountType,
  DurationDiscountOverride,
  TaxRateType,
} from "@/shared/generated/prisma/enums";
```

**Step 2: `getValidTaxRateType` の呼び出しが不要になったか確認**

`s.taxRateType` が `TaxRateType` になった場合、`getValidTaxRateType(s.taxRateType)` は不要になる（直接代入可）。ただし `getValidTaxRateType` は他のファイル（`SpaceEditForm.tsx` など）でも使われているため、`enums.ts` から削除しない。`space.ts:143` の呼び出しのみ削除してよい。

**Step 3: type-check で確認**

```bash
bun run type-check
```

Expected: エラーなし

**Step 4: validate**

```bash
bun run validate
```

Expected: type-check + lint 通過

**Step 5: コミット**

```bash
git add prisma/schema.prisma prisma/migrations/ src/app/\(admin\)/admin/\(dashboard\)/_shared/actions/space.ts src/shared/generated/
git commit -m "fix(db): Reservation.taxRateType String→TaxRateType enum, Settings cancellationTerms onDelete:SetNull"
```

---

## Migration 2: データ整合性修正（破壊的変更）

### Task 4: Migration 2 スキーマ変更

**Files:**

- Modify: `prisma/schema.prisma`

**Step 1: `Media.uploadedBy` を nullable に変更**

context7 確認: `onDelete: SetNull` は FK が nullable である必要あり

```prisma
// Before (line 1437-1443)
uploadedBy String // アップロードユーザーID
...
uploader User @relation(fields: [uploadedBy], references: [id], onDelete: Cascade)

// After
uploadedBy String? // nullable: User削除時にnull化（SetNull）
...
uploader User? @relation(fields: [uploadedBy], references: [id], onDelete: SetNull)
```

**Step 2: `InstagramMediaType` Enum を追加、`InstagramPost.mediaType` を変更**

```prisma
// 既存の InstagramFeedLayout enum の直後に追加（line 217 付近）
enum InstagramMediaType {
  IMAGE
  VIDEO
  CAROUSEL_ALBUM
}

// InstagramPost model (line 1280)
// Before
mediaType    String // IMAGE, VIDEO, CAROUSEL_ALBUM

// After
mediaType    InstagramMediaType
```

**Step 3: `StaffInvitation` は schema 変更なし**

Partial Unique Index は raw SQL のみ（次の Task で migration SQL に手書き追記）

---

### Task 5: Migration 2 を生成して SQL を確認・修正

**Files:**

- Create: `prisma/migrations/<timestamp>_fix_media_cascade_instagram_enum_invitation_unique/migration.sql`

**Step 1: マイグレーションを生成（DB 未適用）**

```bash
bunx --bun prisma migrate dev --name fix_media_cascade_instagram_enum_invitation_unique --create-only
```

**Step 2: 生成された SQL を確認・修正**

生成 SQL に含まれるべき内容:

```sql
-- Media: DROP NOT NULL
ALTER TABLE "media" ALTER COLUMN "uploadedBy" DROP NOT NULL;

-- InstagramMediaType enum 作成
CREATE TYPE "InstagramMediaType" AS ENUM ('IMAGE', 'VIDEO', 'CAROUSEL_ALBUM');

-- InstagramPost.mediaType CAST（Prisma が自動生成しない場合は手動追記）
ALTER TABLE "instagram_posts"
  ALTER COLUMN "mediaType" TYPE "InstagramMediaType"
  USING "mediaType"::"InstagramMediaType";
```

**Step 3: Partial Unique Index を migration SQL に手書き追記**

context7 確認: Prisma 未サポートの DB 機能は migration SQL ファイルに直接追記（公式 workaround）

migration.sql の末尾に追加:

```sql
-- Partial Unique Index: 未使用招待（usedAt IS NULL）のみ email unique
-- （Prisma Schema Language 未サポートのため raw SQL で実装）
CREATE UNIQUE INDEX "staff_invitations_email_pending_idx"
  ON "staff_invitations"("email")
  WHERE "usedAt" IS NULL;
```

**Step 4: `db-migration-reviewer` エージェントでレビュー**

```
Task ツールで db-migration-reviewer エージェントを呼び出し、
SAFE / REVIEW NEEDED / BREAKING を確認する
```

**Step 5: マイグレーションを適用**

```bash
bunx --bun prisma migrate dev
```

**Step 6: Prisma クライアントを再生成**

```bash
bun run db:generate
```

Expected:

- `src/shared/generated/prisma/models/Media.ts`: `uploadedBy: string | null`
- `src/shared/generated/prisma/enums.ts`: `InstagramMediaType` が追加される
- `src/shared/generated/prisma/models/InstagramPost.ts`: `mediaType: InstagramMediaType`

---

### Task 6: `Media.uploadedBy` nullable 対応コード修正

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/media.ts`（line 84-109, 329）

**Step 1: `transformMedia` の `uploader` アクセスを optional chain に変更**

現在 (line 105-108):

```typescript
uploader: {
  id: media.uploader.id,
  name: media.uploader.name,
},
```

`uploadedBy` が nullable になると `uploader` も `User | null` になるため:

```typescript
uploader: media.uploader
  ? { id: media.uploader.id, name: media.uploader.name }
  : null,
```

**Step 2: `MediaData` 型の `uploader` フィールドを optional に変更**

`MediaData` 型定義（actions/media.ts 上部 or validations/media.ts）で:

```typescript
// Before
uploader: { id: string; name: string }

// After
uploader: { id: string; name: string } | null
```

**Step 3: `existing.uploadedBy !== user.id` の比較を null-safe に**

line 329:

```typescript
// Before
if (isEditorRole(user.role) && existing.uploadedBy !== user.id) {

// After（uploadedBy が null の場合は他ユーザーのメディアとして扱う）
if (isEditorRole(user.role) && existing.uploadedBy !== user.id) {
  // null の場合は orphaned media — EDITOR は編集不可（ADMINのみ可）
```

実際には null チェックは不要（`null !== user.id` は true なので EDITOR は拒否される = 正しい動作）。コメントを追加するだけでよい。

**Step 4: type-check**

```bash
bun run type-check
```

**Step 5: uploader を使っている UI コンポーネントも確認**

```bash
bun run type-check 2>&1 | grep -i "uploader\|uploadedBy"
```

型エラーが出たコンポーネントを修正（`uploader?.name ?? '不明'` 等）

---

### Task 7: `InstagramPost.mediaType` Enum 対応コード修正

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/lib/instagram.ts`（line 17-19）
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/instagram.ts`（line 365）

**Step 1: `instagram.ts` lib のローカル型を Prisma Enum に置き換え**

```typescript
// Before (src/app/(admin)/admin/(dashboard)/_shared/lib/instagram.ts line 17-19)
export type InstagramMediaType = "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
const VALID_MEDIA_TYPES: ReadonlySet<string> = new Set([
  "IMAGE",
  "VIDEO",
  "CAROUSEL_ALBUM",
]);

// After: Prisma 生成の enum を使用
import { InstagramMediaType } from "@/shared/generated/prisma/enums";
export type { InstagramMediaType }; // re-export（外部から使っている場合）
const VALID_MEDIA_TYPES: ReadonlySet<string> = new Set(
  Object.values(InstagramMediaType),
);
```

**Step 2: `instagram.ts` action の string literal を Enum 値に変更**

```typescript
// Before (line 365)
mediaType: 'IMAGE', // デフォルト値、oEmbed取得時に更新

// After
mediaType: InstagramMediaType.IMAGE, // デフォルト値、oEmbed取得時に更新
```

必要な import 追加:

```typescript
import { InstagramMediaType } from "@/shared/generated/prisma/enums";
```

**Step 3: `item.media_type` の代入箇所を確認**

`instagram.ts:134`:

```typescript
mediaType: item.media_type,
```

Instagram API は `media_type` として文字列を返す。型キャストが必要:

```typescript
// item.media_type は 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' のいずれか（API保証）
mediaType: item.media_type as InstagramMediaType,
```

**Step 4: type-check**

```bash
bun run type-check
```

---

### Task 8: `StaffInvitation` 重複招待エラーハンドリング

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/staff-invitation.ts`

**Step 1: 既存の重複チェックロジックを確認**

line 91-102 に既存チェックがある:

```typescript
const existingInvitation = await prisma.staffInvitation.findFirst({
  where: { email, usedAt: null, expiresAt: { gt: new Date() } },
  ...
})
if (existingInvitation) {
  return createFailure('このメールアドレスには既に有効な招待が存在します。...')
}
```

Partial Unique Index 追加後、DB レベルでもエラーが出るようになる。`prisma.staffInvitation.create` が `unique constraint` で失敗した場合のハンドリングを追加:

```typescript
try {
  const invitation = await prisma.staffInvitation.create({ data: { ... } })
  // ...
} catch (error) {
  // Partial Unique Index 違反: 同一メールの pending 招待が既に存在
  if (
    error instanceof Error &&
    error.message.includes('staff_invitations_email_pending_idx')
  ) {
    return createFailure('このメールアドレスには既に有効な招待が存在します。')
  }
  logError(normalizeError(error), {
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.HIGH,
    context: { operation: 'sendInvitation', email },
  })
  return createFailure('招待の作成に失敗しました')
}
```

（既存の `findFirst` チェックが先に動くので、DB エラーは理論上発生しないが、race condition 対策）

**Step 2: type-check & validate**

```bash
bun run validate
```

---

### Task 9: 最終検証

**Step 1: 完全検証**

```bash
bun run validate && bun run build
```

Expected: type-check + lint + build 全通過

**Step 2: migration 状態確認**

```bash
bunx --bun prisma migrate status
```

Expected: `All migrations have been applied`

**Step 3: `project-reviewer` エージェントでレビュー**

```
Task ツールで project-reviewer エージェントを呼び出し、
修正コードの型安全・rules 準拠を確認する
```

**Step 4: 最終コミット**

```bash
git add prisma/schema.prisma prisma/migrations/ src/shared/generated/ \
  src/app/\(admin\)/admin/\(dashboard\)/_shared/actions/media.ts \
  src/app/\(admin\)/admin/\(dashboard\)/_shared/actions/instagram.ts \
  src/app/\(admin\)/admin/\(dashboard\)/_shared/actions/staff-invitation.ts \
  src/app/\(admin\)/admin/\(dashboard\)/_shared/lib/instagram.ts
git commit -m "fix(db): Media onDelete:SetNull, InstagramMediaType enum, StaffInvitation partial unique index"
```

---

## 注意事項

### `prisma generate` 後は generated ファイルを手動編集しない

`src/shared/generated/` は `bun run db:generate` で完全上書きされる。型エラーが出た場合は schema/migration を修正してから再生成する。

### Migration SQL の CAST が自動生成されない場合

Prisma が `DROP COLUMN` + `ADD COLUMN` を生成した場合は手動で以下に書き換える:

```sql
-- taxRateType
ALTER TABLE "reservations"
  ALTER COLUMN "taxRateType" TYPE "TaxRateType"
  USING "taxRateType"::"TaxRateType";

-- mediaType
CREATE TYPE "InstagramMediaType" AS ENUM ('IMAGE', 'VIDEO', 'CAROUSEL_ALBUM');
ALTER TABLE "instagram_posts"
  ALTER COLUMN "mediaType" TYPE "InstagramMediaType"
  USING "mediaType"::"InstagramMediaType";
```

### db-migration-reviewer は各マイグレーション適用前に必ず呼ぶ

`bunx --bun prisma migrate dev` の前に Task ツール経由で `db-migration-reviewer` を使い SAFE 判定を得てから適用する。
