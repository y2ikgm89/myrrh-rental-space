/**
 * スペース編集ページの「スマートロックデバイス」タブ用フォームスキーマ。
 *
 * `spaceId`（作成時）/ デバイス行 ID（更新時）は Server Action 側で URL・呼出元から
 * 固定注入するため、フォームでは deviceId（SwitchBot 側 device ID / MAC アドレス）・
 * deviceName・deviceType・isActive のみ受け取る。
 */

import { z } from "zod";
import { SmartLockDeviceType } from "@/shared/lib/validations/enums/prisma-types";
import { switchBoolean } from "@/admin/actions/settings/schemas/form-schema-helpers";

export const smartLockDeviceTypeSchema = z.enum(SmartLockDeviceType);

export const smartLockDeviceFormSchema = z.object({
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
