import { z } from "zod";
import { parseDateTimeLocalAsJst } from "@/shared/lib/date-format";
import {
  EventFormat,
  EventScheduleMode,
  EventStatus,
  MeetingProvider,
  EVENT_FORMAT_VALUES,
  MEETING_PROVIDER_VALUES,
  type EventFormatValue,
  type MeetingProviderValue,
} from "@/shared/lib/validations/enums/prisma-types";
import { lexicalJsonSchema } from "@/shared/lib/validations/lexical";
import { SLUG_REGEX } from "@/shared/lib/validations/params";
import { gallerySchema } from "@/shared/lib/validations/gallery";

/**
 * EventForm (conform) form schema
 *
 * conform `parseWithZod` 経由で FormData 文字列を受けるため、
 * - `descriptionJson` (Lexical EditorState JSON) は hidden input で transit
 * - `descriptionHtml` は server が descriptionJson から派生
 * - boolean (`registrationOpen`) は Switch + hidden input "on" / "" を `z.preprocess` で coerce
 * - `tickets` は JSON 文字列 hidden input で transit、preprocess で JSON.parse + array validate。
 *   `sortOrder` は payload から受け取らず、domain command が配列順から 0 始まりで派生する
 * - `slots`  は JSON 文字列 hidden input で transit、preprocess で JSON.parse + array validate
 *   （startAt/endAt は datetime-local 文字列 → parseDateTimeLocalAsJst で Date 変換）
 * - sentinel `EVENT_FORM_NONE_VALUE` で `locationId` / `spaceId` の「外部会場」「会場全体」を表現、preprocess で null 化
 * - `format` / `meetingProvider` は ToggleGroup / RadioGroup 由来の hidden input で常時送信、
 *   `meetingUrl` は条件付きで表示される url input（空文字は preprocess で null 化）
 * - cross-field refine:
 *   - SINGLE_OCCURRENCE はスロット 1 件のみ
 *   - TIMED_ENTRY はスロット 2 件以上
 *   - registrationDeadline ≤ 最初スロット開始時刻
 *   - format が ONLINE/HYBRID かつ meetingProvider が MANUAL の場合は meetingUrl 必須
 *     （`src/shared/domain/events/commands.ts` の `eventInputSchema` と同一ロジック。
 *     server-side の domain 層でも同じ invariant を二重に強制している）
 */

/** Radix Select の `value=""` 予約を回避する「未選択」sentinel（会場 / スペース共通）。 */
export const EVENT_FORM_NONE_VALUE = "__none__";

const booleanFromCheckbox = z.preprocess(
  (value) => value === "on" || value === true,
  z.boolean(),
);

const emptyOrNullToNull = (value: unknown): unknown =>
  value === "" || value === null || value === undefined ? null : value;

const nullableUuidWithSentinel = (sentinel: string) =>
  z.preprocess(
    (value) =>
      value === "" || value === sentinel || value === undefined ? null : value,
    z.uuid({ error: "無効なID形式です" }).nullable().optional(),
  );

const ticketInputSchema = z.strictObject({
  id: z.string().optional(),
  name: z
    .string()
    .min(1, { error: "チケット名は必須です" })
    .max(100, { error: "チケット名は100文字以内です" }),
  description: z
    .string()
    .max(500, { error: "説明は500文字以内です" })
    .nullable(),
  price: z.number().int().min(0, { error: "料金は0以上です" }),
  capacity: z.number().int().min(1).nullable(),
  unitSize: z
    .number()
    .int()
    .min(1, { error: "1チケットあたりの人数は1以上です" }),
  isAvailable: z.boolean(),
});

const ticketsSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    if (value === "") return [];
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  },
  z
    .array(ticketInputSchema)
    .min(1, { error: "区分を少なくとも1つ登録してください" })
    /**
     * 区分が複数あるときは枠数 (capacity) を必須化。
     *
     * 単一区分なら基本情報の定員 (Event.capacity) を全枠数として使えるが、
     * 複数区分のときは各区分の枠数を明示しないと「どの区分から何人受け入れるか」
     * が決まらず公開申込フォームで在庫管理ができない (Eventbrite / Peatix と同 UX)。
     */
    .superRefine((tickets, ctx) => {
      if (tickets.length <= 1) return;
      tickets.forEach((ticket, index) => {
        if (ticket.capacity == null) {
          ctx.addIssue({
            code: "custom",
            message: "区分が複数のときは枠数を入力してください",
            path: [index, "capacity"],
          });
        }
      });
    }),
);

/** 各スロットの入力スキーマ（JSON transit 内の各要素）。startAt/endAt は datetime-local 文字列→Date 変換。 */
const slotFormItemSchema = z.object({
  id: z.string().optional(),
  startAt: z.iso
    .datetime({ local: true, error: "有効な開始日時を入力してください" })
    .transform(parseDateTimeLocalAsJst),
  endAt: z.iso
    .datetime({ local: true, error: "有効な終了日時を入力してください" })
    .transform(parseDateTimeLocalAsJst),
  capacity: z.number().int().min(1, { error: "定員は1以上です" }),
});

/** スロット一覧（JSON 文字列 hidden input で transit）。 */
const slotsSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    if (value === "") return [];
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  },
  z
    .array(slotFormItemSchema)
    .min(1, { error: "スロットを少なくとも1件登録してください" }),
);

const optionalNullableString = (maxLength: number, error: string) =>
  z.preprocess(
    emptyOrNullToNull,
    z.string().max(maxLength, { error }).nullable().optional(),
  );

const eventFormBaseSchema = z.object({
  title: z
    .string()
    .min(1, { error: "タイトルは必須です" })
    .max(200, { error: "タイトルは200文字以内です" }),
  slug: z
    .string()
    .min(1, { error: "スラッグは必須です" })
    .max(100, { error: "スラッグは100文字以内です" })
    .regex(SLUG_REGEX, {
      error:
        "スラッグは小文字英数字とハイフンのみ使用できます（先頭/末尾/連続ハイフン禁止）",
    }),
  /** Lexical EditorState JSON 文字列（hidden input transit） */
  descriptionJson: lexicalJsonSchema,
  thumbnailUrl: z.preprocess(
    (value) => (value === "" ? null : value),
    z.string().nullable().optional(),
  ),
  /** タイムスロット一覧（JSON 文字列で transit、startAt/endAt は Date 変換済み）。必須 ≥ 1 件。 */
  slots: slotsSchema,
  registrationDeadline: z.iso
    .datetime({ local: true, error: "有効な日時を入力してください" })
    .or(z.literal(""))
    .nullable()
    .optional(),
  tickets: ticketsSchema,
  addressDetail: z.preprocess(
    (value) => (value === "" ? null : value),
    z
      .string()
      .max(200, { error: "会場情報は200文字以内です" })
      .nullable()
      .optional(),
  ),
  locationId: nullableUuidWithSentinel(EVENT_FORM_NONE_VALUE),
  spaceId: nullableUuidWithSentinel(EVENT_FORM_NONE_VALUE),
  /** 開催形態 (Phase B.1)。ToggleGroup 由来の hidden input で常時送信される。 */
  format: z
    .enum(EVENT_FORMAT_VALUES, { error: "無効な開催形態です" })
    .default(EventFormat.OFFLINE),
  /**
   * オンライン会議 URL。ONLINE/HYBRID 開催かつ meetingProvider が MANUAL の場合のみ
   * `refineEvent` が必須化する。空文字は preprocess で null 化してから `.url()` の
   * 形式チェックにかけるため、未入力時は形式エラーと必須エラーが二重に出ない。
   */
  meetingUrl: z.preprocess(
    emptyOrNullToNull,
    z
      .url({ error: "有効な会議 URL を入力してください" })
      .startsWith("https://", {
        error: "会議 URL は https:// で始まる必要があります",
      })
      .max(500, { error: "会議 URL は500文字以内で入力してください" })
      .nullable()
      .optional(),
  ),
  /** オンライン会議の発行元。RadioGroup 由来の hidden input で常時送信される。 */
  meetingProvider: z
    .enum(MEETING_PROVIDER_VALUES, { error: "無効な発行元です" })
    .default(MeetingProvider.MANUAL),
  status: z.enum(EventStatus, { error: "無効なステータスです" }),
  scheduleMode: z.enum(EventScheduleMode, {
    error: "無効な開催方式です",
  }),
  registrationOpen: booleanFromCheckbox,
  ogpImageUrl: z.preprocess(
    emptyOrNullToNull,
    z.string().nullable().optional(),
  ),
  ogpTitle: optionalNullableString(70, "OGPタイトルは70文字以内です"),
  ogpDescription: optionalNullableString(200, "OGP説明文は200文字以内です"),
  metaDescription: optionalNullableString(160, "メタ説明文は160文字以内です"),
  metaKeywords: optionalNullableString(500, "メタキーワードは500文字以内です"),
  gallery: gallerySchema,
});

function refineEvent(
  data: {
    scheduleMode: keyof typeof EventScheduleMode;
    slots: Array<{ startAt: Date }>;
    registrationDeadline?: string | null | undefined;
    format: EventFormatValue;
    meetingUrl?: string | null | undefined;
    meetingProvider: MeetingProviderValue;
  },
  ctx: z.RefinementCtx,
): void {
  if (
    data.scheduleMode === EventScheduleMode.SINGLE_OCCURRENCE &&
    data.slots.length !== 1
  ) {
    ctx.addIssue({
      code: "custom",
      message: "単一開催ではスロットを1件だけ登録してください",
      path: ["slots"],
    });
  }

  if (
    data.scheduleMode === EventScheduleMode.TIMED_ENTRY &&
    data.slots.length < 2
  ) {
    ctx.addIssue({
      code: "custom",
      message: "日時選択制ではスロットを2件以上登録してください",
      path: ["slots"],
    });
  }

  const firstSlot = data.slots[0];
  if (!firstSlot) return;

  if (
    typeof data.registrationDeadline === "string" &&
    data.registrationDeadline !== ""
  ) {
    const deadline = parseDateTimeLocalAsJst(data.registrationDeadline);
    if (!Number.isNaN(deadline.getTime()) && deadline > firstSlot.startAt) {
      ctx.addIssue({
        code: "custom",
        message: "申込締切は最初のスロット開始時刻以前である必要があります",
        path: ["registrationDeadline"],
      });
    }
  }

  // オンライン開催関連の必須 URL チェック。ロジックは commands.ts の
  // `eventInputSchema`（domain 層の同一 invariant、二重防御として維持）と
  // 完全一致させる: OFFLINE は対象外、GOOGLE_MEET は GCal write-back 待ちのため
  // meetingUrl 未設定を許容、それ以外 (ONLINE/HYBRID + MANUAL) は必須。
  const meetingUrlRequired =
    data.format !== EventFormat.OFFLINE &&
    data.meetingProvider !== MeetingProvider.GOOGLE_MEET;
  if (
    meetingUrlRequired &&
    !(typeof data.meetingUrl === "string" && data.meetingUrl.length > 0)
  ) {
    ctx.addIssue({
      code: "custom",
      message:
        "オンライン開催・ハイブリッド開催で手入力の場合は会議 URL が必須です",
      path: ["meetingUrl"],
    });
  }
}

export const eventFormSchema = eventFormBaseSchema.superRefine(refineEvent);
export type EventFormInput = z.input<typeof eventFormSchema>;
export type EventFormData = z.output<typeof eventFormSchema>;
