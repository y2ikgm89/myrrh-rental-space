import { z } from "zod";

import { field } from "../../field-helpers";

const layouts = ["list", "calendar"] as const;

export const eventCalendarConfigSchema = z.object({
  maxEvents: field.number("最大表示件数", { min: 1, max: 50, default: 6 }),
  layout: field.select("表示形式", {
    options: layouts,
    default: "list",
  }),
  showPastEvents: field.boolean("過去のイベントを表示", { default: false }),
});

export type EventCalendarConfig = z.infer<typeof eventCalendarConfigSchema>;
