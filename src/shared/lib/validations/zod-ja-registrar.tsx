"use client";

import "./zod-ja";

/**
 * client バンドルへ Zod 日本語ロケールを載せるアンカー。
 *
 * `RegisterStyleNonce` と同じ「null を描画するグローバル副作用 component」。
 * 両 root layout が描画する。副作用は module load 時に完了する。
 */
export function ZodJaRegistrar(): null {
  return null;
}
