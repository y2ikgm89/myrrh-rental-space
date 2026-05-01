import { z } from "zod";

import { field } from "../../field-registry";
import { sectionLayoutSchema } from "../_shared/layout";

const layouts = ["list", "calendar"] as const;

export const eventCalendarConfigSchema = z.object({
  maxEvents: field.number("最大表示件数", {
    min: 1,
    max: 50,
    default: 6,
    suffix: "件",
    group: "advanced",
  }),
  displayLayout: field.select("表示形式", {
    options: layouts,
    default: "list",
    group: "design",
    helpText: "イベントの表示形式",
  }),
  showPastEvents: field.boolean("過去のイベントも表示する", {
    default: false,
    group: "advanced",
  }),
  layout: sectionLayoutSchema,
});

export type EventCalendarConfig = z.infer<typeof eventCalendarConfigSchema>;
