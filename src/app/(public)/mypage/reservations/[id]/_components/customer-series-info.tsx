/**
 * `<CustomerSeriesInfo>` — 顧客マイページで定期予約 (ReservationSeries) の情報を
 * 表示する read-only section (Phase B.2 task 26).
 *
 * spec §goal 9 に従い、`Settings.customerCanCancelSeriesInFull` が false のときは
 * 「定期予約すべてキャンセル」ボタンを表示せず、admin への問い合わせ導線のみを
 * 案内する。true のときはボタンを表示するが、customer-side の series cancel
 * server action は本 phase では未実装 (goal 9 の gate 部分のみ配線、実行部は
 * 将来 phase)。
 */

import type { ReactElement } from "react";
import { formatJstDateString } from "@/shared/lib/date-format";

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
}

export function CustomerSeriesInfo({
  series,
  customerCanCancelSeriesInFull,
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
              ? "定期予約すべてをまとめてキャンセルしたい場合は、管理者までお問い合わせください。"
              : "定期予約すべてをまとめてキャンセルしたい場合は、管理者までお問い合わせください。"}
          </p>
          {/*
            Phase B.2 goal 9 gate: customerCanCancelSeriesInFull=true のときは
            将来 phase で「定期予約すべてキャンセル」ボタンを追加する。
            現状は問い合わせ導線のみで、goal 9 の Settings 制御・UI 表示・server
            action の 3 点セットのうち Settings + 表示 gate は本 PR で確定させる。
          */}
        </>
      )}
    </section>
  );
}
