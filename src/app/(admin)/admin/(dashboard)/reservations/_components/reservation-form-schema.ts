import { z } from "zod";
import { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";
import { CREATABLE_RESERVATION_STATUSES } from "@/shared/lib/validations/enums/helpers";

/**
 * ReservationForm / ReservationEditForm (conform) form schema
 *
 * conform `parseWithZod` 経由で FormData 文字列を受けるため、
 * - boolean (`sendEmail` / `sendNotificationEmail`) は Switch + hidden input
 *   "on" / "" を `z.preprocess` で boolean coerce
 * - `totalPrice` は手動価格調整、空文字は undefined
 * - `customerData` は nested object (`customerData.lastName` 等)
 * - `mode` で「既存顧客 / 新規顧客」を排他制御 (cross-field refine)
 * - cross-field refine: 終了時間 > 開始時間 / 最低 1 時間 / status は作成時 CREATABLE のみ
 */

const booleanFromCheckbox = z.preprocess(
  (value) => value === "on" || value === true,
  z.boolean(),
);

const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, { error: "日付の形式が正しくありません" });

const timeStringSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/u, {
  error: "時間の形式が正しくありません",
});

const couponCodeSchema = z
  .string()
  .max(20, { error: "クーポンコードは20文字以内です" })
  .optional()
  .or(z.literal(""));

const notesSchema = z
  .string()
  .max(1000, { error: "メモは1000文字以内で入力してください" })
  .optional()
  .or(z.literal(""));

const totalPriceSchema = z.preprocess(
  (value) => {
    if (value === "" || value === undefined || value === null) return undefined;
    return value;
  },
  z.coerce
    .number({ error: "料金は数値で入力してください" })
    .nonnegative({ error: "料金は0以上で入力してください" })
    .optional(),
);

const newCustomerObjectSchema = z.object({
  lastName: z
    .string()
    .min(1, { error: "姓を入力してください" })
    .max(50, { error: "姓は50文字以内で入力してください" }),
  firstName: z
    .string()
    .min(1, { error: "名を入力してください" })
    .max(50, { error: "名は50文字以内で入力してください" }),
  companyName: z
    .string()
    .max(100, { error: "会社名は100文字以内で入力してください" })
    .optional()
    .or(z.literal("")),
  email: z
    .string()
    .min(1, { error: "メールアドレスを入力してください" })
    .email({ error: "有効なメールアドレスを入力してください" }),
  phoneNumber: z
    .string()
    .max(20, { error: "電話番号は20文字以内で入力してください" })
    .optional()
    .or(z.literal("")),
});

const customerModeSchema = z.enum(["existing", "new"]);

/** 終了時間 > 開始時間 + 1h 以上 */
function refineTimeRange(
  data: { date: string; startTime: string; endTime: string },
  ctx: z.RefinementCtx,
): void {
  const start = new Date(`${data.date}T${data.startTime}`);
  const end = new Date(`${data.date}T${data.endTime}`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
  if (end <= start) {
    ctx.addIssue({
      code: "custom",
      message: "終了時間は開始時間より後に設定してください",
      path: ["endTime"],
    });
    return;
  }
  const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  if (diffHours < 1) {
    ctx.addIssue({
      code: "custom",
      message: "最低1時間以上の予約が必要です",
      path: ["endTime"],
    });
  }
}

// =============================================================================
// Create schema
// =============================================================================

export const createReservationFormSchema = z
  .object({
    mode: customerModeSchema,
    customerId: z.string().optional().or(z.literal("")),
    customerData: newCustomerObjectSchema.optional(),
    spaceId: z.string().uuid({ error: "スペースを選択してください" }),
    date: dateStringSchema,
    startTime: timeStringSchema,
    endTime: timeStringSchema,
    totalPrice: totalPriceSchema,
    couponCode: couponCodeSchema,
    status: z.enum(ReservationStatus).default(ReservationStatus.CONFIRMED),
    notes: notesSchema,
    sendEmail: booleanFromCheckbox,
  })
  .superRefine((data, ctx) => {
    refineTimeRange(data, ctx);

    if (
      !CREATABLE_RESERVATION_STATUSES.includes(
        data.status ?? ReservationStatus.CONFIRMED,
      )
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "作成時は「保留中」または「確認済み」のステータスのみ指定できます",
        path: ["status"],
      });
    }

    if (data.mode === "existing") {
      if (
        !data.customerId ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
          data.customerId,
        )
      ) {
        ctx.addIssue({
          code: "custom",
          message: "顧客を選択してください",
          path: ["customerId"],
        });
      }
    } else if (data.mode === "new") {
      if (!data.customerData) {
        ctx.addIssue({
          code: "custom",
          message: "新規顧客情報を入力してください",
          path: ["customerData", "lastName"],
        });
      }
    }
  });

export type CreateReservationFormInput = z.input<
  typeof createReservationFormSchema
>;
export type CreateReservationFormData = z.output<
  typeof createReservationFormSchema
>;

// =============================================================================
// Update schema
// =============================================================================

export const updateReservationFormSchema = z
  .object({
    spaceId: z.string().uuid({ error: "スペースを選択してください" }),
    date: dateStringSchema,
    startTime: timeStringSchema,
    endTime: timeStringSchema,
    customerId: z.string().uuid({ error: "顧客IDが不正です" }),
    totalPrice: totalPriceSchema,
    couponCode: couponCodeSchema,
    status: z.enum(ReservationStatus).default(ReservationStatus.CONFIRMED),
    notes: notesSchema,
    sendNotificationEmail: booleanFromCheckbox,
  })
  .superRefine((data, ctx) => {
    refineTimeRange(data, ctx);
  });

export type UpdateReservationFormData = z.output<
  typeof updateReservationFormSchema
>;
