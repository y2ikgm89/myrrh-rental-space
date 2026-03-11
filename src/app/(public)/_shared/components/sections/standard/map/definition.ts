import { z } from "zod";
import type { SectionDefinition } from "@/shared/lib/sections/types";
import {
  mapHeightValues,
  borderRadiusValues,
} from "@/shared/lib/validations/section-options";

export const mapConfigSchema = z.object({
  sectionLabel: z
    .string()
    .max(50, { error: "ラベルは50文字以内です" })
    .default("Location")
    .meta({ description: "セクションラベル", fieldType: "text" }),
  title: z
    .string()
    .max(100, { error: "タイトルは100文字以内です" })
    .optional()
    .meta({ description: "タイトル", fieldType: "text" }),
  address: z
    .string()
    .max(300)
    .optional()
    .meta({ description: "住所", fieldType: "text" }),
  latitude: z
    .number()
    .min(-90)
    .max(90)
    .optional()
    .meta({ description: "緯度" }),
  longitude: z
    .number()
    .min(-180)
    .max(180)
    .optional()
    .meta({ description: "経度" }),
  zoom: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(15)
    .meta({ description: "ズームレベル（1〜20）" }),
  height: z
    .enum(mapHeightValues)
    .default("md")
    .meta({ description: "高さ", fieldType: "select" }),
  showAddressBelow: z
    .boolean()
    .default(true)
    .meta({ description: "住所を地図の下に表示する" }),
  borderRadius: z
    .enum(borderRadiusValues)
    .default("sm")
    .meta({ description: "角丸", fieldType: "select" }),
});

export type MapConfig = z.output<typeof mapConfigSchema>;

export const mapDefinition: SectionDefinition<typeof mapConfigSchema> = {
  id: "map",
  meta: {
    label: "地図",
    description: "Google Mapsで位置情報を表示します。",
    icon: "MapPin",
    category: "media",
  },
  configSchema: mapConfigSchema,
  defaultConfig: mapConfigSchema.parse({}),
  component: {
    type: "client",
    load: () =>
      // @ts-expect-error -- migration: component uses typed props; will adopt SectionComponentProps<TConfig> in Task 13
      import("../../../../../_components/MapSection").then((m) => ({
        default: m.MapSection,
      })),
  },
};
