import "server-only";
import * as holidayJp from "@holiday-jp/holiday_jp";
import { parseJstDateOnly } from "@/shared/lib/date-format";

export function isJapaneseHoliday(jstDateOnly: string): boolean {
  const date = parseJstDateOnly(jstDateOnly);
  return holidayJp.isHoliday(date);
}
