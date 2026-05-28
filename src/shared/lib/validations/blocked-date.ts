/**
 * 臨時休業 / 急な休み（BlockedDate）のバリデーションスキーマ
 *
 * 設計方針:
 * - `scope` / `type` は Prisma enum ではなく DB VARCHAR + 型ガード SSoT
 *   （`@/shared/lib/validations/enums/helpers`）で運用。`z.enum(const)` で受ける
 * - `startDate` / `endDate` は `<input type="date">` の値（`"YYYY-MM-DD"`、
 *   JST カレンダー日付）を `z.iso.date()` で受け取る。domain command 側で
 *   `parseJstDateOnly()` を通して `@db.Date` 用の UTC 深夜 Date に変換する
 * - scope discriminated union（SPACE→spaceId / LOCATION→locationId / GLOBAL→両 null）
 *   は `.superRefine()` で二重防御（DB CHECK 制約と整合）。override は持たない（additive cascade）
 */

import { z } from "zod";
import {
  BLOCKED_DATE_SCOPE,
  BLOCKED_DATE_TYPE,
} from "@/shared/lib/validations/enums/helpers";

export const blockedDateScopeSchema = z.enum(BLOCKED_DATE_SCOPE);
export const blockedDateTypeSchema = z.enum(BLOCKED_DATE_TYPE);

/**
 * optional な UUID フィールド（空文字 / null / undefined はすべて null に正規化）。
 * conform の FormData transit では空欄が `""` で届くため `z.literal("")` も許容する。
 */
const optionalUuidField = z
  .union([z.uuid({ error: "ID の形式が正しくありません" }), z.literal("")])
  .nullish()
  .transform((value) => (value == null || value === "" ? null : value));

const blockedDateBaseSchema = z.object({
  scope: blockedDateScopeSchema,
  spaceId: optionalUuidField,
  locationId: optionalUuidField,
  startDate: z.iso.date({ error: "開始日を正しく入力してください" }),
  endDate: z.iso.date({ error: "終了日を正しく入力してください" }),
  reason: z
    .string()
    .max(200, { error: "理由は200文字以内で入力してください" })
    .nullish()
    .transform((value) => (value == null || value === "" ? null : value)),
  type: blockedDateTypeSchema,
});

export const blockedDateFormSchema = blockedDateBaseSchema.superRefine(
  (data, ctx) => {
    // 日付範囲の整合性（"YYYY-MM-DD" は辞書順 = 時系列順）
    if (data.endDate < data.startDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "終了日は開始日以降の日付を指定してください",
      });
    }

    // scope discriminated union（additive cascade、override なし）
    switch (data.scope) {
      case BLOCKED_DATE_SCOPE.SPACE:
        if (!data.spaceId) {
          ctx.addIssue({
            code: "custom",
            path: ["spaceId"],
            message: "スペース休業にはスペースを指定してください",
          });
        }
        if (data.locationId) {
          ctx.addIssue({
            code: "custom",
            path: ["locationId"],
            message: "スペース休業では拠点を指定できません",
          });
        }
        break;
      case BLOCKED_DATE_SCOPE.LOCATION:
        if (!data.locationId) {
          ctx.addIssue({
            code: "custom",
            path: ["locationId"],
            message: "拠点休業には拠点を指定してください",
          });
        }
        if (data.spaceId) {
          ctx.addIssue({
            code: "custom",
            path: ["spaceId"],
            message: "拠点休業ではスペースを指定できません",
          });
        }
        break;
      case BLOCKED_DATE_SCOPE.GLOBAL:
        if (data.spaceId) {
          ctx.addIssue({
            code: "custom",
            path: ["spaceId"],
            message: "全体休業ではスペースを指定できません",
          });
        }
        if (data.locationId) {
          ctx.addIssue({
            code: "custom",
            path: ["locationId"],
            message: "全体休業では拠点を指定できません",
          });
        }
        break;
    }
  },
);

export type BlockedDateFormData = z.infer<typeof blockedDateFormSchema>;
