import { z } from "zod";
import {
  EMAIL_MAX_LENGTH,
  isEmailFormat,
} from "@/shared/lib/validations/customer-shared-fields";

import { entityIdSchema } from "@/shared/lib/validations/entity-id";

/**
 * 受付での参加登録（当日参加 / 代行登録）の入力スキーマ。
 *
 * Server Action（`createWalkInRegistration` / `createAdminProxyRegistration`）と、
 * それを submit する client component（`WalkInDialog` / `ProxyRegistrationDialog`）の
 * **両方**が参照する。action 本体は `"use server"` ファイルにあり async 関数しか
 * export できないため、schema はここに置く
 * （配置規約は `.claude/rules/forms-mutations.md`）。
 *
 * ## 2 つのフォームで email の扱いが違う
 *
 * - 当日参加: 受付係が代行入力するので **任意**。空欄は `null` に畳む
 * - 代行登録: 確認メールを送るので **必須**
 *
 * それ以外の項目は同一なので共通部分を切り出してある。
 */
const onsiteRegistrationBase = {
  eventId: entityIdSchema("Event"),
  slotId: entityIdSchema("EventTimeSlot"),
  ticketId: entityIdSchema("EventTicket"),
  name: z.string().trim().min(1, "氏名を入力してください").max(100),
  // `transform` で null に畳まないのは、input ≠ output になると conform の
  // `submission.value` が変換前の型で返り、フォーム側と噛み合わなくなるため。
  // 空欄→null の正規化は保存経路（Server Action）の責務にする。
  phone: z.string().trim().max(20).optional(),
  note: z.string().trim().max(2000).optional(),
  // FormData は数値も文字列で渡すので coerce する
  quantity: z.coerce.number().int().min(1).max(100).default(1),
};

/**
 * 上限は `event_registrations.email` の列長（`VarChar(254)`）と同じ 254。
 *
 * 255 にしていたため、255 文字ちょうどのアドレスは Zod を通って INSERT で
 * PostgreSQL 22001（value too long）になっていた。**22001 は DomainError では
 * ないので `executeAdminMutationResult` の変換に乗らず 500 になり、画面には理由が
 * 出ない。** 受付列で参加者が待たされたまま、何度押しても登録できない。
 *
 * 値そのものは `emailFieldSchema`（`customer-shared-fields`）と同じ 254 だが、
 * ここは 2 つの理由でその helper をそのまま使えない:
 * 当日参加は任意（`.optional()`）、代行登録は必須（`.min(1)` の文言が要る）。
 * 数だけは `EMAIL_MAX_LENGTH` として 1 箇所から引く。
 */
export const walkInRegistrationSchema = z.object({
  ...onsiteRegistrationBase,
  // 受付係が代行入力するため任意。空文字は null 扱い
  email: z
    .string()
    .trim()
    .max(EMAIL_MAX_LENGTH, {
      error: `メールアドレスは${EMAIL_MAX_LENGTH}文字以内で入力してください`,
    })
    .optional()
    .refine((v) => !v || isEmailFormat(v), {
      error: "メールアドレスの形式が不正です",
    }),
});

export const adminProxyRegistrationSchema = z.object({
  ...onsiteRegistrationBase,
  // 代行登録では確認メールを送るため必須。空文字は Zod がエラーとする。
  email: z
    .string()
    .trim()
    .min(1, "メールアドレスを入力してください")
    .max(EMAIL_MAX_LENGTH, {
      error: `メールアドレスは${EMAIL_MAX_LENGTH}文字以内で入力してください`,
    })
    // `.pipe()` にすると conform が maxLength を拾えず maxlength が消える。
    .refine(isEmailFormat, { error: "メールアドレスの形式が不正です" }),
});

export type WalkInRegistrationInput = z.input<typeof walkInRegistrationSchema>;
export type AdminProxyRegistrationInput = z.input<
  typeof adminProxyRegistrationSchema
>;
