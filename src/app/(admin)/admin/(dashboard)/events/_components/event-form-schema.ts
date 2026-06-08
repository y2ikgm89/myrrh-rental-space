import { z } from "zod";
import { parseDateTimeLocalAsJst } from "@/shared/lib/date-format";
import { EventStatus } from "@/shared/lib/validations/enums/prisma-types";
import { lexicalJsonSchema } from "@/shared/lib/validations/lexical";

/**
 * EventForm (conform) form schema
 *
 * conform `parseWithZod` 経由で FormData 文字列を受けるため、
 * - `descriptionJson` (Lexical EditorState JSON) は hidden input で transit
 * - `descriptionHtml` は client-side で `renderEditorStateJsonToHtmlClient()` で生成 → hidden input
 * - boolean (`registrationOpen`) は Switch + hidden input "on" / "" を `z.preprocess` で coerce
 * - 数値 (`capacity`) は `<input type="number">` 経由で空文字 → null
 * - `tickets` は JSON 文字列 hidden input で transit、preprocess で JSON.parse + array validate
 * - sentinel `EVENT_FORM_NONE_VALUE` で `locationId` / `spaceId` の「外部会場」「会場全体」を表現、preprocess で null 化
 * - datetime-local (`startTime` / `endTime` / `registrationDeadline`) は JST 固定 `formatDateTimeLocalInJst` / `parseDateTimeLocalAsJst` SSoT 経由 (command 層)
 * - cross-field refine: 終了 > 開始 / registrationDeadline ≤ startTime
 */

/** Radix Select の `value=""` 予約を回避する「未選択」sentinel（会場 / スペース共通）。 */
export const EVENT_FORM_NONE_VALUE = "__none__";

const booleanFromCheckbox = z.preprocess(
  (value) => value === "on" || value === true,
  z.boolean(),
);

const emptyOrNullToNull = (value: unknown): unknown =>
  value === "" || value === null || value === undefined ? null : value;

const optionalNullableInt = z.preprocess(
  emptyOrNullToNull,
  z.union([z.coerce.number().int(), z.null()]).nullable().optional(),
);

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
    .max(100, { error: "スラッグは100文字以内です" }),
  /** Lexical EditorState JSON 文字列（hidden input transit） */
  descriptionJson: lexicalJsonSchema,
  /** クライアント側 `renderEditorStateJsonToHtmlClient` で事前生成した HTML（hidden input transit） */
  descriptionHtml: z.string(),
  thumbnailUrl: z.preprocess(
    (value) => (value === "" ? null : value),
    z.string().nullable().optional(),
  ),
  startTime: z
    .string()
    .datetime({ local: true, error: "有効な日時を入力してください" }),
  endTime: z
    .string()
    .datetime({ local: true, error: "有効な日時を入力してください" }),
  registrationDeadline: z
    .string()
    .datetime({ local: true, error: "有効な日時を入力してください" })
    .or(z.literal(""))
    .nullable()
    .optional(),
  capacity: optionalNullableInt,
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
  registrationOpen: booleanFromCheckbox,
  ogpImageUrl: z.preprocess(
    emptyOrNullToNull,
    z.string().nullable().optional(),
  ),
  ogpTitle: optionalNullableString(70, "OGPタイトルは70文字以内です"),
  ogpDescription: optionalNullableString(200, "OGP説明文は200文字以内です"),
  metaDescription: optionalNullableString(160, "メタ説明文は160文字以内です"),
  metaKeywords: optionalNullableString(500, "メタキーワードは500文字以内です"),
});

function refineEvent(
  data: {
    startTime: string;
    endTime: string;
    registrationDeadline?: string | null | undefined;
    capacity?: number | null | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  const start = parseDateTimeLocalAsJst(data.startTime);
  const end = parseDateTimeLocalAsJst(data.endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
  if (end <= start) {
    ctx.addIssue({
      code: "custom",
      message: "終了時刻は開始時刻より後である必要があります",
      path: ["endTime"],
    });
  }

  if (
    typeof data.registrationDeadline === "string" &&
    data.registrationDeadline !== ""
  ) {
    const deadline = parseDateTimeLocalAsJst(data.registrationDeadline);
    if (!Number.isNaN(deadline.getTime()) && deadline > start) {
      ctx.addIssue({
        code: "custom",
        message: "申込締切は開始時刻以前である必要があります",
        path: ["registrationDeadline"],
      });
    }
  }

  if (
    typeof data.capacity === "number" &&
    Number.isFinite(data.capacity) &&
    data.capacity < 1
  ) {
    ctx.addIssue({
      code: "custom",
      message: "定員は1以上です",
      path: ["capacity"],
    });
  }
}

export const eventFormSchema = eventFormBaseSchema.superRefine(refineEvent);
export type EventFormInput = z.input<typeof eventFormSchema>;
export type EventFormData = z.output<typeof eventFormSchema>;
