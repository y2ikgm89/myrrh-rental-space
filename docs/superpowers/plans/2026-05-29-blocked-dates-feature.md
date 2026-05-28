# 臨時休業 / 急な休み機能 (BlockedDate) 実装計画

## 背景

レンタルスペース業の運営では「設備故障で 1 つのスペースだけ閉鎖」「拠点全体が年末年始休業」「全店一斉休業 (大規模災害等)」の 3 階層で休業を扱う必要がある。

既存 `businessHours` (Settings / Location / Space の 3 階層 cascade、validation / 予約バリデーション / 公開予約フォームに統合済) では **曜日別の通常営業時間と定休日** までしか表現できず、「特定の日付範囲のみ閉鎖」は別データモデルが必要。

## 業界調査

| 製品                     | per-space 休業    | per-location 休業  | global 休業      |
| ------------------------ | ----------------- | ------------------ | ---------------- |
| **Spacemarket**          | ✅ スペース設定   | ✗                  | ✗                |
| **インスタベース**       | ✅ スペース設定   | ✗                  | ✗                |
| **Airbnb**               | ✅ リスティング   | ✗ (単一 host 想定) | ✗                |
| **Booking.com Extranet** | ✅ 部屋設定       | ✅ property 全体   | ✗                |
| **Cal.com**              | ✅ event type     | ✗                  | ✅ team schedule |
| **Mindbody**             | ✅ resource       | ✅ location        | ✅ global        |
| **Square Appointments**  | ✅ staff/resource | ✅ location        | ✗                |

→ **3 階層 cascade** が業界 canonical (Booking.com / Mindbody / Square 採用)。本プロジェクトは既存 `businessHours` も 3 階層構造で実装済のため整合性高い。

## ゴール

- [ ] `BlockedDate` model を導入し、per-space / per-location / global の 3 階層で「臨時休業 / 急な休み」を管理できる
- [ ] 予約可能性判定 (`getAvailableSlots`) に統合し、blocked dates の予約を物理的に防止する
- [ ] 公開予約フォームのカレンダー / 時間帯選択で blocked dates を grey-out 表示する
- [ ] 管理画面で per-space / per-location / global の各レベルで blocked date を CRUD できる

## 既存実装との関係

| 機能                     | 既存                             | BlockedDate で新規                 |
| ------------------------ | -------------------------------- | ---------------------------------- |
| 通常営業時間 (曜日別)    | ✅ `businessHours.{mon,...,sun}` | 不要                               |
| 定休日 (毎週水曜休み等)  | ✅ `businessHours.wed = null`    | 不要                               |
| 期間指定休業 (12/29-1/3) | ✗                                | ✅                                 |
| 単日休業 (急な休み)      | ✗                                | ✅                                 |
| 設備故障による無期限閉鎖 | ✗                                | ✅ (`Space.isActive = false` 併用) |

## データモデル

```prisma
model BlockedDate {
  id          String   @id @default(uuid()) @db.Uuid
  /// "SPACE" | "LOCATION" | "GLOBAL"
  scope       String   @db.VarChar(16)
  /// scope=SPACE のみ
  spaceId     String?  @db.Uuid
  /// scope=LOCATION のみ
  locationId  String?  @db.Uuid
  /// 単日休業は startDate=endDate
  startDate   DateTime @db.Date
  endDate     DateTime @db.Date
  /// "年末年始" / "設備点検" / "台風 19 号による臨時休業" 等
  reason      String?  @db.VarChar(200)
  /// "HOLIDAY" | "MAINTENANCE" | "EMERGENCY" | "OTHER"
  type        String   @db.VarChar(32)
  createdBy   String   @db.Uuid
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  space    Space?    @relation(fields: [spaceId], references: [id], onDelete: Cascade)
  location Location? @relation(fields: [locationId], references: [id], onDelete: Cascade)
  creator  User      @relation(fields: [createdBy], references: [id], onDelete: Restrict)

  @@index([scope, startDate, endDate])
  @@index([spaceId, startDate, endDate])
  @@index([locationId, startDate, endDate])
  @@map("blocked_dates")
}
```

**設計判断**:

- `scope` と `type` は `String @db.VarChar` + `isValidBlockedDateScope` / `isValidBlockedDateType` 型ガード SSoT で運用。Prisma enum 化すると `add-prisma-enum` 規律で 8 箇所更新が必要になり 1 PR の粒度を超えるため、本プロジェクトの `NOTIFICATION_TYPE` パターン (`@/shared/lib/validations/enums/helpers`) と同じ string + 型ガード方式を採用。enum 化が必要になったら Phase 6+ で別 PR
- `startDate` / `endDate` は `@db.Date` (時刻なし) — 「12/29-1/3 休業」のような日付範囲表現が業界標準 (Booking.com / Spacemarket)
- 時刻単位の休業 (例: 14:00-18:00 だけ閉鎖) は `businessHours` 側で per-day override を使うべき (BlockedDate の責務外)
- `scope` discriminated union 制約 (SPACE → spaceId 必須、LOCATION → locationId 必須、GLOBAL → 両 null) は Zod refine + DB CHECK 制約で二重防御
- ON DELETE CASCADE: スペース / 拠点削除時に紐づく BlockedDate も削除 (孤児防止)

## 予約可能性判定の cascade ロジック

```typescript
// src/shared/domain/reservations/availability.ts に追加
async function isDateBlocked(
  spaceId: string,
  locationId: string,
  targetDate: Date,
): Promise<{ blocked: true; reason: string | null } | { blocked: false }> {
  const blocked = await prisma.blockedDate.findFirst({
    where: {
      startDate: { lte: targetDate },
      endDate: { gte: targetDate },
      OR: [
        { scope: "GLOBAL" },
        { scope: "LOCATION", locationId },
        { scope: "SPACE", spaceId },
      ],
    },
    orderBy: [{ scope: "asc" }], // GLOBAL → LOCATION → SPACE の優先度で reason を返す
  });
  return blocked
    ? { blocked: true, reason: blocked.reason }
    : { blocked: false };
}
```

`getAvailableSlots(spaceId, date)` の冒頭で `isDateBlocked` を呼び、blocked なら空配列を返す。

## Phase 分割 (PR 単位、1 PR = 1 logical change)

### PR #1: schema + migration + 型ガード SSoT (3-5 file)

- `prisma/schema.prisma` に `BlockedDate` model + Space/Location/User の relation 追加
- `prisma/migrations/<ts>_create_blocked_dates/migration.sql` (手書き、Python heredoc 経由)
  - `CREATE TABLE blocked_dates` + index 3 件 + CHECK 制約 (scope discriminated union)
- `@/shared/lib/validations/enums/helpers.ts` に `BLOCKED_DATE_SCOPE` / `BLOCKED_DATE_TYPE` 定数 + `isValid*` 型ガード + `*_LABELS` 追加
- `bun run db:generate` で Prisma Client 再生成

**stop 例外該当**: prisma/migrations 含むため auto-merge 停止、user 確認必須

### PR #2: domain layer (5-7 file)

- `src/shared/domain/blocked-dates/types.ts` (`BlockedDate` / `BlockedDateInput` / `BlockedDateSummary`)
- `src/shared/domain/blocked-dates/queries.ts` (`getBlockedDatesForSpace` / `getBlockedDatesForLocation` / `getGlobalBlockedDates`)
- `src/shared/domain/blocked-dates/commands.ts` (`createBlockedDateCommand` / `updateBlockedDateCommand` / `deleteBlockedDateCommand`)
- `src/shared/lib/validations/blocked-date.ts` (Zod schema、scope discriminated union refine)
- `__tests__/unit/domain/blocked-dates/commands.test.ts`

### PR #3: 予約可能性判定への組込 (3-5 file)

- `src/shared/domain/reservations/availability.ts` に `isDateBlocked` 追加
- `getAvailableSlots` で blocked check を冒頭に
- `__tests__/unit/shared/lib/reservation/blocked-dates.test.ts`
- 既存 reservation test fixture 更新

### PR #4: 公開予約フォーム grey-out (3-5 file)

- `src/app/(public)/reservation/_components/calendar-picker.tsx` で blocked dates 取得 + visual disable
- `src/app/(public)/reservation/_components/date-time-section.tsx` で blocked メッセージ表示
- e2e: 既存 reservation flow に blocked date 試行で 422 エラー追加

### PR #5: 管理 UI — per-space 臨時休業 tab (5-7 file)

- スペース編集ページに `section=blocked-dates` tab を追加
- `BlockedDatesField` Client Component (一覧 + 追加 dialog + 削除)
- Server Actions: `createSpaceBlockedDate` / `deleteSpaceBlockedDate`
- 既存 `SpaceEditForm` の tab error count badge と整合

### PR #6: 管理 UI — per-location 臨時休業 tab (5-7 file)

- 拠点編集ページに blocked dates tab 追加 (PR #5 component 再利用)
- 拠点配下の全 space に休業伝播することを UI で明示 (preview 件数表示)

### PR #7: 管理 UI — global 休業日 (5-7 file)

- `/admin/settings/holidays` 新規ページ (settings サブメニュー)
- 一覧 + CRUD
- ユースケース: 全社年末年始 / 大規模災害

### PR #8 (optional): 公開ページ「お知らせ」自動連携

- 大型 blocked date (global / location scope, type=HOLIDAY) を `/news` に自動転載 (要相談)
- Booking.com / Airbnb の「次回オープン日」表示パターン

## 自動完遂ポリシーとの関係

- PR #1 は **prisma/migrations 含む + schema 追加 (model 1 + index 3) → CLAUDE.md 停止例外**該当 (auto-merge 停止、user 明示承認必須)
- PR #2-8 は通常の auto-merge 可 (各 5-10 file 範囲、1 PR = 1 logical change)
- 各 PR の完了は `bun run validate && bun run build` + 該当 test pass を条件

## セッション分割

| セッション   | 範囲                                          |
| ------------ | --------------------------------------------- |
| 次セッション | PR #1 (schema + migration)、user 承認 → apply |
| その次       | PR #2-3 (domain + 予約バリデーション)         |
| その次       | PR #4-5 (公開 grey-out + per-space UI)        |
| その次       | PR #6-7 (per-location + global UI)            |
| 必要なら     | PR #8 (news 自動連携)                         |

## 業界根拠リンク

- [Booking.com Extranet — Availability calendar](https://partner.booking.com/) (property + room 階層)
- [Spacemarket 管理画面](https://spacemarket.com/) (per-space scope)
- [Airbnb Host — Calendar](https://www.airbnb.com/host/calendar) (per-listing scope)
- [Mindbody Business — Schedule](https://www.mindbodyonline.com/business) (global + location + resource 階層)
- [Cal.com — Date overrides](https://cal.com/docs/core-features/availability)
- NN/g "Calendar Availability UX" — visual disabled state + reason tooltip パターン

## オープン課題 (次セッションで判断)

- [ ] 過去日付の blocked date を CRUD で編集可能にすべきか? (監査ログ的には immutable が canonical、ただし誤入力 fix 用に編集枠は残す方が UX 良)
- [ ] BlockedDate の `reason` を Lexical rich text にすべきか? (`/news` 自動転載を考えると rich text 検討余地、ただし冒頭は plain text で十分)
- [ ] per-location blocked date は配下 space 個別の例外 (「拠点全体休業だが A 室だけ営業」) を許容するか? (推奨: 不許容 = 単純化、必要なら GLOBAL > LOCATION > SPACE の override 順を文書化)
- [ ] Cloud Run 環境で DB の `@db.Date` 列のタイムゾーン取り扱い (JST 境界での予約判定との整合性)
