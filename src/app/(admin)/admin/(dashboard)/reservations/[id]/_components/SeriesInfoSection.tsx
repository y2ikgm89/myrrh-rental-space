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
import { getFormProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  SubmitButton,
} from "@/admin/components/ui";
import { formatJstDateString } from "@/shared/lib/date-format";
import { cancelReservationSeriesAction } from "@/admin/actions/reservation";
import { cancelReservationSeriesSchema } from "@/shared/lib/validations/reservation-series";
import { dispatchWithoutFormReset } from "@/shared/lib/forms/conform-submit";

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
  canMutate?: boolean;
}

export function SeriesInfoSection({
  reservationId,
  series,
  canMutate = true,
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
        ) : canMutate ? (
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
        ) : (
          <p className="text-sm text-muted-foreground">
            閲覧専用のため、定期予約のキャンセルは実行できません。
          </p>
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
  const [lastResult, formAction, isPending] = useActionState(
    cancelReservationSeriesAction,
    undefined,
  );

  // `cancelReservationSeriesAction` は `executeConformMutation` を通すので
  // 拒否は `SubmissionResult` として返る。以前はその結果を `_state` で捨てており、
  // **キャンセルが失敗しても画面に何も出なかった**（権限拒否・在庫整合エラー・
  // 楽観ロック競合がすべて無言）。conform に渡して初めて描画できる。
  const [form, fields] = useForm({
    // 同じページに scope 違いの 3 フォームが並ぶので id を分ける
    id: `cancel-series-${scope}`,
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: cancelReservationSeriesSchema });
    },
    // React 19 の form auto-reset がサーバーの form-level エラーを消すのを防ぐ
    // （理由と `action` prop を残す必要性は helper の JSDoc）。
    onSubmit: dispatchWithoutFormReset(formAction),
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  });

  // 入力は hidden のみなので、form-level と field-level を分けて出す意味がない。
  // `superRefine` が返す `fromInstanceId` の欠落も同じ場所にまとめて見せる。
  const errorMessages = Object.values(form.allErrors).flat();

  return (
    <form {...getFormProps(form)} action={formAction} className="space-y-2">
      <input type="hidden" name={fields.seriesId.name} value={seriesId} />
      <input type="hidden" name={fields.scope.name} value={scope} />
      {fromInstanceId !== undefined && (
        <input
          type="hidden"
          name={fields.fromInstanceId.name}
          value={fromInstanceId}
        />
      )}
      <SubmitButton
        isPending={isPending}
        label={label}
        pendingLabel="処理中..."
        size="sm"
        variant={variant}
      />
      {errorMessages.length > 0 && (
        <p
          id={form.errorId}
          role="alert"
          className="max-w-64 text-xs text-destructive"
        >
          {errorMessages.join(" / ")}
        </p>
      )}
    </form>
  );
}
