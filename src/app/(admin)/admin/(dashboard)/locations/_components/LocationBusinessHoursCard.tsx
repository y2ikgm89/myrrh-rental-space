"use client";

import { IconPlus, IconX } from "@tabler/icons-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Switch,
} from "@/admin/components/ui";
import { cn } from "@/shared/lib/cn";
import {
  TIME_REGEX,
  hasOverlappingSlots,
} from "@/shared/lib/validations/business-hours";
import type {
  BusinessHours,
  BusinessHoursDay,
  BusinessTimeSlot,
  WeekdayKey,
} from "@/shared/lib/json-validators";

const DAYS_OF_WEEK: ReadonlyArray<{ key: WeekdayKey; label: string }> = [
  { key: "monday", label: "月曜日" },
  { key: "tuesday", label: "火曜日" },
  { key: "wednesday", label: "水曜日" },
  { key: "thursday", label: "木曜日" },
  { key: "friday", label: "金曜日" },
  { key: "saturday", label: "土曜日" },
  { key: "sunday", label: "日曜日" },
];

const DEFAULT_SLOT: BusinessTimeSlot = {
  openTime: "09:00",
  closeTime: "18:00",
};

function defaultDay(isOpen: boolean): BusinessHoursDay {
  return isOpen
    ? { isOpen: true, slots: [{ openTime: "09:00", closeTime: "21:00" }] }
    : { isOpen: false, slots: [] };
}

/** 新規ロケーション作成時 / 未設定ロケーションで「設定する」を押した際の初期値。組織全体の既定と揃える。 */
export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  monday: defaultDay(true),
  tuesday: defaultDay(true),
  wednesday: defaultDay(true),
  thursday: defaultDay(true),
  friday: defaultDay(true),
  saturday: defaultDay(true),
  sunday: defaultDay(false),
};

function setDay(
  hours: BusinessHours,
  day: WeekdayKey,
  next: BusinessHoursDay,
): BusinessHours {
  return { ...hours, [day]: next };
}

type LocationBusinessHoursCardProps = {
  businessHours: BusinessHours | null;
  onBusinessHoursChange: (next: BusinessHours) => void;
  specialHolidays: readonly string[];
  onSpecialHolidaysChange: (next: readonly string[]) => void;
  disabled?: boolean;
};

export function LocationBusinessHoursCard({
  businessHours,
  onBusinessHoursChange,
  specialHolidays,
  onSpecialHolidaysChange,
  disabled = false,
}: LocationBusinessHoursCardProps) {
  const handleIsOpenChange = (day: WeekdayKey, isOpen: boolean) => {
    if (!businessHours) return;
    const current = businessHours[day];
    const slots =
      isOpen && current.slots.length === 0 ? [DEFAULT_SLOT] : current.slots;
    onBusinessHoursChange(setDay(businessHours, day, { isOpen, slots }));
  };

  const handleSlotChange = (
    day: WeekdayKey,
    slotIndex: number,
    field: keyof BusinessTimeSlot,
    value: string,
  ) => {
    if (!businessHours) return;
    const current = businessHours[day];
    const slots = current.slots.map((slot, i) =>
      i === slotIndex ? { ...slot, [field]: value } : slot,
    );
    onBusinessHoursChange(setDay(businessHours, day, { ...current, slots }));
  };

  const handleAddSlot = (day: WeekdayKey) => {
    if (!businessHours) return;
    const current = businessHours[day];
    const lastSlot = current.slots[current.slots.length - 1];
    const newSlot: BusinessTimeSlot = lastSlot
      ? { openTime: lastSlot.closeTime, closeTime: "21:00" }
      : DEFAULT_SLOT;
    onBusinessHoursChange(
      setDay(businessHours, day, {
        ...current,
        slots: [...current.slots, newSlot],
      }),
    );
  };

  const handleRemoveSlot = (day: WeekdayKey, slotIndex: number) => {
    if (!businessHours) return;
    const current = businessHours[day];
    onBusinessHoursChange(
      setDay(businessHours, day, {
        ...current,
        slots: current.slots.filter((_, i) => i !== slotIndex),
      }),
    );
  };

  const handleAddHoliday = () => {
    onSpecialHolidaysChange([...specialHolidays, ""]);
  };

  const handleHolidayChange = (index: number, value: string) => {
    onSpecialHolidaysChange(
      specialHolidays.map((date, i) => (i === index ? value : date)),
    );
  };

  const handleRemoveHoliday = (index: number) => {
    onSpecialHolidaysChange(specialHolidays.filter((_, i) => i !== index));
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>営業時間</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            この拠点の曜日別営業時間です。Google Business
            Profile（GBP）同期・MEO スコア・LocalBusiness
            構造化データ・サイト上の表示に反映されます。
            <span className="mt-2 block">
              予約可能な時間帯（予約スロット）は、拠点ごとの営業時間ではなく
              「設定 → 営業時間」で設定したサイト全体の営業時間が使われます。
            </span>
          </p>
          {businessHours === null ? (
            <div className="rounded-lg border border-dashed p-4 text-center">
              <p className="text-sm text-muted-foreground">
                営業時間が未設定です。設定するまで GBP
                同期・構造化データには反映されません。
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => onBusinessHoursChange(DEFAULT_BUSINESS_HOURS)}
                disabled={disabled}
              >
                営業時間を設定
              </Button>
            </div>
          ) : (
            DAYS_OF_WEEK.map(({ key, label }) => {
              const hours = businessHours;
              const day = hours[key];
              const overlap = day.isOpen && hasOverlappingSlots(day.slots);
              return (
                <div key={key} className="rounded-lg border p-3">
                  <div className="flex items-center gap-4">
                    <div className="w-20">
                      <span className="font-medium">{label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={day.isOpen}
                        onCheckedChange={(checked) =>
                          handleIsOpenChange(key, checked)
                        }
                        disabled={disabled}
                        aria-label={`${label}: ${day.isOpen ? "営業" : "休業"}`}
                      />
                      <span
                        className="text-sm text-muted-foreground"
                        aria-hidden="true"
                      >
                        {day.isOpen ? "営業" : "休業"}
                      </span>
                    </div>
                  </div>

                  {day.isOpen && (
                    <div className="mt-3 space-y-2 pl-24">
                      {overlap && (
                        <p className="text-sm text-destructive">
                          時間帯が重複しています
                        </p>
                      )}
                      {day.slots.map((slot, slotIndex) => {
                        const openInvalid = !TIME_REGEX.test(slot.openTime);
                        const closeInvalid = !TIME_REGEX.test(slot.closeTime);
                        const orderInvalid =
                          !openInvalid &&
                          !closeInvalid &&
                          slot.closeTime <= slot.openTime;
                        return (
                          // eslint-disable-next-line @eslint-react/no-array-index-key
                          <div key={slotIndex} className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <Input
                                type="time"
                                value={slot.openTime}
                                onChange={(e) =>
                                  handleSlotChange(
                                    key,
                                    slotIndex,
                                    "openTime",
                                    e.target.value,
                                  )
                                }
                                className={cn(
                                  "w-32",
                                  openInvalid && "border-destructive",
                                )}
                                disabled={disabled}
                                aria-label={`${label} 時間帯${slotIndex + 1} 開始`}
                              />
                              <span aria-hidden="true">〜</span>
                              <Input
                                type="time"
                                value={slot.closeTime}
                                onChange={(e) =>
                                  handleSlotChange(
                                    key,
                                    slotIndex,
                                    "closeTime",
                                    e.target.value,
                                  )
                                }
                                className={cn(
                                  "w-32",
                                  (closeInvalid || orderInvalid) &&
                                    "border-destructive",
                                )}
                                disabled={disabled}
                                aria-label={`${label} 時間帯${slotIndex + 1} 終了`}
                              />
                              {day.slots.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    handleRemoveSlot(key, slotIndex)
                                  }
                                  disabled={disabled}
                                  className="h-8 w-8"
                                  aria-label={`${label} 時間帯${slotIndex + 1}を削除`}
                                >
                                  <IconX className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                            {orderInvalid && (
                              <p className="pl-1 text-xs text-destructive">
                                終了は開始より後にしてください
                              </p>
                            )}
                          </div>
                        );
                      })}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddSlot(key)}
                        disabled={disabled}
                      >
                        <IconPlus className="mr-1 h-4 w-4" />
                        時間帯を追加
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>特別休業日</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            年末年始等、通常の営業曜日設定とは別に休業する日を個別に登録します。
          </p>
          <div className="space-y-2">
            {specialHolidays.map((date, index) => (
              // eslint-disable-next-line @eslint-react/no-array-index-key
              <div key={index} className="flex items-center gap-2">
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => handleHolidayChange(index, e.target.value)}
                  className="w-48"
                  disabled={disabled}
                  aria-label={`特別休業日${index + 1}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveHoliday(index)}
                  disabled={disabled}
                  className="h-8 w-8"
                  aria-label={`特別休業日${index + 1}を削除`}
                >
                  <IconX className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddHoliday}
            disabled={disabled}
          >
            <IconPlus className="mr-1 h-4 w-4" />
            休業日を追加
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
