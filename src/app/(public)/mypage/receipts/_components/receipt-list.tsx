/**
 * 領収書一覧表示 (STATE-02)。
 *
 * Server Component (static 表示のみ)。DL リンクは `/api/receipts/[serialNo]/pdf`
 * (Better Auth session 経由の ownership 検証) への通常 `<a>` (page-transition 用の
 * `<Link>` は API route には使わない — event-registration-list.tsx / reservation-detail.tsx
 * と同型のパターン)。
 */

import type { ReactElement } from "react";
import { Badge } from "@/public/components/design-system/badge";
import { Stack } from "@/public/components/design-system/stack";
import { formatPrice } from "@/shared/lib/pricing/format";
import { formatSerializedDate } from "@/shared/lib/serialize";
import type { CustomerReceiptListItem } from "@/shared/domain/receipts/queries";

interface ReceiptListProps {
  readonly items: readonly CustomerReceiptListItem[];
}

export function ReceiptList({ items }: ReceiptListProps): ReactElement {
  return (
    <Stack gap="md">
      {items.map((item) => (
        <ReceiptCard key={item.id} item={item} />
      ))}
    </Stack>
  );
}

function ReceiptCard({
  item,
}: {
  readonly item: CustomerReceiptListItem;
}): ReactElement {
  const sourceLabel = item.source.type === "reservation" ? "予約" : "イベント";
  const sourceDisplayName =
    item.source.type === "reservation"
      ? item.source.spaceName
      : item.source.eventTitle;

  return (
    <article
      aria-label={`領収書 ${item.serialNo}`}
      className="border border-border p-4 sm:p-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums text-sm text-muted-foreground">
              {item.serialNo}
            </span>
            <Badge
              variant={item.source.type === "reservation" ? "info" : "success"}
              className="shrink-0"
            >
              {sourceLabel}
            </Badge>
            {item.source.isDeleted && (
              // STATE-02: Reservation.deletedAt / Event.deletedAt な source。
              // 領収書自体は append-only で有効。顧客が困惑しないよう明示ラベル。
              <Badge variant="warning" className="shrink-0">
                削除済み
              </Badge>
            )}
          </div>
          {/* min-w-0 break-words + overflow-wrap:anywhere で長 space/event 名の
              container 破りを防ぐ (reservation-detail の DetailRow と同型)。 */}
          <p className="mt-2 min-w-0 break-words text-base text-foreground [overflow-wrap:anywhere]">
            {sourceDisplayName}
          </p>
          <dl className="mt-2 space-y-0.5 text-sm text-muted-foreground">
            <div>
              <dt className="inline">発行日: </dt>
              <dd className="inline">{formatSerializedDate(item.issuedAt)}</dd>
            </div>
            {item.source.type === "reservation" && (
              <div>
                <dt className="inline">利用日: </dt>
                <dd className="inline">
                  {formatSerializedDate(item.source.startTime)}
                </dd>
              </div>
            )}
          </dl>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          <span className="text-lg font-medium text-foreground tabular-nums">
            {formatPrice(item.amount)}
          </span>
          <a
            href={`/api/receipts/${item.serialNo}/pdf`}
            download={`receipt-${item.serialNo}.pdf`}
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
          >
            ダウンロード
          </a>
        </div>
      </div>
    </article>
  );
}
