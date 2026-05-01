import { z } from "zod";
import { field } from "../../field-registry";
import { createButtonsArraySchema } from "../_shared/buttons";

export const homepageCtaConfigSchema = z.object({
  label: field.text("ラベル", { default: "Reservation", subGroup: "text" }),
  title: field.text("見出し", {
    default: "あなたに最適な空間を",
    subGroup: "text",
  }),
  description: field.textarea("説明文", {
    default:
      "空き状況の確認から予約まで、オンラインで完結。まずは空間をご覧ください。",
    subGroup: "text",
  }),
  buttons: createButtonsArraySchema("ボタン"),
});

export type HomepageCtaConfig = z.infer<typeof homepageCtaConfigSchema>;
