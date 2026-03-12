import { z } from "zod";
import type { SectionDefinition } from "@/shared/lib/sections/types";
import { gapSizeValues } from "@/shared/lib/validations/section-options";

export const instagramConfigSchema = z.object({
  sectionLabel: z
    .string()
    .max(50, { error: "ラベルは50文字以内です" })
    .default("Follow Us")
    .meta({ description: "セクションラベル", fieldType: "text" }),
  title: z
    .string()
    .max(100, { error: "タイトルは100文字以内です" })
    .default("Instagram")
    .meta({ description: "タイトル", fieldType: "text" }),
  columns: z
    .number()
    .int()
    .min(3)
    .max(6)
    .default(6)
    .meta({ description: "列数" }),
  count: z
    .number()
    .int()
    .min(6)
    .max(12)
    .default(6)
    .meta({ description: "表示数" }),
  gap: z
    .enum(gapSizeValues)
    .default("md")
    .meta({ description: "間隔", fieldType: "select" }),
});

export type InstagramConfig = z.output<typeof instagramConfigSchema>;

export const instagramDefinition: SectionDefinition<
  typeof instagramConfigSchema
> = {
  id: "instagram",
  meta: {
    label: "Instagram",
    description: "Instagramフィードを表示します。",
    icon: "Instagram",
    category: "media",
  },
  configSchema: instagramConfigSchema,
  defaultConfig: instagramConfigSchema.parse({}),
  component: {
    type: "client-only",
    load: () =>
      import("../../../../../_components/InstagramSection").then((m) => ({
        default: m.InstagramSection,
      })),
  },
};
