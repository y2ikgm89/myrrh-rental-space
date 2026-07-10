/**
 * スマートロックデバイス登録簿フォームスキーマ。
 *
 * デバイス行 ID（更新時）は Server Action 側で呼出元から固定注入するため、
 * フォームでは locationId（拠点）・deviceId（SwitchBot 側 device ID / MAC アドレス）・
 * deviceName・deviceType・isActive を受け取る。
 *
 * `locationId` は作成時に必須（デバイスは Location に属する FK 必須）。更新時も
 * フォームには含まれるが、`updateSmartLockDeviceCommand` は locationId の変更を
 * サポートしないため値は無視される（拠点は作成時のみ確定、以後は変更不可）。
 */

import { z } from "zod";
import { SmartLockDeviceType } from "@/shared/lib/validations/enums/prisma-types";
import { switchBoolean } from "@/admin/actions/settings/schemas/form-schema-helpers";

export const smartLockDeviceTypeSchema = z.enum(SmartLockDeviceType);

export const smartLockDeviceFormSchema = z.object({
  locationId: z.uuid({ error: "拠点を選択してください" }),
  deviceId: z
    .string()
    .trim()
    .min(1, { error: "デバイスID（MACアドレス）を入力してください" })
    .max(191, { error: "デバイスIDは191文字以内で入力してください" }),
  deviceName: z
    .string()
    .trim()
    .min(1, { error: "デバイス名を入力してください" })
    .max(100, { error: "デバイス名は100文字以内で入力してください" }),
  deviceType: smartLockDeviceTypeSchema,
  isActive: switchBoolean(),
});

export type SmartLockDeviceFormData = z.infer<typeof smartLockDeviceFormSchema>;
