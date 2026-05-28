"use client";

import { useState, useTransition } from "react";
import type { Serialized } from "@/shared/lib/serialize";
import { IconPlus, IconX, IconCopy } from "@tabler/icons-react";
import { cn } from "@/shared/lib/cn";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  SubmitButton,
  Switch,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import { updateBusinessHoursSettings } from "@/admin/actions/settings";
import type {
  SettingsData,
  BusinessHours,
  BusinessTimeSlot,
} from "@/admin/actions/settings";
import {
  MONTHLY_CLOSURE_WEEK_VALUES,
  WEEKDAY_VALUES,
  type MonthlyClosure,
  type MonthlyClosureWeek,
  type WeekdayKey,
} from "@/shared/lib/json-validators";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  DEFAULT_BUSINESS_HOURS,
  DEFAULT_SLOT,
  TEMPLATES,
  isTemplateKey,
  type TemplateKey,
} from "./business-hours-defaults";
import {
  TIME_REGEX,
  hasOverlappingSlots,
  type SlotError,
} from "./business-hours-validation";

interface BusinessHoursSectionProps {
  settings: Serialized<SettingsData>;
}

interface DayOfWeek {
  key: WeekdayKey;
  label: string;
}

const DAYS_OF_WEEK: readonly DayOfWeek[] = [
  { key: "monday", label: "月曜日" },
  { key: "tuesday", label: "火曜日" },
  { key: "wednesday", label: "水曜日" },
  { key: "thursday", label: "木曜日" },
  { key: "friday", label: "金曜日" },
  { key: "saturday", label: "土曜日" },
  { key: "sunday", label: "日曜日" },
];

const MONTHLY_CLOSURE_WEEK_LABELS: Record<MonthlyClosureWeek, string> = {
  first: "第1",
  second: "第2",
  third: "第3",
  fourth: "第4",
  last: "最終",
};

const WEEKDAY_SHORT_LABELS: Record<MonthlyClosure["weekday"], string> = {
  sunday: "日曜",
  monday: "月曜",
  tuesday: "火曜",
  wednesday: "水曜",
  thursday: "木曜",
  friday: "金曜",
  saturday: "土曜",
};

function formatMonthlyClosure(closure: MonthlyClosure): string {
  return `${MONTHLY_CLOSURE_WEEK_LABELS[closure.week]} ${WEEKDAY_SHORT_LABELS[closure.weekday]}`;
}

export function BusinessHoursSection({ settings }: BusinessHoursSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const initialBusinessHours = settings.businessHours ?? DEFAULT_BUSINESS_HOURS;
  const initialRegularHolidays = settings.regularHolidays ?? [];
  const initialSpecialHolidays: string[] = [];

  /**
   * 定休日設定を営業時間に反映
   */
  const businessHoursWithHolidays = (() => {
    const hours = { ...initialBusinessHours };
    const isBusinessHoursDay = (d: string): d is WeekdayKey =>
      (WEEKDAY_VALUES as readonly string[]).includes(d);
    for (const day of initialRegularHolidays) {
      if (isBusinessHoursDay(day)) {
        hours[day] = {
          ...hours[day],
          isOpen: false,
        };
      }
    }
    return hours;
  })();

  const [businessHours, setBusinessHours] = useState<BusinessHours>(
    businessHoursWithHolidays,
  );
  const [specialHolidays, setSpecialHolidays] = useState<string[]>(
    initialSpecialHolidays,
  );
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [holidayNotice, setHolidayNotice] = useState(
    settings.holidayNotice || "",
  );
  const [selectedTemplate, setSelectedTemplate] =
    useState<TemplateKey>("custom");
  const [slotErrors, setSlotErrors] = useState<SlotError[]>([]);

  // 毎月の繰り返し定休（第N曜日）
  const [monthlyClosures, setMonthlyClosures] = useState<MonthlyClosure[]>(
    initialBusinessHours.monthlyClosures ?? [],
  );
  const [newClosureWeek, setNewClosureWeek] =
    useState<MonthlyClosureWeek>("third");
  const [newClosureWeekday, setNewClosureWeekday] =
    useState<MonthlyClosure["weekday"]>("monday");

  const handleAddMonthlyClosure = () => {
    const exists = monthlyClosures.some(
      (c) => c.week === newClosureWeek && c.weekday === newClosureWeekday,
    );
    if (exists) {
      toast.error("同じ繰り返し定休が既に登録されています");
      return;
    }
    setMonthlyClosures((prev) => [
      ...prev,
      { week: newClosureWeek, weekday: newClosureWeekday },
    ]);
  };

  const handleRemoveMonthlyClosure = (index: number) => {
    setMonthlyClosures((prev) => prev.filter((_, i) => i !== index));
  };

  // 特定のスロットのエラーを取得
  const getSlotError = (
    day: WeekdayKey,
    slotIndex: number,
    field: "openTime" | "closeTime" | "overlap",
  ) => {
    return slotErrors.find(
      (e) => e.day === day && e.slotIndex === slotIndex && e.field === field,
    );
  };

  // エラー検証
  const validateSlots = (hours: BusinessHours): SlotError[] => {
    const errors: SlotError[] = [];
    for (const { key } of DAYS_OF_WEEK) {
      const day = hours[key];
      if (!day.isOpen) continue;

      for (let i = 0; i < day.slots.length; i++) {
        const slot = day.slots[i];
        if (!slot) continue;
        if (!TIME_REGEX.test(slot.openTime)) {
          errors.push({
            day: key,
            slotIndex: i,
            field: "openTime",
            message: "不正な時刻形式",
          });
        }
        if (!TIME_REGEX.test(slot.closeTime)) {
          errors.push({
            day: key,
            slotIndex: i,
            field: "closeTime",
            message: "不正な時刻形式",
          });
        }
        if (
          slot.openTime &&
          slot.closeTime &&
          slot.closeTime <= slot.openTime
        ) {
          errors.push({
            day: key,
            slotIndex: i,
            field: "closeTime",
            message: "終了は開始より後",
          });
        }
      }
      if (day.slots.length > 1 && hasOverlappingSlots(day.slots)) {
        errors.push({
          day: key,
          slotIndex: 0,
          field: "overlap",
          message: "時間帯が重複",
        });
      }
    }
    return errors;
  };

  // 営業/休業の切り替え
  const handleIsOpenChange = (day: WeekdayKey, isOpen: boolean) => {
    setBusinessHours((prev) => {
      const currentSlots = prev[day].slots;
      const slots =
        isOpen && currentSlots.length === 0
          ? [{ ...DEFAULT_SLOT }]
          : currentSlots;
      const updated = { ...prev, [day]: { isOpen, slots } };
      setSlotErrors(validateSlots(updated));
      return updated;
    });
  };

  // 時間帯の更新（即時検証付き）
  const handleSlotChange = (
    day: WeekdayKey,
    slotIndex: number,
    field: keyof BusinessTimeSlot,
    value: string,
  ) => {
    setBusinessHours((prev) => {
      const updated = {
        ...prev,
        [day]: {
          ...prev[day],
          slots: prev[day].slots.map((slot, i) =>
            i === slotIndex ? { ...slot, [field]: value } : slot,
          ),
        },
      };
      setSlotErrors(validateSlots(updated));
      return updated;
    });
  };

  // 時間帯を追加
  const handleAddSlot = (day: WeekdayKey) => {
    setBusinessHours((prev) => {
      const daySlots = prev[day].slots;
      const lastSlot = daySlots[daySlots.length - 1];
      const newSlot: BusinessTimeSlot = lastSlot
        ? { openTime: lastSlot.closeTime, closeTime: "21:00" }
        : { ...DEFAULT_SLOT };
      const updated = {
        ...prev,
        [day]: {
          ...prev[day],
          slots: [...prev[day].slots, newSlot],
        },
      };
      setSlotErrors(validateSlots(updated));
      return updated;
    });
  };

  // 時間帯を削除
  const handleRemoveSlot = (day: WeekdayKey, slotIndex: number) => {
    setBusinessHours((prev) => {
      const updated = {
        ...prev,
        [day]: {
          ...prev[day],
          slots: prev[day].slots.filter((_, i) => i !== slotIndex),
        },
      };
      setSlotErrors(validateSlots(updated));
      return updated;
    });
  };

  // テンプレートを全曜日に適用
  const applyTemplateToAll = () => {
    if (selectedTemplate === "custom") return;
    const template = TEMPLATES[selectedTemplate];
    setBusinessHours((prev) => {
      const updated = { ...prev };
      for (const { key } of DAYS_OF_WEEK) {
        if (key === "sunday") {
          updated[key] = { isOpen: false, slots: [] };
        } else {
          updated[key] = {
            isOpen: true,
            slots: template.slots.map((s) => ({ ...s })),
          };
        }
      }
      return updated;
    });
  };

  // ある曜日の設定を全曜日にコピー
  const copyToAllDays = (sourceDay: WeekdayKey) => {
    const source = businessHours[sourceDay];
    setBusinessHours((prev) => {
      const updated = { ...prev };
      for (const { key } of DAYS_OF_WEEK) {
        updated[key] = {
          isOpen: source.isOpen,
          slots: source.slots.map((s) => ({ ...s })),
        };
      }
      return updated;
    });
  };

  const handleAddHoliday = () => {
    if (!newHolidayDate) return;
    if (specialHolidays.includes(newHolidayDate)) {
      setNewHolidayDate("");
      return;
    }
    const updated = [...specialHolidays, newHolidayDate].sort();
    setSpecialHolidays(updated);
    setNewHolidayDate("");
  };

  const handleRemoveHoliday = (dateToRemove: string) => {
    setSpecialHolidays((prev) => prev.filter((date) => date !== dateToRemove));
  };

  const handleSave = () => {
    // 保存前に最終バリデーション
    const errors = validateSlots(businessHours);
    setSlotErrors(errors);
    if (errors.length > 0) {
      toast.error("入力エラーがあります。時間帯を確認してください。");
      return;
    }

    startTransition(async () => {
      const regularHolidays = DAYS_OF_WEEK.filter(
        ({ key }) => !businessHours[key].isOpen,
      ).map(({ key }) => key);

      const result = await updateBusinessHoursSettings({
        businessHours: {
          ...businessHours,
          monthlyClosures: monthlyClosures.length > 0 ? monthlyClosures : [],
        },
        regularHolidays: regularHolidays.length > 0 ? regularHolidays : null,
        specialHolidays: specialHolidays.length > 0 ? specialHolidays : null,
        holidayNotice: holidayNotice || null,
      });

      if (isMutationError(result)) {
        toast.error(result.error);
      } else {
        toast.success("営業時間設定を保存しました");
        router.refresh();
      }
    });
  };

  // エラーがあるか
  const hasErrors = slotErrors.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>営業日・時間設定</CardTitle>
        <CardDescription>
          曜日ごとの営業時間と定休日を設定します
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 一括設定テンプレート */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium">一括設定</h3>
          <div className="flex items-center gap-3">
            <Select
              value={selectedTemplate}
              onValueChange={(v) => {
                if (isTemplateKey(v)) setSelectedTemplate(v);
              }}
              disabled={isPending}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TEMPLATES).map(([key, template]) => (
                  <SelectItem key={key} value={key}>
                    {template.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              onClick={applyTemplateToAll}
              disabled={isPending || selectedTemplate === "custom"}
            >
              全曜日に適用
            </Button>
          </div>
          {selectedTemplate !== "custom" && (
            <p className="text-xs text-muted-foreground">
              {TEMPLATES[selectedTemplate].description}（日曜は休業）
            </p>
          )}
        </div>

        {/* 曜日ごとの営業時間 */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium">曜日別営業時間</h3>
          <div className="space-y-3">
            {DAYS_OF_WEEK.map(({ key, label }) => (
              <div key={key} className="rounded-lg border p-3">
                <div className="flex items-center gap-4">
                  <div className="w-20">
                    <span className="font-medium">{label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={businessHours[key].isOpen}
                      onCheckedChange={(checked) =>
                        handleIsOpenChange(key, checked)
                      }
                      disabled={isPending}
                    />
                    <span className="text-sm text-muted-foreground">
                      {businessHours[key].isOpen ? "営業" : "休業"}
                    </span>
                  </div>
                  {businessHours[key].isOpen && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToAllDays(key)}
                      disabled={isPending}
                      title="この設定を全曜日にコピー"
                    >
                      <IconCopy className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {/* 時間帯リスト */}
                {businessHours[key].isOpen && (
                  <div className="mt-3 space-y-2 pl-24">
                    {/* 重複エラー表示 */}
                    {getSlotError(key, 0, "overlap") && (
                      <p className="text-sm text-destructive">
                        時間帯が重複しています
                      </p>
                    )}
                    {businessHours[key].slots.map((slot, slotIndex) => {
                      const openError = getSlotError(
                        key,
                        slotIndex,
                        "openTime",
                      );
                      const closeError = getSlotError(
                        key,
                        slotIndex,
                        "closeTime",
                      );
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
                                openError && "border-destructive",
                              )}
                              disabled={isPending}
                            />
                            <span>〜</span>
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
                                closeError && "border-destructive",
                              )}
                              disabled={isPending}
                            />
                            {businessHours[key].slots.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveSlot(key, slotIndex)}
                                disabled={isPending}
                                className="h-8 w-8"
                              >
                                <IconX className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          {closeError && (
                            <p className="text-xs text-destructive pl-1">
                              {closeError.message}
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
                      disabled={isPending}
                    >
                      <IconPlus className="mr-1 h-4 w-4" />
                      時間帯を追加
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 毎月の定休（第N曜日） */}
        <div className="space-y-3">
          <Label>毎月の定休（第N曜日）</Label>
          <p className="text-sm text-muted-foreground">
            「毎月第3月曜」のような繰り返し定休を設定します。該当日は予約を受け付けません。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={newClosureWeek}
              onValueChange={(v) => {
                if (
                  (MONTHLY_CLOSURE_WEEK_VALUES as readonly string[]).includes(v)
                ) {
                  setNewClosureWeek(v as MonthlyClosureWeek);
                }
              }}
              disabled={isPending}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHLY_CLOSURE_WEEK_VALUES.map((week) => (
                  <SelectItem key={week} value={week}>
                    {MONTHLY_CLOSURE_WEEK_LABELS[week]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={newClosureWeekday}
              onValueChange={(v) => {
                const found = DAYS_OF_WEEK.find((d) => d.key === v);
                if (found) setNewClosureWeekday(found.key);
              }}
              disabled={isPending}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS_OF_WEEK.map((day) => (
                  <SelectItem key={day.key} value={day.key}>
                    {day.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddMonthlyClosure}
              disabled={isPending}
            >
              <IconPlus className="mr-1 h-4 w-4" />
              追加
            </Button>
          </div>
          {monthlyClosures.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {monthlyClosures.map((closure, index) => (
                <li
                  key={`${closure.week}-${closure.weekday}`}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 py-1 pl-3 pr-1 text-sm"
                >
                  <span>{formatMonthlyClosure(closure)}</span>
                  <Button
                    type="button"
                    variant="destructive-ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={`${formatMonthlyClosure(closure)}の定休を削除`}
                    disabled={isPending}
                    onClick={() => handleRemoveMonthlyClosure(index)}
                  >
                    <IconX className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 特別休業日 */}
        <div className="space-y-3">
          <Label>特別休業日</Label>
          <div className="flex gap-2">
            <Input
              type="date"
              value={newHolidayDate}
              onChange={(e) => setNewHolidayDate(e.target.value)}
              disabled={isPending}
              className="w-48"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleAddHoliday}
              disabled={isPending || !newHolidayDate}
            >
              <IconPlus className="h-4 w-4" />
            </Button>
          </div>
          {specialHolidays.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {specialHolidays.map((date) => (
                <div
                  key={date}
                  className="flex items-center gap-1 rounded-md border bg-muted px-2 py-1 text-sm"
                >
                  <span>{date}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveHoliday(date)}
                    disabled={isPending}
                    className="ml-1 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
                  >
                    <IconX className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            年末年始・お盆・祝日などを登録できます。
          </p>
        </div>

        {/* 休業日のお知らせ */}
        <div className="space-y-2">
          <Label htmlFor="holidayNotice">休業日のお知らせ</Label>
          <Textarea
            id="holidayNotice"
            value={holidayNotice}
            onChange={(e) => setHolidayNotice(e.target.value)}
            placeholder="年末年始（12/31〜1/3）は休業いたします。"
            rows={3}
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">
            ホームページに表示するお知らせ文を入力できます。
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <SubmitButton
            isPending={isPending}
            onClick={handleSave}
            label="営業時間設定を保存"
            disabled={hasErrors}
          />
        </div>
      </CardContent>
    </Card>
  );
}
