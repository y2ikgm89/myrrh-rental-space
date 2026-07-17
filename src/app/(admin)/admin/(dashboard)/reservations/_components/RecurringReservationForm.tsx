"use client";

/**
 * 繰返し予約 (ReservationSeries) 作成フォーム (Phase B.2.1 Task 20)。
 *
 * 単発予約フォーム (ReservationForm.tsx) を mirror しつつ「繰返し設定」
 * (RecurrenceFields + RecurrencePreview) を追加した独立フォーム。
 *
 * 顧客は既存選択のみ (`allowNewCustomer={false}`)。series は同一顧客の複数 instance
 * を跨ぐため、新規顧客作成中に validation error で作業ロスするリスクを避け、
 * 既存顧客を先に確定させる運用に固定する。
 *
 * 保存: `createRecurringReservationAction` (server action) → `SubmissionResult`。
 * schema は `createRecurringReservationFormSchema({ maxRecurrenceInstances })` で
 * `Settings.maxRecurrenceInstances` を上限に注入 (server action 側と同型で client 側
 * gate、超過は保存前に UI で reject)。
 */

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { parseDateTimeLocalAsJst } from "@/shared/lib/date-format";
import { getFormProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { IconCalendar } from "@tabler/icons-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SubmitButton,
} from "@/admin/components/ui";
import { createRecurringReservationAction } from "@/admin/actions/reservation";
import { RESERVATION_SERIES_FREQ } from "@/shared/lib/validations/enums/prisma-types";
import { CustomerSelector } from "./CustomerSelector";
import { RecurrenceFields, type RecurrenceState } from "./RecurrenceFields";
import { RecurrencePreview } from "./RecurrencePreview";
import {
  type SpaceOption,
  type SelectedCustomer,
  TIME_OPTIONS,
} from "./reservation-form-helpers";
import { createRecurringReservationFormSchema } from "./reservation-form-schema";

type Props = {
  spaces: SpaceOption[];
  maxRecurrenceInstances: number;
};

const INITIAL_RECURRENCE: RecurrenceState = {
  freq: RESERVATION_SERIES_FREQ.WEEKLY,
  interval: 1,
  byday: [],
  endMode: "count",
  count: 4,
  until: "",
};

/**
 * 繰返し設定 fields のエラー集約表示。
 *
 * RecurrenceFields 内の input は controlled で aria-describedby を持たないため、
 * 個別の `<p id={errorId}>` 直下配線 (admin-field-error-association gate 対象) を
 * 避け、集約 alert 内の `<li id={errorId}>` として errorId を保持する。
 * screen reader は role="alert" で読み上げ、a11y と静的解析を両立する。
 */
function RecurrenceErrorSummary({
  entries,
}: {
  entries: ReadonlyArray<
    readonly [string, readonly string[] | undefined, string]
  >;
}) {
  const active = entries.filter(
    (e): e is readonly [string, readonly string[], string] =>
      Array.isArray(e[1]) && e[1].length > 0,
  );
  if (active.length === 0) return null;
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
    >
      <ul className="space-y-1">
        {active.map(([label, errs, id]) => (
          <li key={id} id={id}>
            {label}: {errs.join(", ")}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RecurringReservationForm({
  spaces,
  maxRecurrenceInstances,
}: Props) {
  const router = useRouter();
  const schema = createRecurringReservationFormSchema({
    maxRecurrenceInstances,
  });
  const [lastResult, action, isPending] = useActionState(
    createRecurringReservationAction,
    undefined,
  );

  const [form, fields] = useForm({
    id: "recurring-reservation-create",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  });

  const [selectedCustomer, setSelectedCustomer] =
    useState<SelectedCustomer | null>(null);
  const [spaceId, setSpaceId] = useState<string>("");
  const [date, setDate] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");
  const [recurrence, setRecurrence] =
    useState<RecurrenceState>(INITIAL_RECURRENCE);

  const dtstart =
    date && startTime ? parseDateTimeLocalAsJst(`${date}T${startTime}`) : null;
  const dtstartIsValid = dtstart !== null && !Number.isNaN(dtstart.getTime());

  return (
    <form {...getFormProps(form)} action={action} className="space-y-6">
      {/* hidden inputs: 全 form 値を server action に送信 */}
      <input
        type="hidden"
        name={fields.customerId.name}
        value={selectedCustomer?.id ?? ""}
      />
      <input type="hidden" name={fields.spaceId.name} value={spaceId} />
      <input type="hidden" name={fields.date.name} value={date} />
      <input type="hidden" name={fields.startTime.name} value={startTime} />
      <input type="hidden" name={fields.endTime.name} value={endTime} />
      <input type="hidden" name={fields.freq.name} value={recurrence.freq} />
      <input
        type="hidden"
        name={fields.interval.name}
        value={String(recurrence.interval)}
      />
      {recurrence.byday.map((d) => (
        <input key={d} type="hidden" name={fields.byday.name} value={d} />
      ))}
      <input
        type="hidden"
        name={fields.endMode.name}
        value={recurrence.endMode}
      />
      <input
        type="hidden"
        name={fields.count.name}
        value={String(recurrence.count)}
      />
      <input type="hidden" name={fields.until.name} value={recurrence.until} />

      {form.errors && form.errors.length > 0 && (
        <div
          className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          {form.errors.join(", ")}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>予約基本情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="spaceId">スペース *</Label>
              <Select
                value={spaceId}
                onValueChange={setSpaceId}
                disabled={isPending}
              >
                <SelectTrigger
                  id="spaceId"
                  aria-invalid={fields.spaceId.errors ? true : undefined}
                  aria-describedby={
                    fields.spaceId.errors ? fields.spaceId.errorId : undefined
                  }
                >
                  <SelectValue placeholder="スペースを選択してください" />
                </SelectTrigger>
                <SelectContent>
                  {spaces.map((space) => (
                    <SelectItem key={space.id} value={space.id}>
                      {space.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fields.spaceId.errors && (
                <p
                  id={fields.spaceId.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.spaceId.errors.join(", ")}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor={fields.date.id}>初回開催日 *</Label>
              <div className="relative">
                <Input
                  id={fields.date.id}
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  disabled={isPending}
                  className="pr-10"
                  aria-invalid={fields.date.errors ? true : undefined}
                  aria-describedby={
                    fields.date.errors ? fields.date.errorId : undefined
                  }
                />
                <IconCalendar
                  aria-hidden="true"
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                />
              </div>
              {fields.date.errors && (
                <p
                  id={fields.date.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.date.errors.join(", ")}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startTime">開始時間 *</Label>
                <Select
                  value={startTime}
                  onValueChange={setStartTime}
                  disabled={isPending}
                >
                  <SelectTrigger
                    id="startTime"
                    aria-invalid={fields.startTime.errors ? true : undefined}
                    aria-describedby={
                      fields.startTime.errors
                        ? fields.startTime.errorId
                        : undefined
                    }
                  >
                    <SelectValue placeholder="選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fields.startTime.errors && (
                  <p
                    id={fields.startTime.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.startTime.errors.join(", ")}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="endTime">終了時間 *</Label>
                <Select
                  value={endTime}
                  onValueChange={setEndTime}
                  disabled={isPending}
                >
                  <SelectTrigger
                    id="endTime"
                    aria-invalid={fields.endTime.errors ? true : undefined}
                    aria-describedby={
                      fields.endTime.errors ? fields.endTime.errorId : undefined
                    }
                  >
                    <SelectValue placeholder="選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_OPTIONS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fields.endTime.errors && (
                  <p
                    id={fields.endTime.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.endTime.errors.join(", ")}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>顧客情報 (既存顧客のみ)</CardTitle>
          </CardHeader>
          <CardContent>
            <CustomerSelector
              selectedCustomer={selectedCustomer}
              onSelectCustomer={setSelectedCustomer}
              onNewCustomerData={() => {
                /* 繰返し予約では新規顧客不可 (allowNewCustomer=false) */
              }}
              isNewCustomer={false}
              onToggleNewCustomer={() => {
                /* 切替不可 */
              }}
              allowNewCustomer={false}
              ariaDescribedBy={
                fields.customerId.errors ? fields.customerId.errorId : undefined
              }
            />
            {fields.customerId.errors && (
              <p
                id={fields.customerId.errorId}
                className="mt-2 text-sm text-destructive"
              >
                {fields.customerId.errors.join(", ")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>繰返し設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <RecurrenceFields value={recurrence} onChange={setRecurrence} />

          {dtstartIsValid && dtstart && (
            <RecurrencePreview state={recurrence} dtstart={dtstart} />
          )}

          <RecurrenceErrorSummary
            entries={[
              ["繰返し周期", fields.freq.errors, fields.freq.errorId],
              ["インターバル", fields.interval.errors, fields.interval.errorId],
              ["曜日", fields.byday.errors, fields.byday.errorId],
              ["回数", fields.count.errors, fields.count.errorId],
              ["終了日", fields.until.errors, fields.until.errorId],
            ]}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isPending}
        >
          キャンセル
        </Button>
        <SubmitButton
          isPending={isPending}
          label="繰返し予約を作成"
          pendingLabel="作成中..."
        />
      </div>
    </form>
  );
}
