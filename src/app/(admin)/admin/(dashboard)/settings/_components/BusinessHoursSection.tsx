"use client";

import { useState } from "react";
import type { Serialized } from "@/shared/lib/serialize";
import { Plus, X, Copy } from "lucide-react";
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
  BusinessHoursDay,
  BusinessTimeSlot,
} from "@/admin/actions/settings";
import { isMutationError } from "@/shared/lib/mutation-result";
import { useTransition } from "react";

interface BusinessHoursSectionProps {
  settings: Serialized<SettingsData>;
}

interface DayOfWeek {
  key: keyof BusinessHours;
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

// テンプレート定義
const TEMPLATE_KEYS = ["continuous", "lunch-break", "custom"] as const;
type TemplateKey = (typeof TEMPLATE_KEYS)[number];
const TEMPLATE_KEY_SET = new Set<string>(TEMPLATE_KEYS);
function isTemplateKey(value: string): value is TemplateKey {
  return TEMPLATE_KEY_SET.has(value);
}

interface Template {
  label: string;
  description: string;
  slots: BusinessTimeSlot[];
}

const TEMPLATES: Record<TemplateKey, Template> = {
  continuous: {
    label: "連続営業",
    description: "9:00〜21:00（休憩なし）",
    slots: [{ openTime: "09:00", closeTime: "21:00" }],
  },
  "lunch-break": {
    label: "昼休憩あり",
    description: "9:00〜12:00 / 13:00〜18:00",
    slots: [
      { openTime: "09:00", closeTime: "12:00" },
      { openTime: "13:00", closeTime: "18:00" },
    ],
  },
  custom: {
    label: "カスタム",
    description: "個別に設定",
    slots: [],
  },
};

const DEFAULT_SLOT: BusinessTimeSlot = {
  openTime: "09:00",
  closeTime: "18:00",
};

function createDefaultDay(isOpen: boolean): BusinessHoursDay {
  return isOpen
    ? { isOpen: true, slots: [{ openTime: "09:00", closeTime: "21:00" }] }
    : { isOpen: false, slots: [] };
}

const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  monday: createDefaultDay(true),
  tuesday: createDefaultDay(true),
  wednesday: createDefaultDay(true),
  thursday: createDefaultDay(true),
  friday: createDefaultDay(true),
  saturday: createDefaultDay(true),
  sunday: createDefaultDay(false),
};

// 時刻フォーマット検証
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

// 時間帯の重複チェック
function hasOverlappingSlots(slots: BusinessTimeSlot[]): boolean {
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i];
      const b = slots[j];
      if (a && b && a.openTime < b.closeTime && a.closeTime > b.openTime) {
        return true;
      }
    }
  }
  return false;
}

// エラー型
type SlotError = {
  day: keyof BusinessHours;
  slotIndex: number;
  field: "openTime" | "closeTime" | "overlap";
  message: string;
};

export function BusinessHoursSection({ settings }: BusinessHoursSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const initialBusinessHours = settings.businessHours ?? DEFAULT_BUSINESS_HOURS;
  const initialRegularHolidays = settings.regularHolidays ?? [];
  const initialSpecialHolidays = settings.specialHolidays ?? [];

  /**
   * 定休日設定を営業時間に反映
   */
  const businessHoursWithHolidays = (() => {
    const hours = { ...initialBusinessHours };
    const isBusinessHoursDay = (d: string): d is keyof BusinessHours =>
      d in hours;
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

  // 特定のスロットのエラーを取得
  const getSlotError = (
    day: keyof BusinessHours,
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
  const handleIsOpenChange = (day: keyof BusinessHours, isOpen: boolean) => {
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
    day: keyof BusinessHours,
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
  const handleAddSlot = (day: keyof BusinessHours) => {
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
  const handleRemoveSlot = (day: keyof BusinessHours, slotIndex: number) => {
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
  const copyToAllDays = (sourceDay: keyof BusinessHours) => {
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
        businessHours,
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
                      <Copy className="h-4 w-4" />
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
                              className={`w-32 ${openError ? "border-destructive" : ""}`}
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
                              className={`w-32 ${closeError ? "border-destructive" : ""}`}
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
                                <X className="h-4 w-4" />
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
                      <Plus className="mr-1 h-4 w-4" />
                      時間帯を追加
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
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
              <Plus className="h-4 w-4" />
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
                    <X className="h-3 w-3" />
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

        <SubmitButton
          isPending={isPending}
          onClick={handleSave}
          label="営業時間設定を保存"
          disabled={hasErrors}
        />
      </CardContent>
    </Card>
  );
}
