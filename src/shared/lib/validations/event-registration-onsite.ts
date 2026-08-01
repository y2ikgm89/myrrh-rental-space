import { z } from "zod";

import {
  prismaCuid2IdSchema,
  prismaCuidIdSchema,
} from "@/shared/lib/validations/params";

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
  eventId: prismaCuidIdSchema("イベント"),
  slotId: prismaCuid2IdSchema("イベントタイムスロット"),
  ticketId: prismaCuidIdSchema("イベントチケット"),
  name: z.string().trim().min(1, "氏名を入力してください").max(100),
  // `transform` で null に畳まないのは、input ≠ output になると conform の
  // `submission.value` が変換前の型で返り、フォーム側と噛み合わなくなるため。
  // 空欄→null の正規化は保存経路（Server Action）の責務にする。
  phone: z.string().trim().max(20).optional(),
  note: z.string().trim().max(2000).optional(),
  // FormData は数値も文字列で渡すので coerce する
  quantity: z.coerce.number().int().min(1).max(100).default(1),
};

export const walkInRegistrationSchema = z.object({
  ...onsiteRegistrationBase,
  // 受付係が代行入力するため任意。空文字は null 扱い
  email: z
    .string()
    .trim()
    .max(255)
    .optional()
    .refine((v) => !v || z.email().safeParse(v).success, {
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
    .max(255)
    .pipe(z.email({ error: "メールアドレスの形式が不正です" })),
});

export type WalkInRegistrationInput = z.input<typeof walkInRegistrationSchema>;
export type AdminProxyRegistrationInput = z.input<
  typeof adminProxyRegistrationSchema
>;
