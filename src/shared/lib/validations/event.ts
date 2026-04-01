import { z } from "zod";
import { EventStatus } from "@/shared/db/enums";

export const eventFormSchema = z
  .object({
    title: z
      .string()
      .min(1, { error: "タイトルは必須です" })
      .max(200, { error: "タイトルは200文字以内です" }),
    slug: z
      .string()
      .min(1, { error: "スラッグは必須です" })
      .max(100, { error: "スラッグは100文字以内です" }),
    description: z.string().nullable().optional(),
    contentJson: z.unknown().nullable().optional(),
    thumbnailUrl: z.string().nullable().optional(),
    startTime: z.string().datetime({ error: "有効な日時を入力してください" }),
    endTime: z.string().datetime({ error: "有効な日時を入力してください" }),
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
    location: z.string().max(200).nullable().optional(),
    spaceId: z.string().nullable().optional(),
    status: z.enum(EventStatus, { error: "無効なステータスです" }),
    registrationOpen: z.boolean().optional(),
  })
  .refine((data) => new Date(data.endTime) > new Date(data.startTime), {
    message: "終了時刻は開始時刻より後である必要があります",
    path: ["endTime"],
  });

export type EventFormInput = z.infer<typeof eventFormSchema>;

export const updateEventSchema = z
  .object({
    id: z.string().min(1, { error: "IDは必須です" }),
  })
  .and(eventFormSchema);

export type UpdateEventInput = z.infer<typeof updateEventSchema>;
