import { z } from "zod";
import { EventStatus } from "@/shared/lib/validations/enums/prisma-types";
import { lexicalJsonSchema } from "@/shared/lib/validations/lexical";

/**
 * EventForm (conform) form schema
 *
 * conform `parseWithZod` 経由で FormData 文字列を受けるため、
 * - `descriptionJson` (Lexical EditorState JSON) は hidden input で transit
 * - `descriptionHtml` は client-side で `renderEditorStateJsonToHtmlClient()` で生成 → hidden input
 * - boolean (`registrationOpen`) は Switch + hidden input "on" / "" を `z.preprocess` で coerce
 * - 数値 (`capacity` / `price`) は `<input type="number">` 経由で空文字 → null
 * - sentinel `__none__` で `locationId` / `spaceId` の「外部会場」「会場全体」を表現、preprocess で null 化
 * - datetime-local (`startTime` / `endTime` / `registrationDeadline`) は JST 固定 `formatDateTimeLocalInJst` / `parseDateTimeLocalAsJst` SSoT 経由 (command 層)
 * - cross-field refine: 終了 > 開始 / registrationDeadline ≤ startTime
 */

export const LOCATION_NONE_VALUE = "__none__";
export const SPACE_NONE_VALUE = "__none__";

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
    z.string().uuid({ error: "無効なID形式です" }).nullable().optional(),
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
  price: optionalNullableInt,
  addressDetail: z.preprocess(
    (value) => (value === "" ? null : value),
    z
      .string()
      .max(200, { error: "会場情報は200文字以内です" })
      .nullable()
      .optional(),
  ),
  locationId: nullableUuidWithSentinel(LOCATION_NONE_VALUE),
  spaceId: nullableUuidWithSentinel(SPACE_NONE_VALUE),
  status: z.enum(EventStatus, { error: "無効なステータスです" }),
  registrationOpen: booleanFromCheckbox,
});

function refineEvent(
  data: {
    startTime: string;
    endTime: string;
    registrationDeadline?: string | null | undefined;
    capacity?: number | null | undefined;
    price?: number | null | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  const start = new Date(data.startTime);
  const end = new Date(data.endTime);
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
    const deadline = new Date(data.registrationDeadline);
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

  if (
    typeof data.price === "number" &&
    Number.isFinite(data.price) &&
    data.price < 0
  ) {
    ctx.addIssue({
      code: "custom",
      message: "料金は0以上です",
      path: ["price"],
    });
  }
}

export const eventFormSchema = eventFormBaseSchema.superRefine(refineEvent);
export type EventFormInput = z.input<typeof eventFormSchema>;
export type EventFormData = z.output<typeof eventFormSchema>;
