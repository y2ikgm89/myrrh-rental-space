import { z } from "zod";
import { EventStatus } from "@/shared/lib/validations/enums/prisma-types";
import { lexicalJsonSchema } from "@/shared/lib/validations/lexical";

/**
 * base schema（refine 前 — .extend() / .omit() 可能な ZodObject）
 * Space の `spaceFormBaseSchema` と同じ分離パターン。
 */
export const eventFormBaseSchema = z.object({
  title: z
    .string()
    .min(1, { error: "タイトルは必須です" })
    .max(200, { error: "タイトルは200文字以内です" }),
  slug: z
    .string()
    .min(1, { error: "スラッグは必須です" })
    .max(100, { error: "スラッグは100文字以内です" }),
  /** Lexical EditorState JSON 文字列（UI: LazyLexicalEditor） */
  descriptionJson: lexicalJsonSchema,
  /** クライアント側 `renderEditorStateJsonToHtmlClient` で事前生成した HTML */
  descriptionHtml: z.string(),
  thumbnailUrl: z.string().nullable().optional(),
  // `local: true` は `<input type="datetime-local">` の値（"YYYY-MM-DDTHH:mm" / "...:ss"）
  // と full ISO（Z 付き）の両方を許容する Zod 4 公式オプション。
  startTime: z
    .string()
    .datetime({ local: true, error: "有効な日時を入力してください" }),
  endTime: z
    .string()
    .datetime({ local: true, error: "有効な日時を入力してください" }),
  /**
   * 申込締切日時（null/"" = 開始時刻まで受付）。startTime 以前である必要あり。
   * `<input type="datetime-local">` が空欄時 `""` を返すため `.or(z.literal(""))` で許容、
   * 後段（cross-field refine, command 層）で falsy 判定により null に正規化。
   */
  registrationDeadline: z
    .string()
    .datetime({ local: true, error: "有効な日時を入力してください" })
    .or(z.literal(""))
    .nullable()
    .optional(),
  capacity: z
    .number()
    .int()
    .min(1, { error: "定員は1以上です" })
    .nullable()
    .optional(),
  price: z
    .number()
    .int()
    .min(0, { error: "料金は0以上です" })
    .nullable()
    .optional(),
  /** 号室・フロア・補足情報、または外部会場名（locationId が null のとき） */
  addressDetail: z
    .string()
    .max(200, { error: "会場情報は200文字以内です" })
    .nullable()
    .optional(),
  /** 会場（Location FK）。null = 外部会場または未設定 */
  locationId: z
    .string()
    .uuid({ error: "無効な会場 ID です" })
    .nullable()
    .optional(),
  spaceId: z
    .string()
    .uuid({ error: "無効なスペース ID です" })
    .nullable()
    .optional(),
  status: z.enum(EventStatus, { error: "無効なステータスです" }),
  registrationOpen: z.boolean().optional(),
});

/**
 * cross-field validation を集約。base schema を破壊しないために
 * `superRefine` を使用（複数 refine の chain より公式推奨）。
 */
export const eventFormSchema = eventFormBaseSchema.superRefine((data, ctx) => {
  if (new Date(data.endTime) <= new Date(data.startTime)) {
    ctx.addIssue({
      code: "custom",
      message: "終了時刻は開始時刻より後である必要があります",
      path: ["endTime"],
    });
  }

  if (
    data.registrationDeadline &&
    new Date(data.registrationDeadline) > new Date(data.startTime)
  ) {
    ctx.addIssue({
      code: "custom",
      message: "申込締切は開始時刻以前である必要があります",
      path: ["registrationDeadline"],
    });
  }
});

export type EventFormInput = z.infer<typeof eventFormSchema>;

export const updateEventSchema = eventFormBaseSchema
  .extend({ id: z.string().min(1, { error: "IDは必須です" }) })
  .superRefine((data, ctx) => {
    if (new Date(data.endTime) <= new Date(data.startTime)) {
      ctx.addIssue({
        code: "custom",
        message: "終了時刻は開始時刻より後である必要があります",
        path: ["endTime"],
      });
    }
    if (
      data.registrationDeadline &&
      new Date(data.registrationDeadline) > new Date(data.startTime)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "申込締切は開始時刻以前である必要があります",
        path: ["registrationDeadline"],
      });
    }
  });

export type UpdateEventInput = z.infer<typeof updateEventSchema>;
