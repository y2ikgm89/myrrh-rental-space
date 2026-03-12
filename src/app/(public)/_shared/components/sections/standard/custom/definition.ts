import { z } from "zod";
import type { SectionDefinition } from "@/shared/lib/sections/types";
import {
  maxWidthValues,
  paddingValues,
} from "@/shared/lib/validations/section-options";

export const customConfigSchema = z.object({
  sectionLabel: z
    .string()
    .max(50, { error: "ラベルは50文字以内です" })
    .default("Contents")
    .meta({ description: "セクションラベル", fieldType: "text" }),
  maxWidth: z
    .enum(maxWidthValues)
    .default("lg")
    .meta({ description: "最大幅", fieldType: "select" }),
  containerClass: z
    .string()
    .max(200)
    .optional()
    .meta({ description: "コンテナCSSクラス", fieldType: "text" }),
  backgroundColor: z
    .string()
    .max(50)
    .optional()
    .meta({ description: "背景色", fieldType: "text" }),
  padding: z
    .enum(paddingValues)
    .default("md")
    .meta({ description: "パディング", fieldType: "select" }),
});

export type CustomConfig = z.output<typeof customConfigSchema>;

export const customDefinition: SectionDefinition<typeof customConfigSchema> = {
  id: "custom",
  meta: {
    label: "カスタム",
    description: "Lexicalエディタで自由にコンテンツを作成できます。",
    icon: "FileText",
    category: "content",
  },
  configSchema: customConfigSchema,
  defaultConfig: customConfigSchema.parse({}),
  component: {
    type: "server",
    load: () =>
      import("../../../../../_components/CustomSection").then((m) => ({
        default: m.CustomSection,
      })),
  },
};
