/**
 * JSONフィールドバリデーション
 *
 * Prisma.JsonValueを型安全に変換するヘルパー関数
 */

import { z } from "zod";
import { createTypeGuard } from "@/shared/lib/serialize";

// 読み取り側では重複を silent に除去する（React key の stable ID 保証のため）。
// 書き込み側の Zod スキーマは `.refine()` で厳格に重複を拒否しているため、
// 重複が残る場合は historical data のみ。`transform` で自己修復する。
const stringArraySchema = z
  .array(z.string())
  .transform((arr) => Array.from(new Set(arr)));

/**
 * 営業時間帯スキーマ（開始・終了時刻のペア）
 *
 * NOTE: 予約時間枠用のTimeSlot（{time, available}）とは異なる
 * @see src/shared/lib/reservation/types.ts - 予約時間枠用
 */
const businessTimeSlotSchema = z.object({
  openTime: z.string(),
  closeTime: z.string(),
});

/**
 * 営業時間の1日分の型（新形式: slots配列）
 */
const businessHoursDaySchema = z.object({
  isOpen: z.boolean(),
  slots: z.array(businessTimeSlotSchema),
});

/** 曜日キー（businessHours の曜日と一致） */
export const WEEKDAY_VALUES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

/** 月内の第N週（last = 最終週） */
export const MONTHLY_CLOSURE_WEEK_VALUES = [
  "first",
  "second",
  "third",
  "fourth",
  "last",
] as const;

/**
 * 毎月の繰り返し定休（例: 第3月曜）。
 * 曜日定休（週次）を補完する月次の繰り返し休業。BlockedDate（単発期間）とは別。
 */
const monthlyClosureSchema = z.object({
  weekday: z.enum(WEEKDAY_VALUES),
  week: z.enum(MONTHLY_CLOSURE_WEEK_VALUES),
});

/**
 * 営業時間（週間）スキーマ。
 * `monthlyClosures` は毎月の繰り返し定休。
 */
const businessHoursSchema = z.object({
  monday: businessHoursDaySchema,
  tuesday: businessHoursDaySchema,
  wednesday: businessHoursDaySchema,
  thursday: businessHoursDaySchema,
  friday: businessHoursDaySchema,
  saturday: businessHoursDaySchema,
  sunday: businessHoursDaySchema,
  monthlyClosures: z.array(monthlyClosureSchema).optional(),
});

/** 営業時間帯（開始・終了時刻のペア）*/
export type BusinessTimeSlot = z.infer<typeof businessTimeSlotSchema>;
export type BusinessHoursDay = z.infer<typeof businessHoursDaySchema>;
export type BusinessHours = z.infer<typeof businessHoursSchema>;
export type MonthlyClosure = z.infer<typeof monthlyClosureSchema>;
export type MonthlyClosureWeek = (typeof MONTHLY_CLOSURE_WEEK_VALUES)[number];
/** MonthlyClosureWeek の型ガード（Select onChange 等の string → enum narrow SSoT）。 */
export const isMonthlyClosureWeek = createTypeGuard(
  MONTHLY_CLOSURE_WEEK_VALUES,
);
/** businessHours の曜日キー（monthlyClosures を除外した weekday 限定キー） */
export type WeekdayKey = (typeof WEEKDAY_VALUES)[number];
/** WeekdayKey の型ガード（URL/Form/Select 由来の string → weekday narrow SSoT）。 */
export const isWeekdayKey = createTypeGuard(WEEKDAY_VALUES);

/**
 * unknown値をstring[]に安全に変換
 *
 * Prisma.JsonValueやunknown型のデータを安全に変換
 * バリデーション失敗時は空配列を返す
 *
 * @example
 * const tags = parseStringArray(post.tags)
 */
export function parseStringArray(value: unknown): string[] {
  const result = stringArraySchema.safeParse(value);
  return result.success ? result.data : [];
}

// ============================================================================
// Space.facilities ({ name, iconName }[])
// ============================================================================

const facilityItemSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "設備名を入力してください" })
    .max(50, { error: "設備名は50文字以内で入力してください" }),
  // 空文字許容（icon 未指定 — UI で fallback として text のみ表示）
  iconName: z.string().trim().max(64),
});

/**
 * 設備配列の canonical SSoT スキーマ。
 *
 * - 各設備は `{ name: string; iconName: string }` の object（Airbnb / Booking.com 標準）
 * - `name` は React key の stable ID として機能するため重複禁止
 * - `iconName` は `@/shared/lib/icon-curation` の curation 識別子（空文字 = icon 未指定）
 *
 * write-side（フォーム / Server Action）からは `.default([])` を chain して使う。
 * read-side（DB JSON パース）は `parseFacilities()` ヘルパー経由で使う。
 */
export const facilitiesSchema = z
  .array(facilityItemSchema)
  .refine((arr) => new Set(arr.map((f) => f.name)).size === arr.length, {
    error: "同じ名前の設備を複数登録することはできません",
  });

export type FacilityItem = z.infer<typeof facilityItemSchema>;

/** `tryParseFacilities` の結果（失敗側はデータを持たない） */
export type TryParseFacilitiesResult =
  { success: true; data: FacilityItem[] } | { success: false };

/**
 * `Space.facilities` の strict parse — 読み取り失敗を呼び出し側に伝える。
 *
 * `parseFacilities` は「読めた分だけ返す」ので、戻り値が `[]` でも
 * **「元から設備なし」と「保存値が丸ごと読めなかった」を区別できない**。
 * 管理画面の編集フォームは設備 1 件につき hidden input を 1 つしか出さないため、
 * 後者を空配列として扱うと、価格や説明文だけを直して保存した操作で
 * `Space.facilities` が空配列に上書きされる（sidebar 設定の
 * `tryParseSidebarWidgets` と同じ役割をここで担う）。
 *
 * `success: false` は「本当に何も読めなかった」ときだけ:
 * - 配列でない値が保存されている（object / string / number）
 * - 空でない配列なのに 1 件も検証を通らなかった
 *
 * null / undefined（未設定）と空配列は「設備なし」であって読み取り失敗ではない。
 * 一部だけ壊れた配列は #1822 の方針どおり読めた分を返す（`success: true`）—
 * 生き残った設備を編集できる状態のほうが被害が小さいため。
 */
export function tryParseFacilities(value: unknown): TryParseFacilitiesResult {
  if (value === null || value === undefined) return { success: true, data: [] };
  if (!Array.isArray(value)) return { success: false };

  const data: FacilityItem[] = [];
  // `name` は React key の stable ID なので、canonical schema と同じく重複を許さない
  const seenNames = new Set<string>();
  for (const item of value) {
    const parsed = facilityItemSchema.safeParse(item);
    if (!parsed.success) continue;
    if (seenNames.has(parsed.data.name)) continue;
    seenNames.add(parsed.data.name);
    data.push(parsed.data);
  }

  if (value.length > 0 && data.length === 0) return { success: false };
  return { success: true, data };
}

/**
 * unknown 値を `FacilityItem[]` に安全に変換
 *
 * `Space.facilities` は構造化された設備リスト（Airbnb / Booking.com 標準）。
 * `{ name: string; iconName: string }[]` 形式で保存。
 * 旧 `string[]` 形式は init migration に畳み込み済み（当時の変換 migration は
 * squash されて残っていないので、番号での参照はしない）。
 *
 * **配列全体ではなく 1 件ずつ検証する**（`parseGallery` と同じ形）。まとめて
 * `facilitiesSchema` に通すと、1 件の不正で**そのスペースの設備が全部消える**。
 * `name` に `.trim()` を課した際（#1819）にこれが実害になった: 旧スキーマは
 * `z.string().min(1)` で空白のみの設備名を通していたので、そういう行が既に
 * 保存されていれば読み取りが丸ごと失敗する。`"Wi-Fi"` と `" Wi-Fi "` の併存も
 * 同じで、trim 後に重複して uniqueness の refine が落ちる。
 *
 * 1 件ずつなら、空白だけの設備（元々画面に何も出ていない）だけが落ちて
 * 残りは生き残る。重複は先に現れた方を採る。
 *
 * **書き戻す画面では使わない** — 読めたかどうかを潰してしまうため、
 * 編集フォームなど「読んだ値をそのまま保存し直す」経路は
 * `tryParseFacilities` を使って読み取り失敗を検出する。
 *
 * @example
 * const facilities = parseFacilities(space.facilities)
 * // facilities[0].name / facilities[0].iconName でアクセス
 */
export function parseFacilities(value: unknown): FacilityItem[] {
  const result = tryParseFacilities(value);
  return result.success ? result.data : [];
}

/**
 * unknown値をstring[] | nullに安全に変換
 *
 * nullable な配列フィールド用
 *
 * @example
 * const tags = parseStringArrayOrNull(media.tags)
 */
export function parseStringArrayOrNull(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  const result = stringArraySchema.safeParse(value);
  return result.success ? result.data : null;
}

/**
 * JSON 値を BusinessHours に安全に変換（不正値は null）
 *
 * @example
 * const hours = parseBusinessHours(settings.businessHours)
 */
export function parseBusinessHours(value: unknown): BusinessHours | null {
  const result = businessHoursSchema.safeParse(value);
  return result.success ? result.data : null;
}

// =============================================================================
// Business Attributes (MEO)
// =============================================================================

const businessAttributesSchema = z.record(z.string(), z.boolean());

/**
 * JSON値をRecord<string, boolean>にパース（施設属性用）
 */
export function parseBusinessAttributes(
  value: unknown,
): Record<string, boolean> | null {
  if (value === null || value === undefined) return null;
  const result = businessAttributesSchema.safeParse(value);
  if (!result.success) return null;
  return Object.keys(result.data).length > 0 ? result.data : null;
}

const featureModulesSchema = z.record(z.string(), z.boolean());

/**
 * JSON値をRecord<string, boolean>にパース（Feature Module ON/OFF map 用）。
 *
 * - 空オブジェクト / 不正値 / null / undefined → `{}`
 * - boolean 以外の値を持つ key は silently 除外
 *
 * SSoT: `Settings.featureModules` JSON column。registry: `@/shared/lib/features/registry`。
 * 解決ロジック: `@/shared/domain/features/check.ts` の `getEnabledFeatures`。
 */
export function parseFeatureModules(value: unknown): Record<string, boolean> {
  if (value === null || value === undefined) return {};
  const result = featureModulesSchema.safeParse(value);
  return result.success ? result.data : {};
}

// =============================================================================
// Data Retention Config（Settings.dataRetention JSON）
// =============================================================================

/**
 * データ保持ポリシー — 保持期間経過後の PII 削除・匿名化に使う月数。
 *
 * - 各 key は非負整数（int）。`0` はその field を opt-out（対象テーブルを触らない）。
 * - デフォルトは規約テンプレの保持期間に合わせる。管理 UI 経由で運用者が上書き可能。
 * - 実 purge は feature module `data-retention` が ON かつ月数 > 0 の field についてのみ
 *   `/api/cron/data-retention` から実行される（cron 側で feature-flag 済み）。
 *
 * fail-safe: パース失敗（欠損 key / 型不一致 / 負数）は `DEFAULT_DATA_RETENTION_CONFIG`
 * にフォールバックする（サイレント無効化ではなく安全なデフォルト値を使う）。
 */
const dataRetentionConfigSchema = z.object({
  sessionMonths: z.number().int().min(0),
  verificationMonths: z.number().int().min(0),
  reservationGuestMonths: z.number().int().min(0),
  inquiryMonths: z.number().int().min(0),
  customerInactiveMonths: z.number().int().min(0),
});

export type DataRetentionConfig = z.infer<typeof dataRetentionConfigSchema>;

/**
 * 保持月数のデフォルト。schema.prisma の `dataRetention` 列の DEFAULT と数値を
 * 揃えている（fresh install は SQL DEFAULT を使う、既存 install の欠損値
 * フォールバックはこの const を使う）。値を変える際は両方セットで更新する。
 *
 * - Session/Verification: 6 mo — 認証セッション相当の短期
 * - Reservation.guest*: 12 mo — 予約完了後 1 年
 * - Inquiry: 36 mo — 問い合わせ 3 年
 * - Customer (INACTIVE のみ): 84 mo — 電磁的記録の一般 7 年基準
 */
export const DEFAULT_DATA_RETENTION_CONFIG: DataRetentionConfig = {
  sessionMonths: 6,
  verificationMonths: 6,
  reservationGuestMonths: 12,
  inquiryMonths: 36,
  customerInactiveMonths: 84,
} as const;

export function parseDataRetentionConfig(value: unknown): DataRetentionConfig {
  const result = dataRetentionConfigSchema.safeParse(value);
  return result.success ? result.data : DEFAULT_DATA_RETENTION_CONFIG;
}
