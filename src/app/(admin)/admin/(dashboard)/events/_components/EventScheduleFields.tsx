"use client";

import type { ReactElement } from "react";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  ToggleGroup,
  ToggleGroupItem,
} from "@/admin/components/ui";
import { EventScheduleMode } from "@/shared/lib/validations/enums/prisma-types";
import {
  getEventScheduleModeLabel,
  type EventScheduleModeValue,
} from "@/shared/domain/events/schedule-mode";

/** フォームで扱うスロット 1 件（datetime-local 文字列形式）。JSON hidden input で transit。 */
export type SlotFormItem = {
  /** React key 用。hidden input で送信する永続データからは除外する。 */
  clientKey: string;
  /** 既存スロットの更新時に指定。新規スロットは undefined。 */
  id?: string;
  /** datetime-local 形式 "YYYY-MM-DDTHH:mm" */
  startAt: string;
  /** datetime-local 形式 "YYYY-MM-DDTHH:mm" */
  endAt: string;
  capacity: number;
};

type Props = {
  scheduleMode: EventScheduleModeValue;
  onScheduleModeChange: (mode: EventScheduleModeValue) => void;
  slots: SlotFormItem[];
  onChange: (slots: SlotFormItem[]) => void;
  /** conform から渡される開催方式エラー */
  scheduleModeErrors?: readonly string[] | undefined;
  /** conform から渡されるスロット全体エラー */
  errors?: readonly string[] | undefined;
  isPending: boolean;
};

const EVENT_SCHEDULE_MODE_VALUES = [
  EventScheduleMode.SINGLE_OCCURRENCE,
  EventScheduleMode.TIMED_ENTRY,
] as const;

let nextClientSlotKey = 0;

export function createSlotClientKey(): string {
  nextClientSlotKey += 1;
  return `client-slot-${String(nextClientSlotKey)}`;
}

function isEventScheduleModeValue(
  value: string,
): value is EventScheduleModeValue {
  return EVENT_SCHEDULE_MODE_VALUES.some((mode) => mode === value);
}

function emptySlot(): SlotFormItem {
  return {
    clientKey: createSlotClientKey(),
    startAt: "",
    endAt: "",
    capacity: 1,
  };
}

export function EventScheduleFields({
  scheduleMode,
  onScheduleModeChange,
  slots,
  onChange,
  scheduleModeErrors,
  errors,
  isPending,
}: Props): ReactElement {
  const addSlot = () => onChange([...slots, emptySlot()]);
  const removeSlot = (i: number) =>
    onChange(slots.filter((_, idx) => idx !== i));
  const updateSlot = (i: number, patch: Partial<SlotFormItem>) =>
    onChange(slots.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const isTimedEntry = scheduleMode === EventScheduleMode.TIMED_ENTRY;
  const displayedSlots =
    scheduleMode === EventScheduleMode.SINGLE_OCCURRENCE
      ? [slots[0] ?? emptySlot()]
      : slots;

  const handleScheduleModeChange = (value: string) => {
    if (!isEventScheduleModeValue(value)) return;

    onScheduleModeChange(value);
    if (value === EventScheduleMode.SINGLE_OCCURRENCE) {
      onChange([slots[0] ?? emptySlot()]);
      return;
    }

    if (slots.length < 2) {
      onChange([slots[0] ?? emptySlot(), emptySlot()]);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isTimedEntry ? "タイムスロット" : "開催日時・定員"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label id="event-schedule-mode-label">開催方式</Label>
          <ToggleGroup
            type="single"
            value={scheduleMode}
            onValueChange={handleScheduleModeChange}
            disabled={isPending}
            aria-labelledby="event-schedule-mode-label"
            className="flex-wrap"
          >
            <ToggleGroupItem value={EventScheduleMode.SINGLE_OCCURRENCE}>
              {getEventScheduleModeLabel(EventScheduleMode.SINGLE_OCCURRENCE)}
            </ToggleGroupItem>
            <ToggleGroupItem value={EventScheduleMode.TIMED_ENTRY}>
              {getEventScheduleModeLabel(EventScheduleMode.TIMED_ENTRY)}
            </ToggleGroupItem>
          </ToggleGroup>
          {scheduleModeErrors && scheduleModeErrors.length > 0 && (
            <p className="text-sm text-destructive">
              {scheduleModeErrors.join(", ")}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {isTimedEntry
              ? "公開申込では参加日時を選択します。各枠ごとに定員を管理します。"
              : "公開申込では日時選択を表示せず、この開催日時で受け付けます。"}
          </p>
        </div>

        {errors && errors.length > 0 && (
          <p className="text-sm text-destructive">{errors.join(", ")}</p>
        )}

        {displayedSlots.map((slot, i) => (
          <div
            key={slot.id ?? slot.clientKey}
            className="rounded-md border p-3 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {isTimedEntry ? `スロット ${String(i + 1)}` : "開催枠"}
              </span>
              {isTimedEntry && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeSlot(i)}
                  disabled={isPending || slots.length <= 2}
                  aria-label={`スロット ${String(i + 1)} を削除`}
                >
                  <IconTrash className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor={`slot-${String(i)}-start`}>開始日時</Label>
                <Input
                  id={`slot-${String(i)}-start`}
                  type="datetime-local"
                  value={slot.startAt}
                  onChange={(e) => updateSlot(i, { startAt: e.target.value })}
                  disabled={isPending}
                />
              </div>
              <div>
                <Label htmlFor={`slot-${String(i)}-end`}>終了日時</Label>
                <Input
                  id={`slot-${String(i)}-end`}
                  type="datetime-local"
                  value={slot.endAt}
                  onChange={(e) => updateSlot(i, { endAt: e.target.value })}
                  disabled={isPending}
                />
              </div>
            </div>

            <div>
              <Label htmlFor={`slot-${String(i)}-cap`}>定員</Label>
              <Input
                id={`slot-${String(i)}-cap`}
                type="number"
                min={1}
                value={slot.capacity}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  updateSlot(i, {
                    capacity: Number.isFinite(n) && n >= 1 ? n : 1,
                  });
                }}
                disabled={isPending}
              />
            </div>
          </div>
        ))}

        {isTimedEntry && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addSlot}
            disabled={isPending}
          >
            <IconPlus className="mr-2 h-4 w-4" />
            スロットを追加
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
