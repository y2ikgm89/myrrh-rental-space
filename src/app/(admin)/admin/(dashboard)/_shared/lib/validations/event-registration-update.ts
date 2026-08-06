import { z } from "zod";
import {
  EMAIL_MAX_LENGTH,
  isEmailFormat,
} from "@/shared/lib/validations/customer-shared-fields";
import { entityIdSchema } from "@/shared/lib/validations/entity-id";

/**
 * 管理画面からの参加登録編集（`updateEventRegistration`）の入力スキーマ。
 *
 * ## なぜ action ファイルから出したか
 *
 * 元は `_shared/actions/event-registration.ts`（`"use server"`）の中に置かれており、
 * **その位置では export できない**（`"use server"` は async 関数以外を export できない）。
 * export できないということは、`varchar-write-bounds` gate から probe できない
 * ということでもある。実際そのあいだ、この schema の `email` だけが `.max(255)` の
 * まま残り、`EventRegistration.email`（`VarChar(254)`）へ 255 文字を書けた。
 * 上限を直したうえで、**二度と gate の外に出ないよう**参照可能な位置へ移す。
 *
 * ## email の形
 *
 * 空欄を `null` に畳んでから形式検証する（受付側の schema は空文字のまま保存経路へ
 * 渡す設計で、こちらは畳む — 既存の挙動を変えない）。長さは `.pipe()` の**前**に
 * 掛ける。`.pipe()` は ZodString のチェーンを閉じるので、後ろに置くと conform が
 * `maxlength` を拾えなくなる。
 */
export const updateRegistrationSchema = z.object({
  registrationId: entityIdSchema("EventRegistration"),
  name: z.string().trim().min(1, "氏名を入力してください").max(100),
  email: z
    .string()
    .trim()
    .max(EMAIL_MAX_LENGTH, {
      error: `メールアドレスは${EMAIL_MAX_LENGTH}文字以内で入力してください`,
    })
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : v))
    .pipe(
      z.union([
        z.string().refine(isEmailFormat, {
          error: "メールアドレスの形式が不正です",
        }),
        z.null(),
      ]),
    ),
  phone: z
    .string()
    .trim()
    .max(20)
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : v)),
  note: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : v)),
  quantity: z.number().int().min(1).max(100),
});

export type UpdateRegistrationInput = z.input<typeof updateRegistrationSchema>;
