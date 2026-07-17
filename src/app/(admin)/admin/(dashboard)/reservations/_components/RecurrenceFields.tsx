"use client";

/**
 * `<RecurrenceFields>` — 繰返し予約 (ReservationSeries) の入力欄
 * (Phase B.2 task 19).
 *
 * ReservationForm 内で「繰返しにする」toggle が ON のときに render される。
 * state 管理は呼出側の `useState` (controlled) で行い、本 component は
 * pure な rendering + onChange 通知に徹する。
 *
 * `series-rrule.ts` (server) の `RRULE_ALLOWED_KEYS` (FREQ/INTERVAL/BYDAY/COUNT/UNTIL)
 * にちょうど対応する 4 系統の入力を提供する。`INTERVAL` は常に出力するため
 * UI にも常に表示する (UX 上は `1` 固定でも構わないが、拡張性のため露出)。
 */

import type { ChangeEvent } from "react";
import {
  Input,
  Label,
  Checkbox,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import {
  RESERVATION_SERIES_FREQ,
  type ReservationSeriesFreqValue,
} from "@/shared/lib/validations/enums/prisma-types";
import { WEEKDAYS, type Weekday } from "./rrule-utils";

/** 繰返し入力の内部 state (RRULE builder input と 1:1 対応)。 */
export interface RecurrenceState {
  freq: ReservationSeriesFreqValue;
  interval: number;
  byday: readonly Weekday[];
  /** COUNT / UNTIL の排他選択 (RFC 5545 契約: 両方指定は非推奨)。 */
  endMode: "count" | "until";
  count: number;
  /** ISO 日付 (`YYYY-MM-DD`)。`endMode: "until"` 時のみ意味を持つ。 */
  until: string;
}

interface Props {
  value: RecurrenceState;
  onChange: (next: RecurrenceState) => void;
}

const FREQ_LABELS: Record<ReservationSeriesFreqValue, string> = {
  DAILY: "毎日",
  WEEKLY: "毎週",
  MONTHLY: "毎月",
};

const WEEKDAY_LABELS: Record<Weekday, string> = {
  MO: "月",
  TU: "火",
  WE: "水",
  TH: "木",
  FR: "金",
  SA: "土",
  SU: "日",
};

export function RecurrenceFields({
  value,
  onChange,
}: Props): React.JSX.Element {
  const setFreq = (freq: ReservationSeriesFreqValue) => {
    // freq を DAILY / MONTHLY に切り替えたら byday を空にする (WEEKLY 以外は意味なし)
    onChange({
      ...value,
      freq,
      byday: freq === "WEEKLY" ? value.byday : [],
    });
  };

  const setInterval = (event: ChangeEvent<HTMLInputElement>) => {
    const parsed = Number.parseInt(event.currentTarget.value, 10);
    onChange({
      ...value,
      interval: Number.isFinite(parsed) && parsed > 0 ? parsed : 1,
    });
  };

  const toggleByday = (day: Weekday) => {
    const isSelected = value.byday.includes(day);
    const nextByday = isSelected
      ? value.byday.filter((d) => d !== day)
      : [...value.byday, day];
    onChange({ ...value, byday: nextByday });
  };

  const setEndMode = (mode: "count" | "until") => {
    onChange({ ...value, endMode: mode });
  };

  const setCount = (event: ChangeEvent<HTMLInputElement>) => {
    const parsed = Number.parseInt(event.currentTarget.value, 10);
    onChange({
      ...value,
      count: Number.isFinite(parsed) && parsed > 0 ? parsed : 1,
    });
  };

  const setUntil = (event: ChangeEvent<HTMLInputElement>) => {
    onChange({ ...value, until: event.currentTarget.value });
  };

  return (
    <div className="space-y-4 border border-border rounded-md p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="recurrence-freq">繰返し周期</Label>
          <Select value={value.freq} onValueChange={setFreq}>
            <SelectTrigger id="recurrence-freq">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(
                Object.keys(
                  RESERVATION_SERIES_FREQ,
                ) as ReservationSeriesFreqValue[]
              ).map((f) => (
                <SelectItem key={f} value={f}>
                  {FREQ_LABELS[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="recurrence-interval">
            インターバル (`
            {value.freq === "DAILY"
              ? "日"
              : value.freq === "WEEKLY"
                ? "週"
                : "月"}
            ごと`)
          </Label>
          <Input
            id="recurrence-interval"
            type="number"
            min={1}
            value={value.interval}
            onChange={setInterval}
          />
        </div>
      </div>

      {value.freq === "WEEKLY" && (
        <div>
          <Label>曜日 (BYDAY)</Label>
          <div className="flex flex-wrap gap-3">
            {WEEKDAYS.map((day) => {
              const inputId = `recurrence-byday-${day.toLowerCase()}`;
              return (
                <label
                  key={day}
                  htmlFor={inputId}
                  className="flex items-center gap-1.5 cursor-pointer"
                >
                  <Checkbox
                    id={inputId}
                    checked={value.byday.includes(day)}
                    onCheckedChange={() => toggleByday(day)}
                  />
                  <span>{WEEKDAY_LABELS[day]}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>終了条件</Label>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              id="recurrence-endmode-count"
              type="radio"
              name="recurrence-endmode"
              value="count"
              checked={value.endMode === "count"}
              onChange={() => setEndMode("count")}
            />
            <span>回数</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              id="recurrence-endmode-until"
              type="radio"
              name="recurrence-endmode"
              value="until"
              checked={value.endMode === "until"}
              onChange={() => setEndMode("until")}
            />
            <span>終了日</span>
          </label>
        </div>

        {value.endMode === "count" ? (
          <div>
            <Label htmlFor="recurrence-count">回数</Label>
            <Input
              id="recurrence-count"
              type="number"
              min={1}
              value={value.count}
              onChange={setCount}
            />
          </div>
        ) : (
          <div>
            <Label htmlFor="recurrence-until">終了日</Label>
            <Input
              id="recurrence-until"
              type="date"
              value={value.until}
              onChange={setUntil}
            />
          </div>
        )}
      </div>
    </div>
  );
}
