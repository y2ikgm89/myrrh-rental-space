import { IconBrandGoogle, IconCalendarPlus } from "@tabler/icons-react";
import type { AddToCalendarUrls } from "@/shared/lib/ical/urls";
import { OutlookLogo } from "./icons/outlook-logo";
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
        className="text-eyebrow uppercase text-muted-foreground"
      >
        {label}
      </p>
      <ul role="list" className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {/* mobile: <li> 自体を w-full にして anchor を full-width のタップ標的化。
            横の dead space をタップしても反応するため誤タップが減少 (WCAG 2.5.5)。
            sm+ で intrinsic 幅に戻し、横並びで wrap させる。 */}
        <li className="w-full sm:w-auto">
          <a
            href={urls.google}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm text-foreground shadow-sm transition hover:bg-accent/5 hover:underline hover:underline-offset-4 sm:inline-flex sm:w-auto sm:justify-start"
          >
            <IconBrandGoogle className="h-4 w-4" aria-hidden="true" />
            <span>Google Calendar</span>
          </a>
        </li>
        <li className="w-full sm:w-auto">
          <a
            href={urls.outlookWeb}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm text-foreground shadow-sm transition hover:bg-accent/5 hover:underline hover:underline-offset-4 sm:inline-flex sm:w-auto sm:justify-start"
          >
            <OutlookLogo className="h-4 w-4" aria-hidden="true" />
            <span>Outlook</span>
          </a>
        </li>
        {showIcs && (
          <li className="w-full sm:w-auto">
            <a
              href={urls.ics}
              download
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm text-foreground shadow-sm transition hover:bg-accent/5 hover:underline hover:underline-offset-4 sm:inline-flex sm:w-auto sm:justify-start"
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
