/**
 * 返金ポリシー設定 Zod スキーマ (task #9 PR#5 admin settings UI)
 *
 * `Settings.refundPolicy` (Json?) の書込用スキーマ。
 *
 * ## 対応関係
 * - 有効/無効 (`refundPolicyEnabled`): switchBoolean、OFF なら policy を null 保存
 * - tier 配列 (`refundPolicyTiers`): 各 tier に `hoursBefore` (>=0) + `refundRate` (0-100)
 * - 既定返金率 (`refundPolicyDefaultRefundRate`): 0-100
 *
 * ## `parseRefundPolicy` (domain) の受入境界との整合
 * - `hoursBefore >= 0 && Number.isFinite`
 * - `refundRate >= 0 && refundRate <= 100 && Number.isFinite`
 * - `defaultRefundRate >= 0 && defaultRefundRate <= 100 && Number.isFinite`
 *
 * ## 重複禁止
 * discount rules と同型で、同一 `hoursBefore` の tier は登録不可 (優先順序が非決定的になる)。
 */

import { z } from "zod";
import { switchBoolean } from "./form-schema-helpers";

export const refundPolicyFormSchema = z
  .object({
    refundPolicyEnabled: switchBoolean(),
    refundPolicyTiers: z
      .array(
        z.object({
          hoursBefore: z.coerce.number().min(0).max(8760),
          refundRate: z.coerce.number().min(0).max(100),
        }),
      )
      .refine(
        (tiers) =>
          new Set(tiers.map((t) => t.hoursBefore)).size === tiers.length,
        { error: "同じ時間数の tier を複数登録することはできません" },
      )
      .default([]),
    // UI は Switch OFF のとき `{enabled && (...)}` で default rate input ごと隠すため、
    // OFF submit の FormData に refundPolicyDefaultRefundRate が含まれない。undefined を
    // NaN 化する `z.coerce.number()` の性質で validation が落ちると documented な
    // OFF=null 保存経路が UI から到達不能になるため、既定値 0 で吸収する
    // (OFF 時は server action が payload を捨てるので保存値には影響しない)。
    refundPolicyDefaultRefundRate: z.coerce.number().min(0).max(100).default(0),
  })
  .refine(
    (data) => !data.refundPolicyEnabled || data.refundPolicyTiers.length >= 1,
    {
      path: ["refundPolicyTiers"],
      error: "有効時は 1 つ以上の tier が必要です",
    },
  );

export type RefundPolicyFormInput = z.infer<typeof refundPolicyFormSchema>;
