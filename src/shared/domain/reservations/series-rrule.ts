import "server-only";
import { RRule, type Frequency } from "rrule";
import { RESERVATION_SERIES_FREQ } from "@/shared/lib/validations/enums/prisma-types";
import { MS_PER_DAY, MS_PER_HOUR } from "@/shared/lib/date-format";

/**
 * freq WHITELIST: DAILY / WEEKLY / MONTHLY のみ Phase B.2 で許可。
 * YEARLY はレア、SECONDLY/MINUTELY/HOURLY は誤操作リスク高で拒否。
 */
const ALLOWED_FREQS = new Set<Frequency>([
  RRule.DAILY,
  RRule.WEEKLY,
  RRule.MONTHLY,
]);

/**
 * rrule.js の floating frame へ移す幅。
 *
 * ## なぜ必要か
 *
 * rrule.js は DTSTART の **UTC 成分をそのまま壁時計として**評価する
 * （floating time。`node_modules/rrule/README.md` の Timezones 節）。一方この
 * システムの予約時刻は真の instant（UTC）で保存されている。素の instant を
 * 渡すと `BYDAY` / `BYMONTHDAY` の判定が **UTC の日付**で行われる。
 *
 * JST の時刻が 09:00 未満だと UTC 日付が 1 日前になり、**全 instance が 1 日
 * 後ろへずれて起点の日が消える**。`FREQ=WEEKLY;BYDAY=WE;COUNT=3` の実測:
 *
 * | dtstart | 修正前 | 正しい展開 |
 * | --- | --- | --- |
 * | 07-22 08:00 JST（水） | 07-23(木) / 07-30(木) / 08-06(木) | 07-22(水) / 07-29(水) / 08-05(水) |
 * | 07-22 08:59 JST（水） | 07-23(木) / 07-30(木) / 08-06(木) | 07-22(水) / 07-29(水) / 08-05(水) |
 * | 07-22 09:00 JST（水） | 07-22(水) / 07-29(水) / 08-05(水) | 同左（一致） |
 *
 * `FREQ=MONTHLY;BYMONTHDAY=15` を JST 00:30 起点にすると 16 日に化ける。
 * `FREQ=DAILY`（BYxxx なし）は日付を見ないのでずれない。
 *
 * ## 今日踏まない理由に寄りかからない
 *
 * この経路に到達できるのは admin の繰返し予約フォームだけで、開始時刻は
 * `TIME_OPTIONS`（`reservation-form-helpers.ts` の `9 + i` × 13）の
 * 09:00〜21:00 しか選べないため**現時点では踏まない**。だが選択肢を早朝へ
 * 広げるのは 1 行の変更で、そのとき出るのは例外でもテストの赤でもなく
 * **誤った日付の予約データ**になる。UI の都合に正しさを預けない。
 *
 * JST は UTC+09:00 固定で DST が無い（1951 年以降）。
 */
const JST_FRAME_OFFSET_MS = 9 * MS_PER_HOUR;

/** 真の instant → rrule.js の壁時計フレーム。 */
function toRruleFrame(instant: Date): Date {
  return new Date(instant.getTime() + JST_FRAME_OFFSET_MS);
}

/** rrule.js の壁時計フレーム → 真の instant。 */
function fromRruleFrame(framed: Date): Date {
  return new Date(framed.getTime() - JST_FRAME_OFFSET_MS);
}

/**
 * 展開用の parse。**DTSTART と UNTIL の両方**を JST 壁時計フレームへ載せる。
 *
 * UNTIL を置き去りにすると監査 F-36 が再発する。admin の builder
 * （`rrule-utils.ts` の `formatUntil`）は「JST のその日の終わり」を
 * `UNTIL=<date>T145959Z` として書く。フレーム上では素の 14:59:59 が壁時計の
 * 14:59 と読まれてしまい、**終了日当日の夕方の枠が丸ごと落ちる**。
 * DTSTART と同じ幅だけ動かして、上限の意味を保つ。
 *
 * 展開結果もフレーム上の値なので、外へ返す前に `fromRruleFrame` で戻す。
 */
function parseForExpansion(rrule: string, dtstart: Date): RRule {
  const parsed = RRule.fromString(
    `DTSTART:${toIcalDate(toRruleFrame(dtstart))}\nRRULE:${rrule}`,
  );
  const until = parsed.origOptions.until;
  if (!until) return parsed;
  return new RRule({ ...parsed.origOptions, until: toRruleFrame(until) });
}

export type ValidateRruleInput = {
  rrule: string;
  dtstart: Date;
  /**
   * 1 回あたりの予約時間（分）。本関数では未使用（instance 展開・FREQ 検証には
   * 不要なため）。series-commands（Task 9 以降）が各 instance の [start, start+duration)
   * を組み立てる際に呼出元で使う想定で、入力契約としてここに保持している。
   */
  duration: number;
  maxInstances: number;
};

export type ValidateRruleResult =
  | { ok: true; instanceCount: number; instances: Date[] }
  | { ok: false; error: string };

/**
 * 繰返し予約 (ReservationSeries) 作成用に RRULE を検証する。
 *
 * 検証順序: (1) parse 文法エラー (2) FREQ ホワイトリスト (3) instance 0 件
 * (4) instance 数が maxInstances 超過。すべて通れば ok:true + 展開済み instances。
 *
 * 展開は JST 壁時計フレームで行い、戻り値は真の instant に直す。
 */
export function validateRruleForSeries(
  input: ValidateRruleInput,
): ValidateRruleResult {
  let rule: RRule;
  try {
    rule = parseForExpansion(input.rrule, input.dtstart);
  } catch (err) {
    return {
      ok: false,
      error: `RRULE 文字列の parse に失敗: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!ALLOWED_FREQS.has(rule.options.freq)) {
    return {
      ok: false,
      error: `FREQ は ${Object.keys(RESERVATION_SERIES_FREQ).join(" / ")} のみサポート`,
    };
  }

  // maxInstances 超過を検出するため、素朴に 2 年先まで展開する
  // （COUNT/UNTIL 指定なしの無限 RRULE でも安全に打ち切るための上限窓）。
  const upTo = new Date(input.dtstart.getTime() + 2 * 365 * MS_PER_DAY);
  const instances = rule
    .between(toRruleFrame(input.dtstart), toRruleFrame(upTo), true)
    .map(fromRruleFrame);

  if (instances.length === 0) {
    return { ok: false, error: "instance が 0 個。RRULE を再確認してください" };
  }

  if (instances.length > input.maxInstances) {
    return {
      ok: false,
      error: `instance 数 ${instances.length} が上限 ${input.maxInstances} を超えました`,
    };
  }

  return { ok: true, instanceCount: instances.length, instances };
}

/** Date → iCalendar DATE-TIME (UTC, "20260722T100000Z" 形式) */
function toIcalDate(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}${mo}${day}T${h}${mi}${s}Z`;
}

/**
 * 既存 RRULE 文字列に UNTIL を注入して再構築する (Phase B.2.1 non-goal Task C)。
 *
 * this-and-following scope で「これ以降の instance を打ち切る」ために master event
 * の RRULE を更新する用途。RFC 5545 の COUNT/UNTIL 相互排他契約に従い、既存
 * RRULE に COUNT が含まれる場合は削除して UNTIL 一本に統一する。
 *
 * 戻り値は `RRULE:` prefix なしの本体文字列 (呼出側で `RRULE:${result}` として
 * Google Calendar API `recurrence` に載せる)。
 *
 * **ここはフレームに載せない。** 展開せず文字列を組み立てるだけで、RFC 5545 は
 * DTSTART が timezone 付きのとき `UNTIL` を UTC で書くことを求める。Google
 * Calendar 側は DTSTART を timeZone 付きで別に受け取るので、`until` は真の
 * instant のまま渡すのが正しい。
 */
export function rebuildRruleWithUntil(
  rrule: string,
  dtstart: Date,
  until: Date,
): string {
  // ここはフレームに載せない。`origOptions` から取るのは FREQ / INTERVAL /
  // BYDAY 等だけで、`until` は引数で上書きするため。
  const rule = RRule.fromString(
    `DTSTART:${toIcalDate(dtstart)}\nRRULE:${rrule}`,
  );
  const rebuilt = new RRule({
    ...rule.origOptions,
    until,
    count: null,
  });
  // RRule.toString() は options に dtstart を含む場合 "DTSTART:...\nRRULE:..." を、
  // 含まない場合 "RRULE:..." を返す。安全のため RRULE 行を抽出する。
  const lines = rebuilt.toString().split("\n");
  const rruleLine = lines.find((l) => l.startsWith("RRULE:"));
  if (!rruleLine) {
    throw new Error(
      "RRule.toString() did not include RRULE line (rrule.js contract broken)",
    );
  }
  return rruleLine.replace(/^RRULE:/u, "");
}
