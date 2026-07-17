"use client";

/**
 * `<SeriesInfoSection>` — 予約詳細ページで series 情報 + 3 択キャンセルを提示する
 * (Phase B.2 task 23).
 *
 * Google Calendar 業界標準の 3 スコープ:
 *   - この予約のみ (this-only)
 *   - この予約と以降 (this-and-following)
 *   - すべて (series-all)
 *
 * `cancelReservationSeriesAction` (Task 21) に scope 選択と共に submit する。
 * 各 scope は個別 `<form>` にして 3 択 button 群として一覧化する。
 * FormData には seriesId / fromInstanceId / scope を hidden で埋め込む。
 */

import { useActionState, type ReactElement } from "react";
import { useFormStatus } from "react-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  SubmitButton,
} from "@/admin/components/ui";
import { formatJstDateString } from "@/shared/lib/date-format";
import { cancelReservationSeriesAction } from "@/admin/actions/reservation";

interface Props {
  reservationId: string;
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
}

export function SeriesInfoSection({
  reservationId,
  series,
}: Props): ReactElement {
  const cancelDate = series.cancelledAt ?? series.deletedAt;
  const isSeriesCancelled = cancelDate !== null;
  const cancelledMessage = cancelDate
    ? `この series は既にキャンセル済み (${formatJstDateString(cancelDate)})`
    : "この series は既にキャンセル済み";

  return (
    <Card>
      <CardHeader>
        <CardTitle>定期予約情報</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">series ID</dt>
            <dd className="font-mono text-xs">{series.id}</dd>
          </div>
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
          <div>
            <dt className="text-muted-foreground">繰返しルール</dt>
            <dd className="font-mono text-xs">{series.rrule}</dd>
          </div>
        </dl>

        {isSeriesCancelled ? (
          <p className="text-sm text-muted-foreground">{cancelledMessage}</p>
        ) : (
          <div className="flex flex-wrap gap-2 pt-2">
            <CancelForm
              seriesId={series.id}
              fromInstanceId={reservationId}
              scope="this-only"
              label="この予約のみキャンセル"
            />
            <CancelForm
              seriesId={series.id}
              fromInstanceId={reservationId}
              scope="this-and-following"
              label="この予約以降を全てキャンセル"
            />
            <CancelForm
              seriesId={series.id}
              scope="series-all"
              label="定期予約すべてをキャンセル"
              variant="destructive"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// CancelForm (per-scope)
// ---------------------------------------------------------------------------

interface CancelFormProps {
  seriesId: string;
  fromInstanceId?: string;
  scope: "this-only" | "this-and-following" | "series-all";
  label: string;
  variant?: "default" | "destructive" | "outline";
}

function CancelForm({
  seriesId,
  fromInstanceId,
  scope,
  label,
  variant = "outline",
}: CancelFormProps): ReactElement {
  const [_state, formAction] = useActionState(
    cancelReservationSeriesAction,
    undefined,
  );
  return (
    <form action={formAction}>
      <input type="hidden" name="seriesId" value={seriesId} />
      <input type="hidden" name="scope" value={scope} />
      {fromInstanceId !== undefined && (
        <input type="hidden" name="fromInstanceId" value={fromInstanceId} />
      )}
      <CancelSubmitButton label={label} variant={variant} />
    </form>
  );
}

function CancelSubmitButton({
  label,
  variant,
}: {
  label: string;
  variant: "default" | "destructive" | "outline";
}): ReactElement {
  const { pending } = useFormStatus();
  return (
    <SubmitButton
      isPending={pending}
      label={label}
      pendingLabel="処理中..."
      size="sm"
      variant={variant}
    />
  );
}
