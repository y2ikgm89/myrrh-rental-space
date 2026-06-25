import { z } from "zod";

import { field } from "../../field-registry";
import { sectionLayoutSchema } from "../_shared/layout";
import { sectionHeaderFields } from "../_shared/section-header";

const layouts = ["list", "calendar", "calendar-list-toggle"] as const;

export const eventCalendarConfigSchema = z.object({
  ...sectionHeaderFields({ sectionLabelDefault: "Events" }),
  description: field.portableTextBlock("説明文", { subGroup: "text" }),
  maxEvents: field.number("最大表示件数", {
    min: 1,
    max: 50,
    default: 50,
    suffix: "件",
    group: "advanced",
  }),
  displayLayout: field.select("表示形式", {
    options: layouts,
    default: "calendar-list-toggle",
    group: "design",
    helpText:
      "list: 一覧のみ / calendar: カレンダーのみ / calendar-list-toggle: タブ切替",
  }),
  showPastEvents: field.boolean("過去のイベントも表示する", {
    default: false,
    group: "advanced",
  }),
  layout: sectionLayoutSchema,
});

export type EventCalendarConfig = z.infer<typeof eventCalendarConfigSchema>;
