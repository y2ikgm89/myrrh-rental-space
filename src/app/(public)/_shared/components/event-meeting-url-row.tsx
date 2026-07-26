import type { ReactElement } from "react";
import { DetailRow } from "@/app/(public)/_shared/components/detail-row";

export interface EventMeetingUrlRowProps {
  readonly meetingUrl: string | null;
  readonly isConfirmed: boolean;
}

/**
 * オンライン / ハイブリッドイベントの参加 URL 行（guest + member 詳細ハブ共通）。
 */
export function EventMeetingUrlRow({
  meetingUrl,
  isConfirmed,
}: EventMeetingUrlRowProps): ReactElement {
  if (isConfirmed && meetingUrl) {
    return (
      <DetailRow label="参加 URL">
        <a
          href={meetingUrl}
          target="_blank"
          rel="noreferrer"
          className="break-all underline underline-offset-4 hover:text-foreground"
        >
          {meetingUrl}
        </a>
      </DetailRow>
    );
  }

  return <DetailRow label="参加 URL">参加確定後に表示されます</DetailRow>;
}
