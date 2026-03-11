import type { z } from "zod";
import type React from "react";

/** エフェクト ID（文字列 — レジストリで検証） */
export type EffectId = string;

/** エフェクトの配置レイヤー */
export type EffectLayer = "background" | "overlay";

/** エフェクト定義 */
export type EffectDefinition = {
  readonly id: EffectId;
  readonly label: string;
  readonly description: string;
  readonly layer: EffectLayer;
  readonly schema: z.ZodType;
  readonly defaultParams: Record<string, unknown>;
  readonly load: () => Promise<{
    default: React.ComponentType<{ params: Record<string, unknown> }>;
  }>;
};
