# Test Drift Remediation Plan

**日付**: 2026-04-15
**種別**: リファクタリング / テスト修正
**ステータス**: 設計承認待ち

---

## 概要

`bun run test:all` 実行時に 30+ 件のテスト失敗を発見。CLAUDE.md / README は「1441 tests pass」と記載しているが、実態はセッション外での drift が蓄積してテストが壊れている。`bun run validate`（type-check + lint）は通過するため、テストランナー以外では検出不能。

本プランで段階的に修復し、CI ベースラインを復旧する。

---

## 失敗カテゴリと規模

| #   | ファイル / カテゴリ                                 | 失敗数      | 原因                                                                         | 優先度 |
| --- | --------------------------------------------------- | ----------- | ---------------------------------------------------------------------------- | ------ |
| 1   | `architecture-boundaries.test.ts`                   | 93 offender | app 層で `@generated/prisma` を直接 import（値/型）                          | **高** |
| 2   | `errors/logger.test.ts`                             | 17          | `logError` / `createErrorLogger` / `ErrorCategory` API refactor              | 高     |
| 3   | `validations/event.test.ts`                         | 7           | `publicEventRegistrationSchema` / `adminEventRegistrationSchema` schema 変更 | 中     |
| 4   | `validations/page.test.ts`                          | 4           | `SYSTEM_PAGES` / `isSystemPageSlug` / `canDeletePage` API 変更               | 中     |
| 5   | `validations/section.test.ts`                       | 3           | HERO / CTA section defaults 構造変更                                         | 低     |
| 6   | `validations/location.test.ts`                      | 2           | `businessHours` refine                                                       | 低     |
| 7   | `validations/enums.test.ts`, `file.test.ts`, その他 | 3           | `isValidTermsType` / `ALLOWED_MIME_TYPES.OTHER`                              | 低     |

---

## Workstream 1: architecture-boundaries 修復（最大）

### 現状

- `@generated/prisma/enums` を app 層 103 ファイルが import（単一行 import は 93、複数行を含めると 103）
- 内訳: **値 import 68**（bundle dependency あり）+ **型 import 25**（runtime で erase されるため無害）
- 公式 re-export 層なし
- `src/shared/lib/validations/enums/` は `isValid*` / `getValid*` / const 定数は export するが、**型・値の re-export はしていない**

### 方針: `validations/enums/` をゲートウェイ化

既存の `src/shared/lib/validations/enums/` は既にアプリ全体から参照されており Prisma enum と密結合しているため、ここを公式 re-export ハブに昇格する。

### Task 1.1: enum 型 / 値の re-export

**Files:**

- Create: `src/shared/lib/validations/enums/prisma-types.ts`
- Modify: `__tests__/unit/architecture-boundaries.test.ts`

**Step 1**: `prisma-types.ts` 作成

```typescript
// 型 re-export（erase されるが import type での一貫性のため）
export type {
  Role,
  ReservationStatus,
  PaymentStatus,
  InquiryStatus,
  CustomerStatus,
  LayoutWidth,
  PostStatus,
  NewsStatus,
  TermsStatus,
  TermsType,
  AuditAction,
  MediaType,
  MediaUsage,
  CouponType,
  DiscountType,
  DurationDiscountOverride,
  TaxRateType,
  TaxDisplayMode,
  TaxInputMode,
  DiscountCombinationMode,
  AnalyticsType,
  InstagramFeedLayout,
  AnnouncementBarType,
  AnnouncementBarAnimation,
  AnnouncementBarDesignStyle,
  HeaderScrollBehavior,
  HeaderBackgroundMode,
  CalendarSyncMethod,
  NavigationType,
  SocialPlatform,
  EventStatus,
  // ... 全 Prisma enum
} from "@generated/prisma/enums";

// 値 re-export（ランタイム比較に必要な enum オブジェクト）
export {
  Role,
  ReservationStatus,
  PaymentStatus,
  InquiryStatus,
  CustomerStatus,
  LayoutWidth,
  PostStatus,
  NewsStatus,
  TermsStatus,
  TermsType,
  AuditAction,
  MediaType,
  MediaUsage,
  CouponType,
  DiscountType,
  DurationDiscountOverride,
  TaxRateType,
  TaxDisplayMode,
  TaxInputMode,
  DiscountCombinationMode,
  AnalyticsType,
  InstagramFeedLayout,
  AnnouncementBarType,
  AnnouncementBarAnimation,
  AnnouncementBarDesignStyle,
  HeaderScrollBehavior,
  HeaderBackgroundMode,
  CalendarSyncMethod,
  NavigationType,
  SocialPlatform,
  EventStatus,
} from "@generated/prisma/enums";
```

**Step 2**: `architecture-boundaries.test.ts` の allowlist 追加

```typescript
// 既存: .filter((file) => !file.startsWith(SHARED_DB_ROOT))
// 新: shared/lib/validations/enums/ を公式 gateway として除外
const ENUMS_GATEWAY_ROOT = join(SRC_ROOT, "shared", "lib", "validations", "enums");
.filter((file) => !file.startsWith(SHARED_DB_ROOT) && !file.startsWith(ENUMS_GATEWAY_ROOT))
```

**Step 3**: `bun test __tests__/unit/architecture-boundaries.test.ts` 実行 → 103 offender は残ったまま、**gateway 自身は通過確認**のみ。

### Task 1.2: app 層 import 一括置換（sed / Explorer で実施）

**Files:**

- Modify: 103 ファイル（`src/app/**` の `from "@generated/prisma*"` を `from "@/shared/lib/validations/enums/prisma-types"` に）
- Modify: `src/app/**` 以外の `src/shared/` でも同様の違反があれば対象

**Step 1**: 置換コマンド（Grep で全ファイル確認→個別 Edit）

```bash
# 対象リスト
grep -rl "@generated/prisma" src/app/ src/shared/ | grep -v shared/db | grep -v shared/lib/validations/enums
```

**Step 2**: 各ファイルで `@generated/prisma/enums` → `@/shared/lib/validations/enums/prisma-types` に置換、サブパス（`@generated/prisma/types` 等）も同様に

**Step 3**: 型チェック `bun run type-check` → 0 errors

**Step 4**: `bun test __tests__/unit/architecture-boundaries.test.ts` → PASS

### Task 1.3: 無効化されている `TestimonialNode` 等のレガシー import も並行修正

（調査中に発見した場合のみ。それ以外は Task 1.2 で完結）

### Commit 分割

- Commit A: Task 1.1（gateway 作成 + test 更新）
- Commit B: Task 1.2（app 層一括置換） — 1 ファイルあたり 1 Edit で約 100 コミットになるため、**サブディレクトリ単位でバンドル**（admin dashboard / public mypage / shared actions 等）

---

## Workstream 2: errors/logger テスト修復（17 failures）

### 現状確認（TDD で修復前に実施）

1. 現行 `src/shared/lib/errors/` の実装をダンプ
2. テストが期待する API との差分を特定
3. **実装側が正・テストが drift** として扱い、テスト側を実装に合わせる
4. どうしても実装側のバグなら gotcha 追加 + 実装修正

### Task 2.1: `__tests__/unit/lib/errors/logger.test.ts` の書き直し

- 現行 `logError(error, { category, severity, context })` シグネチャに合わせる
- `createErrorLogger` / `safeFetch` / `criticalFetch` の実挙動を検証
- モック干渉を最小化（`logger-core` を直接使用）

---

## Workstream 3: validations テスト修復（19 failures）

### 方針

各 `validations/*.test.ts` を **実スキーマに合わせて書き直す**。実装側の API が正。

### Task 3.1: `event.test.ts`（7 failures）

`publicEventRegistrationSchema` / `adminEventRegistrationSchema` の現行 `safeParse` 結果に合わせてケース更新。

### Task 3.2: `page.test.ts`（4 failures）

`SYSTEM_PAGES` / `isSystemPageSlug` / `canDeletePage` の現在の実装を確認。`"privacy"` がシステムページでなくなった等の変化に対応。

### Task 3.3: `section.test.ts`（3 failures）

HERO `height` / CTA `sectionLabel` デフォルトの変更を反映。

### Task 3.4: `location.test.ts` / `enums.test.ts` / `file.test.ts`（残 5 failures）

`businessHours` refine、`isValidTermsType`、`ALLOWED_MIME_TYPES.OTHER` を実装に合わせる。

---

## Workstream 4: 検証と CI 復旧

### Task 4.1: 最終検証

```bash
bun run test:unit
bun run test:integration
bun run test:all
bun run validate && bun run build
```

**完了基準**: 全 PASS、失敗ゼロ。

### Task 4.2: README / CLAUDE.md 更新

テスト数の実数値を反映（現在「1441」主張 → 実測値で更新）。

---

## Risk Notes

- **Workstream 1 の規模**: 103 ファイル置換は機械的だが、`@generated/prisma/types`（非 enums サブパス）の import もある可能性。事前 grep で全体把握。
- **Workstream 2 の不確実性**: 実装/テストどちらが正か、17 failures を実際に読むまで不明。TDD で先にテストを書き直すのではなく、**実装をテストに合わせる** 判断になる場合もある。
- **`@generated/prisma` の値 import 削除は runtime bundle が変化する**: Tree-shaking 経路が変わる可能性あり。`bun run build` でバンドルサイズを確認。
- **subagent-driven-development 活用**: Workstream 1 Task 1.2 の 100+ ファイル置換は 1 implementer にバンドル（型依存あり）。Workstream 2, 3 は独立のため並列可。

---

## Execution Notes

- **総タスク数**: 約 10 タスク（20-30 コミット）
- **推定所要時間**: 6-10 時間（並列化で 3-5 時間）
- **完了基準**: Task 4.1 の全ステップが PASS、README 実数値反映
