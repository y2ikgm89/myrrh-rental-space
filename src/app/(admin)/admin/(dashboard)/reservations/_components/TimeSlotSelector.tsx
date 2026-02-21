"use client";

import {
  useState,
  useEffect,
  useTransition,
  useRef,
  type ReactElement,
} from "react";
import { tv } from "tailwind-variants";
import { getAvailableTimeSlots, type TimeSlot } from "@/shared/lib/reservation";
import { cn } from "@/shared/lib/utils";
import { Input } from "@/admin/components/ui/input";
import { Label } from "@/admin/components/ui/label";
import { logger } from "@/shared/lib/logger";
import { getErrorMessage } from "@/shared/lib/errors";
import { toDateString } from "@/shared/lib/serialize";

const timeSlotStyles = tv({
  slots: {
    container: "w-full space-y-4",
    dateSection: "space-y-2",
    slotSection: "space-y-2",
    header: "mb-2",
    title: "text-sm font-medium text-foreground",
    subtitle: "text-xs text-muted-foreground mt-1",
    grid: "grid grid-cols-4 sm:grid-cols-6 gap-2",
    slot: [
      "px-2 py-1.5 text-xs font-medium rounded-md border transition-all",
      "hover:border-primary hover:bg-primary/5",
      "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
    ],
    slotAvailable: "border-border bg-background text-foreground cursor-pointer",
    slotUnavailable:
      "border-muted bg-muted text-muted-foreground cursor-not-allowed opacity-50",
    slotSelected: "border-primary bg-primary text-primary-foreground",
    loading: "flex items-center justify-center py-6",
    spinner:
      "animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full",
    rangeIndicator: "mt-3 p-2 bg-muted rounded-md",
    rangeText: "text-xs text-muted-foreground",
    rangeValue: "font-medium text-foreground",
    emptyState: "text-center py-6 text-sm text-muted-foreground",
    errorText: "text-xs text-destructive mt-1",
  },
});

const styles = timeSlotStyles();

interface TimeSlotSelectorProps {
  spaceId: string | null;
  date: string;
  startTime: string;
  endTime: string;
  onDateChange: (date: string) => void;
  onStartTimeChange: (time: string) => void;
  onEndTimeChange: (time: string) => void;
  errors?: {
    date?: string[];
    startTime?: string[];
    endTime?: string[];
  };
}

export function TimeSlotSelector({
  spaceId,
  date,
  startTime,
  endTime,
  onDateChange,
  onStartTimeChange,
  onEndTimeChange,
  errors,
}: TimeSlotSelectorProps): ReactElement {
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [isPending, startTransition] = useTransition();
  const prevDateRef = useRef<string | null>(null);
  const prevSpaceIdRef = useRef<string | null>(null);

  // 日付またはスペースIDが変更されたら時間枠を取得
  useEffect(() => {
    // 必須パラメータがない場合
    if (!spaceId || !date) {
      prevDateRef.current = null;
      prevSpaceIdRef.current = null;
      return;
    }

    // 同じ日付・スペースIDなら再取得しない
    if (prevDateRef.current === date && prevSpaceIdRef.current === spaceId) {
      return;
    }

    prevDateRef.current = date;
    prevSpaceIdRef.current = spaceId;

    // レース条件防止: 古いリクエストの結果を無視
    let isCurrent = true;

    startTransition(async () => {
      try {
        const availableSlots = await getAvailableTimeSlots(spaceId, date);
        if (isCurrent) {
          setSlots(availableSlots);
        }
      } catch (error) {
        if (isCurrent) {
          logger.error("Failed to fetch time slots", {
            error: getErrorMessage(error),
          });
          setSlots([]);
        }
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [spaceId, date]);

  // 選択状態を派生状態として計算
  const isSelecting: "start" | "end" = startTime && !endTime ? "end" : "start";

  // 日付の最小値（今日）を計算
  const today = toDateString(new Date());

  const handleSlotClick = (time: string, available: boolean): void => {
    if (!available) return;

    if (isSelecting === "start") {
      onStartTimeChange(time);
      onEndTimeChange(""); // 終了時間をリセット
    } else {
      // 開始時間より後の時間のみ選択可能
      if (startTime && time > startTime) {
        // 終了時間は次の時間枠（例: 10:00 を選んだら 11:00 まで）
        const hourStr = time.split(":")[0] ?? "0";
        const endHour = parseInt(hourStr, 10) + 1;
        const endTimeStr = `${endHour.toString().padStart(2, "0")}:00`;
        onEndTimeChange(endTimeStr);
      }
    }
  };

  const isSlotInRange = (time: string): boolean => {
    if (!startTime || !endTime) return false;
    return time >= startTime && time < endTime;
  };

  const calculateDuration = (): number | null => {
    if (!startTime || !endTime) return null;
    const startHour = Number(startTime.split(":")[0] ?? "0");
    const endHour = Number(endTime.split(":")[0] ?? "0");
    return endHour - startHour;
  };

  const duration = calculateDuration();

  return (
    <div className={styles.container()}>
      {/* 日付選択 */}
      <div className={styles.dateSection()}>
        <Label htmlFor="reservation-date">日付</Label>
        <Input
          id="reservation-date"
          type="date"
          value={date}
          min={today}
          onChange={(e) => {
            onDateChange(e.target.value);
            // 日付変更時に時間選択をリセット
            onStartTimeChange("");
            onEndTimeChange("");
          }}
          aria-describedby={errors?.date ? "date-error" : undefined}
          aria-invalid={!!errors?.date}
        />
        {errors?.date && (
          <p id="date-error" className={styles.errorText()}>
            {errors.date[0] ?? ""}
          </p>
        )}
      </div>

      {/* 時間枠選択 */}
      {!spaceId ? (
        <div className={styles.slotSection()}>
          <div className={styles.header()}>
            <h3 className={styles.title()}>時間を選択</h3>
          </div>
          <div className={styles.emptyState()}>
            <p>まずスペースを選択してください</p>
          </div>
        </div>
      ) : !date ? (
        <div className={styles.slotSection()}>
          <div className={styles.header()}>
            <h3 className={styles.title()}>時間を選択</h3>
          </div>
          <div className={styles.emptyState()}>
            <p>まず日付を選択してください</p>
          </div>
        </div>
      ) : isPending ? (
        <div className={styles.slotSection()}>
          <div className={styles.header()}>
            <h3 className={styles.title()}>時間を選択</h3>
          </div>
          <div className={styles.loading()}>
            <div className={styles.spinner()} />
          </div>
        </div>
      ) : (
        <div className={styles.slotSection()}>
          <div className={styles.header()}>
            <h3 className={styles.title()}>時間を選択</h3>
            <p className={styles.subtitle()}>
              {isSelecting === "start"
                ? "開始時間を選択してください"
                : "終了時間を選択してください（利用したい最後の時間枠をクリック）"}
            </p>
          </div>

          <div className={styles.grid()}>
            {slots.map((slot) => {
              const isSelected =
                slot.time === startTime || isSlotInRange(slot.time);
              const isStartSlot = slot.time === startTime;
              const canSelectAsEnd =
                isSelecting === "end" &&
                startTime &&
                slot.time > startTime &&
                slot.available;

              return (
                <button
                  key={slot.time}
                  type="button"
                  onClick={() => handleSlotClick(slot.time, slot.available)}
                  disabled={!slot.available && !canSelectAsEnd}
                  className={cn(
                    styles.slot(),
                    slot.available
                      ? styles.slotAvailable()
                      : styles.slotUnavailable(),
                    isSelected && styles.slotSelected(),
                    isStartSlot && "ring-2 ring-primary ring-offset-1",
                  )}
                  aria-label={`${slot.time}${slot.available ? "" : "（予約済み）"}`}
                  aria-pressed={isSelected}
                >
                  {slot.time}
                </button>
              );
            })}
          </div>

          {errors?.startTime && (
            <p className={styles.errorText()}>{errors.startTime[0] ?? ""}</p>
          )}
          {errors?.endTime && (
            <p className={styles.errorText()}>{errors.endTime[0] ?? ""}</p>
          )}

          {startTime && endTime && duration && (
            <div className={styles.rangeIndicator()}>
              <p className={styles.rangeText()}>
                選択された時間帯:{" "}
                <span className={styles.rangeValue()}>
                  {startTime} 〜 {endTime}（{duration}時間）
                </span>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
