import { z } from "zod";
import type { SectionDefinition } from "@/shared/lib/sections/types";
import { ctaVariantValues } from "@/shared/lib/validations/section-options";
import {
  createSafeUrlSchema,
  createCtaButtonItemSchema,
} from "@/shared/lib/validations/section-design";

const safeUrlSchema = createSafeUrlSchema(500);
const ctaButtonItemSchema = createCtaButtonItemSchema(safeUrlSchema);

export const ctaConfigSchema = z.object({
  sectionLabel: z
    .string()
    .max(50, { error: "ラベルは50文字以内です" })
    .default("Ready to Begin?")
    .meta({ description: "セクションラベル", fieldType: "text" }),
  title: z
    .string()
    .min(1, { error: "タイトルは必須です" })
    .max(100, { error: "タイトルは100文字以内です" })
    .meta({ description: "タイトル", fieldType: "text" }),
  description: z
    .string()
    .max(500, { error: "説明は500文字以内です" })
    .optional()
    .meta({ description: "説明文", fieldType: "textarea" }),
  buttons: z
    .array(ctaButtonItemSchema)
    .optional()
    .meta({ description: "CTAボタン", fieldType: "array" }),
  backgroundColor: z
    .string()
    .max(50)
    .optional()
    .meta({ description: "背景色", fieldType: "text" }),
  variant: z
    .enum(ctaVariantValues)
    .default("default")
    .meta({ description: "バリエーション", fieldType: "select" }),
});

export type CTAConfig = z.output<typeof ctaConfigSchema>;

export const ctaDefinition: SectionDefinition<typeof ctaConfigSchema> = {
  id: "cta",
  meta: {
    label: "CTA（行動喚起）",
    description:
      "行動喚起セクション。予約やお問い合わせへの導線を配置します。",
    icon: "MousePointerClick",
    category: "interactive",
  },
  configSchema: ctaConfigSchema,
  defaultConfig: ctaConfigSchema.parse({ title: "ご予約はこちら" }),
  component: {
    type: "server",
    load: () =>
      // @ts-expect-error -- migration: component uses typed props; will adopt SectionComponentProps<TConfig> in Task 13
      import("../../../../../_components/CTASection").then((m) => ({
        default: m.CTASection,
      })),
  },
};
