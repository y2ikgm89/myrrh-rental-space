import { z } from "zod";

/**
 * 繰返し予約 (ReservationSeries) の 3 択キャンセル入力スキーマ。
 *
 * Server Action (`cancelReservationSeriesAction`) と、それを submit する
 * client component (`SeriesInfoSection`) の **両方**が参照する。
 * action 本体は `"use server"` ファイルにあり async 関数しか export できないため、
 * schema はここに置く（配置規約は `.claude/rules/forms-mutations.md`）。
 *
 * Google Calendar 業界標準の 3 スコープ:
 *   - `this-only`           この予約のみ
 *   - `this-and-following`  この予約と以降
 *   - `series-all`          すべて
 *
 * 前 2 者は起点となる instance を必要とするので `superRefine` で要求する。
 */
export const cancelReservationSeriesSchema = z
  .object({
    seriesId: z.uuid({ error: "series id が不正です" }),
    scope: z.enum(["this-only", "this-and-following", "series-all"]),
    fromInstanceId: z.uuid().optional().or(z.literal("")),
    cancellationReason: z.string().max(500).optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (
      (data.scope === "this-only" || data.scope === "this-and-following") &&
      (!data.fromInstanceId || data.fromInstanceId === "")
    ) {
      ctx.addIssue({
        code: "custom",
        message: "対象 instance が指定されていません",
        path: ["fromInstanceId"],
      });
    }
  });

export type CancelReservationSeriesScope = z.infer<
  typeof cancelReservationSeriesSchema
>["scope"];
