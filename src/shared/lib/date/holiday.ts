import "server-only";
import * as holidayJp from "@holiday-jp/holiday_jp";
import { parseJstDateOnly } from "@/shared/lib/date-format";

export function isJapaneseHoliday(jstDateOnly: string): boolean {
  const date = parseJstDateOnly(jstDateOnly);
  // Return false for malformed input (NaN Date)
  if (Number.isNaN(date.getTime())) return false;
  // Pass string to isHoliday, not Date: library's Date reformat uses local-tz
  // getters, causing silent off-by-one on negative UTC offset runtimes.
  // String form bypasses this by direct key lookup.
  return holidayJp.isHoliday(jstDateOnly);
}
