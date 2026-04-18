import {
  IconBrandGoogle,
  IconBrandWindows,
  IconCalendarPlus,
} from "@tabler/icons-react";
import type { AddToCalendarUrls } from "@/shared/lib/ical";
import { cn } from "@/shared/lib/cn";

type Variant = "public" | "authenticated";

type Props = {
  readonly urls: AddToCalendarUrls;
  readonly label?: string;
  /**
   * public: Google / Outlook Web のみ（未認証向け、ICS ダウンロード URL は未使用可）
   * authenticated: 3 プロバイダすべて（マイページ・メール経由）
   */
  readonly variant?: Variant;
  readonly className?: string;
};

/**
 * Add to Calendar 3 択ボタン（Server Component、JS 不要）
 *
 * - Google Calendar: template URL で新規タブ
 * - Outlook Web: deeplink URL で新規タブ
 * - iCal (.ics): `authenticated` variant のみ — route handler URL からダウンロード
 */
export function AddToCalendar({
  urls,
  label = "カレンダーに追加",
  variant = "authenticated",
  className,
}: Props) {
  const showIcs = variant === "authenticated";

  return (
    <section
      aria-labelledby="add-to-calendar-label"
      className={cn("space-y-3", className)}
    >
      <p
        id="add-to-calendar-label"
        className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground"
      >
        {label}
      </p>
      <ul role="list" className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <li>
          <a
            href={urls.google}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm text-foreground shadow-sm transition hover:bg-accent/5 hover:underline hover:underline-offset-4"
          >
            <IconBrandGoogle className="h-4 w-4" aria-hidden="true" />
            <span>Google Calendar</span>
          </a>
        </li>
        <li>
          <a
            href={urls.outlookWeb}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm text-foreground shadow-sm transition hover:bg-accent/5 hover:underline hover:underline-offset-4"
          >
            <IconBrandWindows className="h-4 w-4" aria-hidden="true" />
            <span>Outlook</span>
          </a>
        </li>
        {showIcs && (
          <li>
            <a
              href={urls.ics}
              download
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm text-foreground shadow-sm transition hover:bg-accent/5 hover:underline hover:underline-offset-4"
            >
              <IconCalendarPlus className="h-4 w-4" aria-hidden="true" />
              <span>iCal / Apple (.ics)</span>
            </a>
          </li>
        )}
      </ul>
    </section>
  );
}
