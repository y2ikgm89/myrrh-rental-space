import { z } from "zod";
import { parseDateTimeLocalAsJst } from "@/shared/lib/date-format";
import {
  EventScheduleMode,
  EventStatus,
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
 * - `tickets` は JSON 文字列 hidden input で transit、preprocess で JSON.parse + array validate
 * - `slots`  は JSON 文字列 hidden input で transit、preprocess で JSON.parse + array validate
 *   （startAt/endAt は datetime-local 文字列 → parseDateTimeLocalAsJst で Date 変換）
 * - sentinel `EVENT_FORM_NONE_VALUE` で `locationId` / `spaceId` の「外部会場」「会場全体」を表現、preprocess で null 化
 * - cross-field refine:
 *   - SINGLE_OCCURRENCE はスロット 1 件のみ
 *   - TIMED_ENTRY はスロット 2 件以上
 *   - registrationDeadline ≤ 最初スロット開始時刻
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

const ticketInputSchema = z.object({
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
  sortOrder: z.number().int().min(0),
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
}

export const eventFormSchema = eventFormBaseSchema.superRefine(refineEvent);
export type EventFormInput = z.input<typeof eventFormSchema>;
export type EventFormData = z.output<typeof eventFormSchema>;
