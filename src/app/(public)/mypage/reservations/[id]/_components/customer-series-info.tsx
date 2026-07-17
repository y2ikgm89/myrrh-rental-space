/**
 * `<CustomerSeriesInfo>` — 顧客マイページで定期予約 (ReservationSeries) の情報を
 * 表示する section (Phase B.2 task 26 + Phase B.2.1 Task 4).
 *
 * spec §goal 9: `Settings.customerCanCancelSeriesInFull=true` のとき、顧客が
 * 自ら「定期予約すべてキャンセル」を実行できる (`CustomerSeriesCancelButton`)。
 * false のときは admin への問い合わせ導線のみを案内する。
 */

import type { ReactElement } from "react";
import { formatJstDateString } from "@/shared/lib/date-format";
import { CustomerSeriesCancelButton } from "./customer-series-cancel-button";

interface Props {
  series: {
    id: string;
    rrule: string;
    dtstart: Date;
    duration: number;
    instanceCount: number;
    cancelledAt: Date | null;
    deletedAt: Date | null;
    recurrenceInstanceIndex: number;
  };
  customerCanCancelSeriesInFull: boolean;
  turnstileSiteKey: string | null;
}

export function CustomerSeriesInfo({
  series,
  customerCanCancelSeriesInFull,
  turnstileSiteKey,
}: Props): ReactElement {
  const cancelDate = series.cancelledAt ?? series.deletedAt;
  const isSeriesCancelled = cancelDate !== null;
  const cancelledMessage = cancelDate
    ? `この定期予約は既にキャンセル済です (${formatJstDateString(cancelDate)})`
    : "この定期予約は既にキャンセル済です";

  return (
    <section
      aria-labelledby="customer-series-info-heading"
      className="rounded-lg border border-border p-4 space-y-3"
    >
      <h2 id="customer-series-info-heading" className="text-base font-semibold">
        定期予約情報
      </h2>
      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">この予約の位置</dt>
          <dd>
            {series.recurrenceInstanceIndex + 1} 回目 / 全{" "}
            {series.instanceCount} 回
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">開始日</dt>
          <dd>{formatJstDateString(series.dtstart)}</dd>
        </div>
      </dl>

      {isSeriesCancelled ? (
        <p className="text-sm text-muted-foreground">{cancelledMessage}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            この予約は {series.instanceCount} 回の定期予約の一部です。
            {customerCanCancelSeriesInFull
              ? "定期予約すべてをまとめてキャンセルできます。"
              : "定期予約すべてをまとめてキャンセルしたい場合は、管理者までお問い合わせください。"}
          </p>
          {customerCanCancelSeriesInFull && (
            <div className="flex justify-end">
              <CustomerSeriesCancelButton
                seriesId={series.id}
                turnstileSiteKey={turnstileSiteKey}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}
