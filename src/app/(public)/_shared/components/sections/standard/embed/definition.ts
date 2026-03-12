import { z } from "zod";
import type { SectionDefinition } from "@/shared/lib/sections/types";
import {
  embedAspectRatioValues,
  maxWidthValues,
  borderRadiusValues,
} from "@/shared/lib/validations/section-options";

export const embedConfigSchema = z.object({
  sectionLabel: z
    .string()
    .max(50, { error: "ラベルは50文字以内です" })
    .default("Media")
    .meta({ description: "セクションラベル", fieldType: "text" }),
  title: z
    .string()
    .max(100, { error: "タイトルは100文字以内です" })
    .optional()
    .meta({ description: "タイトル", fieldType: "text" }),
  embedUrl: z
    .string()
    .url({ error: "有効なURLを入力してください" })
    .optional()
    .or(z.literal(""))
    .meta({ description: "埋め込みURL", fieldType: "text" }),
  embedCode: z
    .string()
    .max(10000)
    .optional()
    .meta({ description: "埋め込みコード（HTML）", fieldType: "textarea" }),
  aspectRatio: z
    .enum(embedAspectRatioValues)
    .default("16:9")
    .meta({ description: "アスペクト比", fieldType: "select" }),
  maxWidth: z
    .enum(maxWidthValues)
    .default("lg")
    .meta({ description: "最大幅", fieldType: "select" }),
  borderRadius: z
    .enum(borderRadiusValues)
    .default("sm")
    .meta({ description: "角丸", fieldType: "select" }),
});

export type EmbedConfig = z.output<typeof embedConfigSchema>;

export const embedDefinition: SectionDefinition<typeof embedConfigSchema> = {
  id: "embed",
  meta: {
    label: "埋め込み",
    description:
      "YouTubeやGoogleフォームなどの外部コンテンツを埋め込みます。",
    icon: "Code",
    category: "media",
  },
  configSchema: embedConfigSchema,
  defaultConfig: embedConfigSchema.parse({}),
  component: {
    type: "server",
    load: () =>
      import("../../../../../_components/EmbedSection").then((m) => ({
        default: m.EmbedSection,
      })),
  },
};
