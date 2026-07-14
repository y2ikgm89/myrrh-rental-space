/**
 * Rate plan resolver（純粋関数）
 *
 * 予約の時間帯 (startDateTime〜endDateTime) を、適用される SpaceRatePlan の
 * 切り替わり地点（JST 日境界・rate plan の時間帯境界）で分割し、各 segment に
 * 曜日・祝日モード・時間帯・有効期間の条件でマッチする rate plan を割り当てる。
 * 複数 plan が同時にマッチする場合は `updatedAt` が新しい方を優先する
 * (last-updated-wins、Spacemarket 等の一般的な慣例)。
 *
 * I/O・Prisma 依存なしの純粋関数。祝日判定は `holidayJudge` として外部から注入
 * される（`isJapaneseHoliday` を直接 import しないのは、この関数単体を
 * スタブなしでテスト可能にするため）。
 */
import { formatJstDateOnly } from "@/shared/lib/date-format";
import type {
  RateBreakdown,
  RateBreakdownSegment,
} from "@/shared/lib/pricing/rate-breakdown";
import {
  DayOfWeek,
  HolidayMode,
} from "@/shared/lib/validations/enums/prisma-types";

export type SpaceRatePlanForResolver = {
  id: string;
  name: string;
  hourlyPrice: number;
  daysOfWeek: DayOfWeek[]; // 空配列 = 全曜日
  holidayMode: HolidayMode;
  startTime: string | null; // "HH:MM"、null = 00:00（開始）
  endTime: string | null; // "HH:MM"、null = 24:00（終了、半開区間）
  effectiveFrom: Date | null; // JST 日付（@db.Date）、null = 期限なし
  effectiveTo: Date | null; // JST 日付（@db.Date、inclusive）、null = 期限なし
  updatedAt: Date;
};

export type ResolveRateInput = {
  ratePlans: SpaceRatePlanForResolver[];
  spaceHourlyPrice: number;
  startDateTime: Date;
  endDateTime: Date;
  holidayJudge: (jstDateOnly: string) => boolean;
};

const FALLBACK_RATE_PLAN_NAME = "基本料金";

// ============================================================================
// JST 変換 helper
//
// `date-format.ts` の主流パターンは Intl.DateTimeFormat + timeZone: "Asia/Tokyo"
// だが、この resolver は segment 分割のため「JST 上のカットポイント」を
// 整数の分単位で求め、日境界の加減算・曜日・時刻内分への分解を繰り返す必要がある。
// Intl の formatToParts を都度呼ぶより、Asia/Tokyo が UTC+9 固定（夏時間なし、
// 廃止後の再導入もない）である前提で以下の shift-trick を使うほうが単純で速い:
//
//   1. 実時刻の Date に +9h した Date を作ると、その `getUTC*()` 系メソッドは
//      「UTC の時刻」ではなく「JST の壁時計成分」を返すようになる
//      （以後この Date を "shifted date" と呼ぶ）
//   2. shifted date の epoch ms を 60,000 (1分) で割った整数を "JST 分" と呼ぶ。
//      JST 暦日の 00:00 が必ず 1440 の倍数になるため、日境界判定・曜日・
//      日内時刻がすべて素の整数演算 (+, -, %, Math.floor) で求まる
//   3. 逆変換（JST 分 → 表示用の年月日時分）は `new Date(jstMinutes * 60_000)`
//      が shifted date そのものなので、その `getUTC*()` を読むだけでよい。
//      **ここで実時刻に戻すために ±9h をもう一度適用してはならない** —
//      shifted date は往復の全区間で保持され続ける値であり、再度オフセットを
//      適用すると「JST の壁時計時刻ではなく本当の UTC 時刻に +09:00 ラベルを
//      付けて返す」9 時間ズレのバグになる（実装前レビューで確認済みの罠）。
//      `fromJstMinutes` を唯一の逆変換の入口にし、以後は getUTC* のみで読む。
// ============================================================================

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;
const MINUTES_PER_DAY = 24 * 60;

/** 曜日 index (JS の Date#getUTCDay() 準拠、0=日) → DayOfWeek enum */
const DAY_INDEX_TO_ENUM: readonly DayOfWeek[] = [
  DayOfWeek.SUNDAY,
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
];

/** JST の "HH:MM" を日内分に変換。null は 00:00 (開始) or 24:00 (終了、半開区間) */
function timeStrToMinutes(t: string | null, endMode: boolean): number {
  if (t === null) return endMode ? MINUTES_PER_DAY : 0;
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** 実 Date → shifted date（getUTC* が JST 壁時計成分を返す Date） */
function toShiftedDate(d: Date): Date {
  return new Date(d.getTime() + JST_OFFSET_MS);
}

/** 実 Date → JST 分（shifted date の epoch ms を 60,000 で割った整数） */
function toJstMinutes(d: Date): number {
  return Math.floor(toShiftedDate(d).getTime() / MS_PER_MINUTE);
}

/** JST 分 → shifted date（逆変換の唯一の入口。以後は getUTC* のみで読む） */
function fromJstMinutes(m: number): Date {
  return new Date(m * MS_PER_MINUTE);
}

/** JST 分 → "YYYY-MM-DD" */
function jstMinutesToDateOnly(m: number): string {
  const d = fromJstMinutes(m);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

/**
 * JST 分 → 曜日 enum。
 * `getUTCDay()` は必ず 0..6 を返すため `DAY_INDEX_TO_ENUM` の参照は常に成功する
 * （`noUncheckedIndexedAccess` 対応の防御的 throw は理論上到達しない）。
 */
function jstMinutesToDayEnum(m: number): DayOfWeek {
  const index = fromJstMinutes(m).getUTCDay();
  const value = DAY_INDEX_TO_ENUM[index];
  if (value === undefined) {
    throw new Error(`unreachable: getUTCDay() returned invalid index ${index}`);
  }
  return value;
}

/** JST 分 → その日の 00:00 からの経過分 (0..1439) */
function jstMinutesToTimeOfDayMinutes(m: number): number {
  return ((m % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/** JST 分 → ISO8601 文字列（"+09:00" 固定オフセット、分単位までの精度） */
function jstMinutesToIso(m: number): string {
  const d = fromJstMinutes(m);
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = d.getUTCFullYear();
  const mo = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const mm = pad(d.getUTCMinutes());
  return `${y}-${mo}-${day}T${hh}:${mm}:00+09:00`;
}

/** segment の開始時点が rate plan の条件(曜日/祝日/時間帯/有効期間) にマッチするか */
function planMatchesSegment(
  plan: SpaceRatePlanForResolver,
  ctx: {
    dayEnum: DayOfWeek;
    timeOfDayMinutes: number;
    dateOnly: string;
    isHoliday: boolean;
  },
): boolean {
  // 曜日（空配列 = 全曜日）
  if (plan.daysOfWeek.length > 0 && !plan.daysOfWeek.includes(ctx.dayEnum)) {
    return false;
  }
  // 祝日モード
  if (plan.holidayMode === HolidayMode.only && !ctx.isHoliday) return false;
  if (plan.holidayMode === HolidayMode.exclude && ctx.isHoliday) return false;
  // 時間帯（半開区間 [start, end)）
  const planStartTod = timeStrToMinutes(plan.startTime, false);
  const planEndTod = timeStrToMinutes(plan.endTime, true);
  if (
    ctx.timeOfDayMinutes < planStartTod ||
    ctx.timeOfDayMinutes >= planEndTod
  ) {
    return false;
  }
  // 有効期間（JST カレンダー日付の閉区間: effectiveFrom <= 日 <= effectiveTo）
  if (plan.effectiveFrom) {
    const fromDateOnly = formatJstDateOnly(plan.effectiveFrom);
    if (ctx.dateOnly < fromDateOnly) return false;
  }
  if (plan.effectiveTo) {
    const toDateOnly = formatJstDateOnly(plan.effectiveTo);
    if (ctx.dateOnly > toDateOnly) return false;
  }
  return true;
}

export function resolveRateBreakdown(input: ResolveRateInput): RateBreakdown {
  const startMin = toJstMinutes(input.startDateTime);
  const endMin = toJstMinutes(input.endDateTime);

  // 1. 分割候補点を集める（JST 日境界 + 各 rate plan の時間帯境界）
  const cutPoints = new Set<number>([startMin, endMin]);

  const startDay = Math.floor(startMin / MINUTES_PER_DAY);
  const endDay = Math.floor((endMin - 1) / MINUTES_PER_DAY);

  for (let day = startDay + 1; day <= endDay; day++) {
    cutPoints.add(day * MINUTES_PER_DAY);
  }

  for (let day = startDay; day <= endDay; day++) {
    const dayStart = day * MINUTES_PER_DAY;
    for (const plan of input.ratePlans) {
      const boundaryStart = dayStart + timeStrToMinutes(plan.startTime, false);
      const boundaryEnd = dayStart + timeStrToMinutes(plan.endTime, true);
      if (boundaryStart > startMin && boundaryStart < endMin) {
        cutPoints.add(boundaryStart);
      }
      if (boundaryEnd > startMin && boundaryEnd < endMin) {
        cutPoints.add(boundaryEnd);
      }
    }
  }

  // 2. ソートして segment を生成
  const sortedCuts = [...cutPoints].sort((a, b) => a - b);
  const segments: RateBreakdownSegment[] = [];
  const holidayFlags: Record<string, true> = {};

  // rate plan を updatedAt DESC でソート（last-updated-wins: 先頭一致を採用）
  const plansSorted = [...input.ratePlans].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
  );

  for (let i = 0; i < sortedCuts.length - 1; i++) {
    const segStart = sortedCuts[i];
    const segEnd = sortedCuts[i + 1];
    if (segStart === undefined || segEnd === undefined || segEnd <= segStart) {
      continue;
    }

    const dateOnly = jstMinutesToDateOnly(segStart);
    const dayEnum = jstMinutesToDayEnum(segStart);
    const timeOfDayMinutes = jstMinutesToTimeOfDayMinutes(segStart);
    const isHoliday = input.holidayJudge(dateOnly);
    if (isHoliday) holidayFlags[dateOnly] = true;

    const matched = plansSorted.find((plan) =>
      planMatchesSegment(plan, {
        dayEnum,
        timeOfDayMinutes,
        dateOnly,
        isHoliday,
      }),
    );

    const hourlyPrice = matched?.hourlyPrice ?? input.spaceHourlyPrice;
    const ratePlanId = matched?.id ?? null;
    const ratePlanName = matched?.name ?? FALLBACK_RATE_PLAN_NAME;
    const hours = (segEnd - segStart) / 60;
    const subtotal = Math.floor(hourlyPrice * hours);

    segments.push({
      fromIso: jstMinutesToIso(segStart),
      toIso: jstMinutesToIso(segEnd),
      hours,
      hourlyPrice,
      subtotal,
      ratePlanId,
      ratePlanName,
      isHoliday,
    });
  }

  const totalHours = segments.reduce((sum, s) => sum + s.hours, 0);
  const totalBasePrice = segments.reduce((sum, s) => sum + s.subtotal, 0);

  return {
    schemaVersion: 1,
    segments,
    totalHours,
    totalBasePrice,
    holidayFlags,
  };
}
