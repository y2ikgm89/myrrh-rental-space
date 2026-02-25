# DB スキーマ整合性・型安全修正 — 設計書

> 作成: 2026-02-26
> 調査: Prisma 7 公式ドキュメント (context7 検証済み)

---

## 背景

精査の結果、以下の問題を確認:

1. **型不整合**: `Reservation.taxRateType` が `String?` — 既存の `TaxRateType` Enum を未使用
2. **データ消失リスク**: `Media.uploader` が `onDelete: Cascade` — User 削除でメディア全削除
3. **暗黙の制約**: `Settings.cancellationTermsId` に `onDelete` 未指定
4. **Enum 未使用**: `InstagramPost.mediaType` が `String` — 値は 3 種に限定されるが型安全性なし
5. **重複招待可能**: `StaffInvitation.email` に unique constraint なし

---

## Prisma 7 公式確認事項（context7）

| 項目                   | 公式ドキュメント確認内容                                               |
| ---------------------- | ---------------------------------------------------------------------- |
| `onDelete: SetNull`    | FK フィールドが **nullable (`String?`)** である必要あり                |
| Partial Unique Index   | Prisma Schema Language で未サポート → **raw SQL migration** に手書き   |
| Enum 型変更            | `ALTER COLUMN ... TYPE ... USING column::EnumType` の CAST SQL 必須    |
| migration カスタム SQL | `bunx --bun prisma migrate dev --name xxx` で生成後 SQL ファイルを編集 |

---

## Migration 1 — 型安全修正（低リスク）

### 変更内容

#### ① `Reservation.taxRateType`: `String?` → `TaxRateType?`

**問題:** `Space.taxRateType TaxRateType @default(standard)` と不整合。文字列で `"standard"` / `"reduced"` を格納しているが型チェックなし。

**Schema 変更:**

```prisma
// Before
taxRateType String? // "standard" | "reduced"

// After
taxRateType TaxRateType? // 既存 enum を再利用
```

**Migration SQL (CAST — データ消失なし):**

```sql
ALTER TABLE "reservations"
  ALTER COLUMN "taxRateType" TYPE "TaxRateType"
  USING "taxRateType"::"TaxRateType";
```

**影響コード:** `reservation.taxRateType` を文字列比較しているコード → Enum 値に更新

---

#### ② `Settings.cancellationTermsId`: `onDelete: SetNull` 明示

**問題:** 現在 `onDelete` 未指定 → PostgreSQL デフォルトは `NO ACTION`（FK 制約違反で Terms 削除不可）。意図は "Terms 削除時に Settings.cancellationTermsId を NULL にする" はず。

**Schema 変更:**

```prisma
// Before
cancellationTerms Terms? @relation("CancellationPolicy", fields: [cancellationTermsId], references: [id])

// After
cancellationTerms Terms? @relation("CancellationPolicy", fields: [cancellationTermsId], references: [id], onDelete: SetNull)
```

**Migration SQL:** Prisma が FK 制約の `ON DELETE SET NULL` を自動生成

---

## Migration 2 — データ整合性修正（破壊的変更あり）

### 変更内容

#### ③ `Media.uploadedBy`: `String` → `String?` + `onDelete: SetNull`

**問題:** 現在 `onDelete: Cascade` → User を削除するとアップロード済みメディアが全削除される。Post・Space・Page から参照中のメディアが孤立する。

**公式確認:** `onDelete: SetNull` は FK が `nullable` でなければならない（context7 確認済み）

**Schema 変更:**

```prisma
// Before
uploadedBy String
uploader   User @relation(fields: [uploadedBy], references: [id], onDelete: Cascade)

// After
uploadedBy String?  // nullable に変更
uploader   User? @relation(fields: [uploadedBy], references: [id], onDelete: SetNull)
```

**Migration SQL:**

```sql
ALTER TABLE "media" ALTER COLUMN "uploadedBy" DROP NOT NULL;
-- FK 制約は Prisma が自動更新
```

**影響コード:**

- `media.uploadedBy` を non-null として扱っているコード → `?.` に変更
- `media.uploader` への non-null アクセス → optional chain

---

#### ④ `InstagramPost.mediaType`: `String` → `InstagramMediaType` Enum

**問題:** 値は `"IMAGE"` / `"VIDEO"` / `"CAROUSEL_ALBUM"` に限定されるが String 型で型安全性なし。

**Schema 変更:**

```prisma
// 新規 Enum 追加
enum InstagramMediaType {
  IMAGE
  VIDEO
  CAROUSEL_ALBUM
}

model InstagramPost {
  // Before
  mediaType String

  // After
  mediaType InstagramMediaType
}
```

**Migration SQL (CAST — データ消失なし):**

```sql
CREATE TYPE "InstagramMediaType" AS ENUM ('IMAGE', 'VIDEO', 'CAROUSEL_ALBUM');

ALTER TABLE "instagram_posts"
  ALTER COLUMN "mediaType" TYPE "InstagramMediaType"
  USING "mediaType"::"InstagramMediaType";
```

**影響コード:** `instagramPost.mediaType` の文字列比較 → Enum 値に更新

---

#### ⑤ `StaffInvitation`: Partial Unique Index（pending 招待の重複防止）

**問題:** 同一メールへの重複招待が可能（`@@index([email])` のみ）。

**設計:**

- `@@unique([email])` は「使用済み後の再招待」ができなくなるため不採用
- Partial Unique Index: `usedAt IS NULL` の行（未使用招待）のみ email unique を強制
- PostgreSQL では UNIQUE INDEX の NULL は別個として扱われるため、`usedAt IS NOT NULL` 行（使用済み）は制約対象外

**公式確認:** Prisma Migrate の unsupported feature workaround — raw SQL を migration ファイルに追記（context7 確認済み）

**Schema 変更（Prisma 側）:** なし（`@@index([email])` は維持）

**Migration SQL（手書き追記）:**

```sql
-- Partial Unique Index: 未使用招待（usedAt IS NULL）のみ email unique
CREATE UNIQUE INDEX "staff_invitations_email_pending_idx"
  ON "staff_invitations"("email")
  WHERE "usedAt" IS NULL;
```

**影響コード:** 重複招待作成時に DB レベルでエラー → `createStaffInvitation` アクションにエラーハンドリング追加

---

## 影響ファイル一覧

### Migration 1

| ファイル                            | 変更内容                                                |
| ----------------------------------- | ------------------------------------------------------- |
| `prisma/schema.prisma`              | `Reservation.taxRateType`、`Settings.cancellationTerms` |
| `prisma/migrations/*/migration.sql` | CAST SQL 確認・編集                                     |
| `src/**/actions/reservation.ts`     | `taxRateType` 文字列比較 → Enum                         |
| `src/**/actions/settings/*.ts`      | cancellationTerms 関連コード確認                        |

### Migration 2

| ファイル                                   | 変更内容                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| `prisma/schema.prisma`                     | `Media.uploadedBy`、`InstagramMediaType` Enum、`InstagramPost.mediaType` |
| `prisma/migrations/*/migration.sql`        | CAST SQL + Partial Index SQL 追記                                        |
| `src/**/actions/media.ts`                  | `uploadedBy` nullable 対応                                               |
| `src/**/components/*/MediaUploader.tsx` 等 | `uploader` optional chain                                                |
| `src/**/actions/instagram.ts`              | `mediaType` → Enum                                                       |
| `src/**/components/*/InstagramFeed.tsx`    | `mediaType` → Enum                                                       |
| `src/**/actions/staff.ts`                  | 重複招待エラーハンドリング追加                                           |

---

## リスク評価

| 変更                         | データ消失リスク           | ダウンタイム | ロールバック難易度      |
| ---------------------------- | -------------------------- | ------------ | ----------------------- |
| ① taxRateType CAST           | なし（CAST で変換）        | なし         | 低                      |
| ② cancellationTerms onDelete | なし                       | なし         | 低                      |
| ③ uploadedBy nullable        | なし（DROP NOT NULL のみ） | なし         | 低                      |
| ④ mediaType CAST             | なし（CAST で変換）        | なし         | 低                      |
| ⑤ Partial Index              | なし                       | なし         | 低（DROP INDEX で戻す） |

**全変更がゼロダウンタイム・データ消失なし** で適用可能。

---

## 実行順序

```
1. bun run validate（事前確認）
2. Migration 1 実装・適用
   - schema.prisma 変更
   - bunx --bun prisma migrate dev --name fix_reservation_taxratetype_and_settings_cascade
   - migration SQL 確認（CAST 自動生成 or 手動追記）
   - 影響コード修正（reservation.ts、settings アクション）
   - bun run validate
3. Migration 2 実装・適用
   - schema.prisma 変更（Media、InstagramPost）
   - bunx --bun prisma migrate dev --name fix_media_cascade_instagram_enum_invitation_unique
   - migration SQL に Partial Index を手動追記
   - 影響コード修正（media.ts、instagram.ts、staff.ts）
   - bun run validate && bun run build
4. db-migration-reviewer エージェントでレビュー（各マイグレーション適用前）
```
