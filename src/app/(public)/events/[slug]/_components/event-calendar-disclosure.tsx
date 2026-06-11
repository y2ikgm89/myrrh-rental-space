import type { ReactElement } from "react";
import {
  IconBrandGoogle,
  IconCalendarPlus,
  IconChevronDown,
} from "@tabler/icons-react";
import type { AddToCalendarUrls } from "@/shared/lib/ical/urls";
import { OutlookLogo } from "@/public/components/ui/icons/outlook-logo";

interface EventCalendarDisclosureProps {
  readonly urls: AddToCalendarUrls;
}

/**
 * EventCalendarDisclosure — 申込前でもカレンダー追加できる「気になる」導線
 *
 * Eventbrite / Peatix / Lu.ma 業界標準: 詳細ページの主導線は「申込」、カレンダー
 * 追加は補助的にフッター付近で `<details>` 折りたたみとして提供する。予約意思の
 * 弱いユーザー（リマインダー目的）にも対応しつつ、主 CTA を阻害しない。
 *
 * ICS ダウンロードは未認証顧客には未対応のため Google / Outlook Web の 2 択。
 */
export function EventCalendarDisclosure({
  urls,
}: EventCalendarDisclosureProps): ReactElement {
  return (
    <details className="group mt-12 border-y border-border py-6">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
        <IconCalendarPlus className="h-4 w-4" aria-hidden="true" />
        <span>カレンダーに追加する</span>
        <span className="ml-1 text-xs text-muted-foreground/70">
          （予約しなくても追加できます）
        </span>
        <IconChevronDown
          className="ml-auto h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <ul
        role="list"
        className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap"
      >
        <li>
          <a
            href={urls.google}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm text-foreground shadow-sm transition hover:bg-accent/5 hover:underline hover:underline-offset-4"
          >
            <IconBrandGoogle className="h-4 w-4" aria-hidden="true" />
            <span>Google Calendar</span>
          </a>
        </li>
        <li>
          <a
            href={urls.outlookWeb}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm text-foreground shadow-sm transition hover:bg-accent/5 hover:underline hover:underline-offset-4"
          >
            <OutlookLogo className="h-4 w-4" aria-hidden="true" />
            <span>Outlook</span>
          </a>
        </li>
      </ul>
    </details>
  );
}
