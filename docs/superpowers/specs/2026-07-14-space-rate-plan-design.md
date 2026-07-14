# Space Rate Plan (曜日別 / 時間帯別 / 特定期間 / 祝日料金) 設計

- 日付: 2026-07-14
- ステータス: 承認待ち (brainstorming 完了、writing-plans 前)

## 背景

現状のレンタルスペース予約サイトは、Space ごとに単一の `hourlyPrice` (基本料金) しか持てず、金曜夜・週末・祝日・GW/年末年始等の需要ピーク時に価格を上げる手段がない。業界最大手のスペースマーケットは「特別営業」機能で time-of-day + day-of-week + specific-period の 3 軸で料金上書きを提供しており、Peerspace (米国) も Calendar Pricing で同 2 軸をサポートする。本設計は当リポジトリに業界標準の rate rule システムを新設する。

Deep research (107 subagent, 25 primary source 22 claim 確定) の結論として、日本最大手スペースマーケットが採用する「基本料金 < 特別料金プラン」の 2 階層 override + 「更新日の新しい設定が優先」(last-updated-wins) の優先度解決が hourly-rental で最も business-appropriate なパターンであると確認した。本設計はこのパターンに準拠する。

同時に、調査で判明した既存 3 件の bug (税フィールドが `Reservation.create` で書き込まれない・`hourlyPrice × hours` の二重計算・単価スナップショット欠如) を、後方互換なしのクリーン実装として同時修正する。ユーザーは「破壊的変更 OK」「migration しっかり」を明言している。

## 調査で確定した事実 (前提)

### 現状 schema (`prisma/schema.prisma:409-641`)

- `Space.hourlyPrice Decimal @db.Decimal(10, 2)` — NOT NULL (必須)。
- `Space.dailyPrice Decimal? @db.Decimal(10, 2)` — nullable、**現状スキーマにあるが計算経路が参照していない未使用カラム**。
- `Space.discountType/discountValue/durationDiscountOverride/taxRateType` — スペース固有割引と税率タイプ。
- `Reservation.totalPrice/basePrice/couponDiscountAmount/durationDiscountAmount/spaceDiscountAmount/taxRateType/taxRate/taxAmount/totalPriceWithTax` — いずれも nullable。
- 「曜日別・時間帯別・祝日別・季節別」に類する enum / column は schema 全域に存在しない (grep 0 件)。

### 価格計算経路

- SSoT: `src/shared/lib/pricing/reservation.ts:30` `calculateReservationPrice` (basePrice → space割引 → 長時間割引 → クーポン → 併用モード決定 → totalPrice)。
- 入口: `src/shared/domain/reservations/payloads.ts:62-70` `calculateHoursAndBasePrice` (`hourlyPrice × hours` の乗算)。
- 呼出元: `public-commands.ts:105`, `admin-commands.ts:103,283`, `customer-commands.ts:285-319` の 3 経路すべて `calculateHoursAndBasePrice` を通る。
- 3 経路のフォーム側 (`reservation-form.tsx:250`, admin `ReservationForm.tsx:136`, `ReservationEditForm.tsx:164`) からもプレビュー計算で呼ばれる。

### 判明した既存 bug

1. **税フィールドが create で書かれない**: `createPublicReservationCommand` / `createAdminReservationCommand` のどちらも `Reservation.create` に `taxRate/taxRateType/taxAmount/totalPriceWithTax` を渡していない。update と `receipts/issue.ts:158-221` で fallback (`totalPriceWithTax ?? totalPrice`) が入っているため気付きにくい状態。
2. **`hourlyPrice × hours` の二重計算**: `calculateHoursAndBasePrice` と `calculatePricing` の両方で同じ乗算をしている (同値なので誤動作はしないが冗長)。
3. **単価スナップショット無し**: Reservation に `basePrice` はあるが `hourlyPrice` snapshot がない。料金改定後に過去予約の内訳復元が不可能。

### 管理画面

- `SpaceEditForm.tsx:152` に `pricing` タブがあり、`hourlyPrice`/`dailyPrice`/割引/税率が同居。
- 1719 行の巨大ファイル。既に縦に長い。conform useForm + hidden input 転写パターン。
- 既に `facilities` (line 217, 269-284, 453-460) が array field の前例あり。曜日別料金プランの array UI に流用可能。

## 外部検証

Deep research で以下を primary source として verify 済 (22 claim confirmed, 3 refuted):

- **Spacemarket 特別営業**: 「時間・曜日・特定期間の 3 軸で料金変更可能。同じ日時で複数の設定がある場合は更新日の新しい設定が優先。基本情報より特別営業の設定が優先。」 (https://academy.spacemarket.com/tokubetueigyou/, 3 独立サブドメインで交差検証)
- **Peerspace Calendar Pricing**: day-of-week + time-of-day の 2 軸のみ first-class サポート、seasonal/specific-date/holiday の独立軸は非存在。listing type 別に別々の hourly rate。 (https://support.peerspace.com/en/articles/10119414, 3 URL で verify)
- **Airbnb precedence**: custom-per-date > Smart Pricing > weekend > weekly/monthly の明示的 hierarchy。confirmed reservation への retroactive 変更は禁止 (trip change request で guest 承認要)。 (https://www.airbnb.com/help/article/474)
- **Stripe tax rate immutability**: percentage/country/state プロパティは immutable、rate 変更時は「新オブジェクト作成 + 旧アーカイブ」pattern。 (https://docs.stripe.com/api/tax_rates)
- **Next.js 16 `use cache`**: cached function 内で cookies/headers/searchParams の直接呼び出し禁止、per-request context は argument 明示渡し必須。 (https://nextjs.org/docs/app/api-reference/directives/use-cache)
- **@holiday-jp/holiday_jp**: 日本のデファクト npm package (https://github.com/holiday-jp/holiday_jp-js, primary source verified)。振替休日を含む祝日データを JSON で内蔵、Node.js runtime 完全対応。

Peerspace の minimum booking hours を「rate rule field」とする claim と、Giggster の hourly-rental rate axis 非対応 claim は adversarial vote で refuted (該当 URL に該当記述なし)。HAIP の Booking.com 型 Derived rate 実装 claim も refuted。したがって当設計は「Derived rate (係数調整)」を採用せず、絶対値上書きに一本化する。

## ゴール

1. Space ごとに複数の rate plan (曜日別 / 時間帯別 / 特定期間 / 祝日) を定義でき、予約時刻に応じて自動的に適用単価を解決する。
2. 予約が複数 rate plan の適用境界を跨ぐ場合 (深夜跨ぎ・時間帯跨ぎ)、segment 分割で per-segment に正しく計算する。
3. 予約確定時に rate breakdown (segment 一覧・適用 plan・時間・小計) と税率を snapshot 保存し、後日 rate/税率が変更されても過去予約の内訳を復元可能にする。
4. 既存の Space 固有割引 / 長時間割引 / クーポンとの併用モードは維持する (`DiscountCombinationMode`)。
5. 管理画面の `SpaceEditForm.tsx` `pricing` タブ内に rate plan の CRUD UI を追加する。
6. 既存 3 件の bug を同時修正する:
   - 予約 create 時に税フィールドをすべて書き込む (NOT NULL 化)。
   - `hourlyPrice × hours` の二重計算を解消。
   - `Reservation.rateBreakdownJson` (NOT NULL) で単価 snapshot を保存。
7. 未使用の `Space.dailyPrice` カラムを削除する。

## 非ゴール (スコープ外)

- **動的価格 (Smart Pricing 相当)**: 需要データが蓄積されていない現状では effectiveness の検証不能。Airbnb Smart Pricing でも 2026 年時点で「host revenue 最適化より booking 最適化に寄る」批判あり。将来検討。
- **早割 / 直前割**: 既存の `Coupon` テーブルで代替可能 (期間限定クーポン発行)。当設計の rate plan とは軸が異なる。
- **長期滞在割引 (weekly/monthly)**: hourly-rental の用途では対象外。既存の「長時間割引」(`durationDiscountRules`) で時間ベースの割引はカバー済み。
- **キャンセル料 rate rule 連動**: 現状の予約キャンセルポリシー実装は独立軸として維持。
- **rate plan UI の per-day カレンダー編集**: Spacemarket UI と同じ「plan 一覧 → +新規 → modal で名前/料金/曜日/時間帯/期間入力」で十分。カレンダー UI は overkill、将来検討。
- **Rate plan の archive / soft-delete**: 単純な hard-delete で対応 (履歴は Reservation.rateBreakdownJson snapshot に残る)。

## アーキテクチャ設計

### 1. Data model (Prisma DSL)

新規 enum:

```prisma
enum DayOfWeek {
  MONDAY
  TUESDAY
  WEDNESDAY
  THURSDAY
  FRIDAY
  SATURDAY
  SUNDAY
}

enum HolidayMode {
  any      // 祝日/平日どちらでもマッチ (default)
  only     // 祝日のみマッチ
  exclude  // 祝日は除外 (平日のみ)
}
```

新規モデル:

```prisma
model SpaceRatePlan {
  id            String       @id @default(cuid())
  spaceId       String
  space         Space        @relation(fields: [spaceId], references: [id], onDelete: Cascade)

  name          String       @db.VarChar(100)  // 例: "週末料金", "GW料金", "深夜料金", "祝日料金"
  hourlyPrice   Decimal      @db.Decimal(10, 2)

  daysOfWeek    DayOfWeek[]                    // 空配列 = 全曜日 (曜日制約なし)
  holidayMode   HolidayMode  @default(any)
  startTime     String?      @db.VarChar(5)    // "HH:MM" (24h)、null = 00:00 (開始)
  endTime       String?      @db.VarChar(5)    // "HH:MM"、null = 24:00 (終了、半開区間)
  effectiveFrom DateTime?    @db.Date          // JST 日付、null = 期限なし
  effectiveTo   DateTime?    @db.Date          // JST 日付 (inclusive)、null = 期限なし

  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt        // last-updated-wins 優先度用

  @@index([spaceId, updatedAt(sort: Desc)])
  @@check(hourlyPrice >= 0)
  @@check(startTime IS NULL OR startTime ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
  @@check(endTime IS NULL OR endTime ~ '^([01][0-9]|2[0-3]|24):[0-5][0-9]$')
  @@check(effectiveFrom IS NULL OR effectiveTo IS NULL OR effectiveFrom <= effectiveTo)
}
```

Space の変更:

```prisma
model Space {
  // ... 既存
  hourlyPrice   Decimal          @db.Decimal(10, 2)   // base rate (rate plan が match しない時のフォールバック)
  // dailyPrice REMOVED (未使用カラム削除)
  ratePlans     SpaceRatePlan[]
}
```

Reservation の変更:

```prisma
model Reservation {
  // ... 既存
  basePrice          Decimal   @db.Decimal(10, 2)  // NOT NULL 化: Σ segment.subtotal (割引前)
  totalPrice         Decimal   @db.Decimal(10, 2)  // NOT NULL 化 (割引後、税抜)
  rateBreakdownJson  Json                          // NOT NULL: RateBreakdown 型 (下記)
  taxRateType        TaxRateType                   // NOT NULL 化 (snapshot)
  taxRate            Decimal   @db.Decimal(5, 2)   // NOT NULL 化 (snapshot、% 単位)
  taxAmount          Decimal   @db.Decimal(10, 2)  // NOT NULL 化
  totalPriceWithTax  Decimal   @db.Decimal(10, 2)  // NOT NULL 化
  // 既存の couponDiscountAmount / durationDiscountAmount / spaceDiscountAmount は nullable のまま維持
}
```

`RateBreakdown` の Zod 型 (`src/shared/lib/pricing/rate-breakdown.ts` 新規):

```ts
export const rateBreakdownSchema = z.object({
  schemaVersion: z.literal(1),
  segments: z.array(
    z.object({
      fromIso: z.string(), // JST ISO8601、半開区間の start
      toIso: z.string(), // JST ISO8601、半開区間の end (exclusive)
      hours: z.number(), // 小数対応 (分単位を h 換算)
      hourlyPrice: z.number().int(),
      subtotal: z.number().int(),
      ratePlanId: z.string().nullable(), // null = Space.hourlyPrice フォールバック
      ratePlanName: z.string(), // "基本料金" or plan.name の snapshot
      isHoliday: z.boolean(), // segment 開始日の JST 祝日判定結果
    }),
  ),
  totalHours: z.number(),
  totalBasePrice: z.number().int(),
  holidayFlags: z.record(z.string(), z.literal(true)), // { "2026-05-05": true } — 判定時の祝日 snapshot
});
export type RateBreakdown = z.infer<typeof rateBreakdownSchema>;
```

**legacy row 対応**: migration 内 backfill で既存 Reservation の `rateBreakdownJson` に `{ schemaVersion: 1, segments: [], totalHours: 0, totalBasePrice: 0, holidayFlags: {}, legacy: true }` を書き込む (schema 上は Json 型なので legacy フラグは Zod でオプショナル)。読み出し側 (`receipts/issue.ts` 等) は legacy フラグを検知したら現行動作 (totalPrice fallback) を維持する。

### 2. Rate 解決ロジック (pure function)

`src/shared/lib/pricing/rate-plan-resolver.ts` (新規、pure、no I/O):

```ts
export type ResolveRateInput = {
  ratePlans: SpaceRatePlanForResolver[]; // Prisma から取得済 (updatedAt DESC でソート済)
  spaceHourlyPrice: number;
  startDateTime: Date; // Prisma DateTime (Timestamptz)、JST wall clock として解釈する
  endDateTime: Date; // 同上、startDateTime より後
  holidayJudge: (jstDateOnly: string) => boolean; // "YYYY-MM-DD" (JST) → 祝日?
};

export function resolveRateBreakdown(input: ResolveRateInput): RateBreakdown;
```

アルゴリズム:

1. `[startDateTime, endDateTime)` を JST 日境界と時間帯境界で分割候補点を集める:
   - 日境界: `startDateTime` の翌 00:00, 翌々 00:00, ..., `endDateTime` の前 00:00
   - 時間帯境界: 各 rate plan の startTime/endTime を該当日の JST datetime に展開
2. 分割点でソートして重複除去 → segment 配列を生成 (各 segment は半開区間)。
3. 各 segment について:
   - segment 開始日の曜日 (JST) と祝日フラグを判定。
   - matching rate plan を絞り込む: `daysOfWeek` (空 or 含む) AND `holidayMode` (any/only/exclude) AND (`startTime` <= segment開始 < `endTime`) AND (`effectiveFrom` <= segment日 <= `effectiveTo`)。
   - matching plans を `updatedAt DESC` で並べ、最初のものを採用。マッチなしは `Space.hourlyPrice` フォールバック (`ratePlanId: null, ratePlanName: "基本料金"`)。
4. segment の hours = (toIso - fromIso) / 3600000 (分単位まで精度保持)。
5. subtotal = `Math.floor(hourlyPrice * hours)` (既存の丸め方針踏襲)。
6. totalBasePrice = Σ subtotal、totalHours = Σ hours。
7. holidayFlags は segment で判定した祝日日付を Set 化して object 化。

**注意**: rate plan の startTime/endTime が cross-midnight (例: 22:00-02:00) を張る場合は「22:00-24:00 と 00:00-02:00 の 2 分割」として扱う (data validation で `startTime <= endTime` を強制、cross-midnight は「2 plan 登録」とする)。

### 3. 祝日判定

`@holiday-jp/holiday_jp` を採用。`src/shared/lib/date/holiday.ts` (新規):

```ts
import "server-only";
import * as holidayJp from "@holiday-jp/holiday_jp";
import { parseJstDateOnly } from "@/shared/lib/date-format";

export function isJapaneseHoliday(jstDateOnly: string): boolean {
  const date = parseJstDateOnly(jstDateOnly); // JST → Date
  return holidayJp.isHoliday(date);
}
```

`@holiday-jp/holiday_jp` は振替休日を含むデータを JSON で内蔵。データ更新頻度は年 1 回程度 (祝日法改正時のみ)。edge runtime 不要 (Node.js runtime で完全動作)。

### 4. 予約計算経路の refactor

**現状**: `calculateHoursAndBasePrice(startDT, endDT, hourlyPrice)` → `basePrice` を返す。`calculatePricing` が内部でも再度乗算。

**新設計**:

- `calculateReservationPricing(input)` 単一関数に統合:
  ```ts
  {
    startDateTime, endDateTime,
    space: { hourlyPrice, discountType, discountValue, durationDiscountOverride, taxRateType },
    ratePlans: SpaceRatePlan[],  // Prisma から取得済
    reservationSettings: { taxStandardRate, taxReducedRate, durationDiscountEnabled, durationDiscountRules, ... },
    coupon?: Coupon | null,
  }
  → {
    rateBreakdown: RateBreakdown,
    basePrice: number,            // = rateBreakdown.totalBasePrice
    spaceDiscountAmount: number,
    durationDiscountAmount: number,
    couponDiscountAmount: number,
    totalPrice: number,           // 割引後、税抜
    taxRateType, taxRate, taxAmount, totalPriceWithTax,
  }
  ```
- 既存の `calculateHoursAndBasePrice` は廃止 (rate plan 解決に統合)。
- 既存の `calculatePricing` は `basePrice` を直接受け取る形にリファクタ (二重計算解消)。
- 3 経路の command (`public-commands.ts` / `admin-commands.ts` / `customer-commands.ts`) は新関数を呼ぶだけになる。

### 5. 予約 create 経路の税フィールド書込

`createPublicReservationCommand` / `createAdminReservationCommand` の `tx.reservation.create` に以下を必ず含める:

```ts
{
  basePrice: pricing.basePrice,
  totalPrice: pricing.totalPrice,
  rateBreakdownJson: pricing.rateBreakdown,
  taxRateType: pricing.taxRateType,
  taxRate: pricing.taxRate,
  taxAmount: pricing.taxAmount,
  totalPriceWithTax: pricing.totalPriceWithTax,
  // 割引 amount は既存通り
}
```

管理画面の `input.totalPrice` override は「税抜合計の override」として維持するが、rate breakdown の一貫性を保つため以下 policy:

- override 時は `rateBreakdownJson.segments` は計算値のまま (segment 別内訳は監査で追える)。
- `basePrice` は計算値そのまま (割引前の Σ subtotal を保持)。
- `totalPrice` のみ override 値で上書き。
- `taxRate`/`taxRateType` は解決値 (Space.taxRateType → Settings.taxStandardRate/taxReducedRate) をそのまま snapshot。
- `taxAmount = Math.round(overriddenTotalPrice * taxRate / 100)`。
- `totalPriceWithTax = overriddenTotalPrice + taxAmount`。
- override フラグ `priceOverriddenBy String?` を Reservation に追加 (audit 目的、adminUserId を保存)。

### 6. キャッシュ戦略

- Space の rate plan 取得: `getSpaceRatePlans(spaceId): Promise<SpaceRatePlan[]>` を `'use cache'` + `cacheTag(CACHE_TAGS.SPACE_RATE_PLANS(spaceId))` で cache。
- rate plan の CRUD (createRatePlanAction / updateRatePlanAction / deleteRatePlanAction) 完了時に `revalidateTag(CACHE_TAGS.SPACE_RATE_PLANS(spaceId))`。
- `resolveRateBreakdown` は pure function なので cache 対象外 (input が per-request で変動)。
- CDN 側 cache tag mapping (`NEXTJS_TAG_TO_CDN_TAG`) に `SPACE_RATE_PLANS` 追加。
- Next.js 16 `use cache` 制約 (`cookies`/`headers` 呼び出し禁止) 準拠のため、`getSpaceRatePlans` は spaceId のみを argument で受け取る。

### 7. 管理画面 UI

`SpaceEditForm.tsx` の `pricing` タブ内に「特別料金プラン」セクションを追加:

```
[Card: 基本料金] (既存)
[Card: 割引] (既存)
[Card: 税率] (既存)
[Card: 特別料金プラン] (新規)
  ├─ プラン一覧テーブル (name / 曜日 / 時間帯 / 期間 / 料金)
  │   ├─ ✏️ 編集 → modal
  │   └─ 🗑️ 削除 → 確認 dialog
  └─ [+ 新規プラン追加] ボタン → modal
```

Modal (`SpaceRatePlanEditModal.tsx` 新規):

- name (text)
- hourlyPrice (number)
- daysOfWeek (checkbox × 7 + 「全曜日」ショートカット)
- holidayMode (radio: any/only/exclude)
- startTime/endTime (time picker、null 許容)
- effectiveFrom/effectiveTo (date picker、null 許容)
- プレビュー: 「例: 2026-01-01 (金) 14:00-16:00 に適用: ✅ 料金 3000円/h」

conform + Zod ベース。array field は既存の `facilities` パターンを踏襲 (`SpaceEditForm.tsx:453-460`)。

**別 approach 検討**: rate plan CRUD を独立 subpage (`/admin/spaces/[id]/rate-plans`) にする案もあったが、Spacemarket の UI 導線 (「プラン・価格設定 → プランを編集 → 特別営業タブ」) と同じ「同じ画面内でネスト」パターンが業界標準と判断。既存 tab 構造を踏襲。

### 8. Server Action

`src/app/(admin)/admin/(dashboard)/_shared/actions/space-rate-plan.ts` (新規):

- `createSpaceRatePlanAction(spaceId, formData)`
- `updateSpaceRatePlanAction(planId, formData)`
- `deleteSpaceRatePlanAction(planId)`

いずれも `executeConformMutation` + Zod schema (`spaceRatePlanFormSchema`) + `getAuditActor` + admin RBAC guard を通す。完了時に `revalidateTag(CACHE_TAGS.SPACE_RATE_PLANS(spaceId))`。

Domain command 層 (`src/shared/domain/spaces/rate-plan-commands.ts` 新規) が Prisma 直呼び出しを引き受ける (admin action → domain command のレイヤ規約遵守)。

### 9. 予約フォームの client-side プレビュー

既存の予約フォーム (`reservation-form.tsx`, admin `ReservationForm.tsx`, `ReservationEditForm.tsx`) は「時間帯を変更した時点で Server Action で料金プレビューを取得」する既存パターンあり。この既存 endpoint を rate plan 対応の新経路に置き換える (client-side で rate 解決の重複実装はしない)。

## テスト方針

### unit (`__tests__/unit/`)

- `rate-plan-resolver.test.ts`:
  - 基本ケース: 曜日のみ / 時間帯のみ / 特定期間のみ / 祝日のみ の 4 軸単独マッチ。
  - 組み合わせ: 「金曜 19-23 時のみ」等の複合条件。
  - 優先度: 2 plan が同時マッチ → `updatedAt` 新しい方採用。
  - segment 分割: 深夜跨ぎ (金 22:00 - 土 02:00) → 金/土 で 2 segment。時間帯境界 (18:00 - 22:00 の週末料金) を跨ぐ予約 → 3 segment。
  - フォールバック: マッチなし → `Space.hourlyPrice`。
  - 祝日: `holidayMode` の 3 値それぞれで正しく判定される。
  - 境界値: startTime = 24:00 相当 (null で endTime 表現)、effectiveTo = 予約開始日と同一日。

- `holiday.test.ts`: `isJapaneseHoliday` が振替休日 (例: 2026-05-05 火 → 2026-05-06 水が振替) を正しく判定する。

- `rate-breakdown-schema.test.ts`: Zod schema の valid/invalid ケース、schemaVersion 1 固定、legacy フラグ許容。

### integration (`__tests__/integration/`)

- 予約作成 (`createPublicReservationCommand` / `createAdminReservationCommand` / `createCustomerReservationCommand`) の 3 経路で:
  - rate plan なしの Space で従来通り動作する (regression)。
  - 曜日別 rate plan あり → 該当曜日で高い料金が適用される。
  - 深夜跨ぎ予約で 2 segment に分かれて計算される。
  - 予約 record に `rateBreakdownJson` / `taxRate` / `taxAmount` / `totalPriceWithTax` が正しく書き込まれる (create 経路で null にならない)。
  - 予約作成後に rate plan を変更しても既存予約の `rateBreakdownJson` が影響を受けない (snapshot 独立性)。
- 管理画面の CRUD action:
  - createSpaceRatePlanAction が Space に rate plan を追加する。
  - updateSpaceRatePlanAction で `updatedAt` が bump される (優先度に影響)。
  - deleteSpaceRatePlanAction が rate plan を削除する。

### e2e (`e2e/`)

- 公開予約フォームで曜日別 rate plan が適用される料金プレビューを確認する smoke spec。
- 管理画面で rate plan の作成・編集・削除フローを walk-through する spec。

### drift gate (`__tests__/unit/architecture-boundaries.test.ts`)

- `SpaceRatePlan` テーブルには対応する CACHE_TAGS producer が存在する (`SPACE_RATE_PLANS`)。
- `NEXTJS_TAG_TO_CDN_TAG` に `SPACE_RATE_PLANS` が mapping 済。

## 実装上の注意

### Migration

**Breaking migration** (計画ダウンタイム自動発動):

1. `SpaceRatePlan` テーブル + `DayOfWeek` / `HolidayMode` enum 追加。
2. `Space.dailyPrice` DROP。
3. `Reservation.rateBreakdownJson` 追加 (最初は nullable)。
4. 既存 Reservation 全 row に backfill:
   - `rateBreakdownJson = jsonb_build_object('schemaVersion', 1, 'segments', '[]'::jsonb, 'totalHours', 0, 'totalBasePrice', 0, 'holidayFlags', '{}'::jsonb, 'legacy', true)`
   - `taxRate = COALESCE(taxRate, (SELECT taxStandardRate FROM "Settings" LIMIT 1))`
   - `taxRateType = COALESCE(taxRateType, 'standard')`
   - `taxAmount = COALESCE(taxAmount, ROUND(COALESCE(totalPrice, 0) * COALESCE(taxRate, 10) / 100)::int)`
   - `totalPriceWithTax = COALESCE(totalPriceWithTax, COALESCE(totalPrice, 0) + COALESCE(taxAmount, 0))`
   - `basePrice = COALESCE(basePrice, COALESCE(totalPrice, 0))`
5. Reservation の該当カラムに NOT NULL 制約追加。

Squawk lint は「NOT NULL 化 with backfill」を DANGEROUS_ADD_NOT_NULL warning としてフラグする可能性あり。この設計は破壊的変更前提なので、breaking-migrations ドキュメントに migration 名を追記する。

### 既存 code の削除

- `src/shared/domain/reservations/payloads.ts` の `calculateHoursAndBasePrice` を削除、参照箇所を新関数に置換。
- `src/shared/lib/pricing/reservation.ts` の `calculatePricing` を `basePrice` 直接受け取り版にリファクタ (`hourlyPrice × hours` 削除)。
- `src/app/(admin)/.../SpaceEditForm.tsx` の `dailyPrice` フィールド削除。
- `spaceFormSchema` (`_shared/lib/validations/space.ts:187-200`) の `dailyPrice` field 削除。
- `receipts/issue.ts` の `totalPriceWithTax ?? totalPrice` fallback は legacy row 対応のため維持 (rateBreakdownJson.legacy === true 時のみ)。

### JST 固定

- `startTime`/`endTime` はローカル (JST) の HH:MM 表現。UTC 変換しない (時計壁時計時刻)。
- `effectiveFrom`/`effectiveTo` は JST 日付 (`@db.Date`)。
- rate 解決時の segment 分割は `parseJstDateOnly` (`src/shared/lib/date-format.ts`) を使って JST 日境界で判定。
- Cross-midnight 予約の segment 分割で TZ / DST 落とし穴なし (JST 固定)。

### advisory lock 順序

既存の `lockSpaceForTransaction` を予約 create の advisory lock として使う order は変更しない。rate plan 読み出しは lock 前に済ませる (rate plan の CRUD は別トランザクション、予約作成時は snapshot 済み)。

### 併用ロジック

- rate plan で解決された `basePrice` に対して、既存の `discountType`/`discountValue` (Space 固有割引)、`durationDiscountRules` (長時間割引)、`Coupon` の割引ロジックがそのまま適用される。
- `DiscountCombinationMode` (`best`/`both`) は割引側にのみ適用され、rate plan の rate 選択には関与しない。
- rate plan で `basePrice` が上がった場合、割引は「上がった後の basePrice に対する％」として計算される (割引率のインパクトも増える)。これは業界標準の挙動 (Spacemarket / Peerspace も同様)。

## 破壊的変更の一覧 (最終確認用)

| 変更                                                                                                             | 影響                                                                                            |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `DROP COLUMN Space.dailyPrice`                                                                                   | 未使用カラムの削除。UI form / Zod schema / Prisma extension から参照除去必要                    |
| `Reservation.basePrice/totalPrice/rateBreakdownJson/taxRateType/taxRate/taxAmount/totalPriceWithTax` NOT NULL 化 | 既存 row への backfill migration が必要。breaking migration 検知 → 計画ダウンタイム自動デプロイ |
| `calculateHoursAndBasePrice` 削除                                                                                | 3 呼出元をすべて新関数に置換                                                                    |
| `calculatePricing` の signature 変更 (hourlyPrice/hours 引数削除、basePrice 追加)                                | 3 呼出元 + 3 form ですべて再配線                                                                |
| `Space.dailyPrice` の Zod schema / form field 削除                                                               | 管理画面のフォーム UI 変更                                                                      |
| 新規 npm dep: `@holiday-jp/holiday_jp`                                                                           | `bun.lock` 更新                                                                                 |

いずれも「後方互換なし」で「migration しっかり」の方針に合致する。停止例外の該当項目 (breaking schema / `bun.lock` 変更) はユーザーが事前承認済 (「破壊的変更 OK」明言)。
