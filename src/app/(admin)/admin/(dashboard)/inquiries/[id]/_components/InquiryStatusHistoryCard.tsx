import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/admin/components/ui";
import { InquiryStatusBadge } from "@/admin/components/status-badges";
import { formatDateTimeShort } from "@/shared/lib/date-format";
import type { InquiryStatusHistoryItem } from "@/shared/domain/inquiries/types";
import type { Serialized } from "@/shared/lib/serialize";

type InquiryStatusHistoryCardProps = {
  history: Serialized<InquiryStatusHistoryItem>[];
};

/** システム/顧客起因 (changedById === null) の reason コードを日本語ラベルに変換する。 */
const SYSTEM_REASON_LABELS: Record<string, string> = {
  creation: "受付",
  "customer-reply-reopen": "顧客からの返信で再開",
};

function actorLabel(item: Serialized<InquiryStatusHistoryItem>): string {
  if (item.changedByName) return item.changedByName;
  const systemLabel = item.reason
    ? SYSTEM_REASON_LABELS[item.reason]
    : undefined;
  return systemLabel ?? "システム";
}

export function InquiryStatusHistoryCard({
  history,
}: InquiryStatusHistoryCardProps) {
  if (history.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>ステータス履歴</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {history.map((item) => (
            <li key={item.id} className="border-l-2 border-muted pl-3 text-sm">
              <div className="flex flex-wrap items-center gap-1.5">
                {item.fromStatus && (
                  <>
                    <InquiryStatusBadge status={item.fromStatus} />
                    <span className="text-muted-foreground">→</span>
                  </>
                )}
                <InquiryStatusBadge status={item.toStatus} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {actorLabel(item)} ・ {formatDateTimeShort(item.createdAt)}
              </p>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
