"use client";

/**
 * SpaceRatePlanEditModal
 *
 * `SpaceRatePlanList` から新規作成（`plan` 省略）または既存 plan の編集
 * （`plan` あり）の対象で条件付きマウントされる。conform `useActionState` +
 * `spaceRatePlanFormSchema`（Task 10）で create/update 両 action を bind する
 * canonical pattern（`SmartLockDeviceDialog` / `CategoryActionCell` と同型）。
 *
 * `name` / `hourlyPrice` / `startTime` / `endTime` / `effectiveFrom` /
 * `effectiveTo` は `getInputProps` の uncontrolled binding（conform が
 * defaultValue・エラー表示を管理）。`daysOfWeek` は配列フィールドのため
 * `SpaceEditForm` の `facilities` と同じ「ローカル state + 同名 hidden input
 * を選択数だけ描画」パターンを踏襲（「全曜日」ショートカットに素の state 操作が
 * 必要なため）。`holidayMode` は `useInputControl`（`CouponForm.type` /
 * `SmartLockDeviceDialog.deviceType` と同型）で Radix `RadioGroup` を bind する。
 */

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getFormProps,
  getInputProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { toast } from "sonner";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  SubmitButton,
} from "@/admin/components/ui";
import {
  createSpaceRatePlanAction,
  updateSpaceRatePlanAction,
} from "@/admin/actions/space-rate-plan";
import { spaceRatePlanFormSchema } from "@/admin/lib/validations/space-rate-plan";
import { formatJstDateOnly } from "@/shared/lib/date-format";
import {
  HolidayMode,
  type DayOfWeek,
} from "@/shared/lib/validations/enums/prisma-types";
import {
  ALL_DAYS_OF_WEEK,
  DAY_OF_WEEK_LABELS,
  HOLIDAY_MODE_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import type { SpaceRatePlanForResolver } from "@/shared/lib/pricing/rate-plan-resolver";

export type SpaceRatePlanEditModalProps = {
  readonly spaceId: string;
  readonly plan?: SpaceRatePlanForResolver | undefined;
  readonly onClose: () => void;
};

const HOLIDAY_MODE_VALUES: readonly HolidayMode[] = [
  HolidayMode.any,
  HolidayMode.only,
  HolidayMode.exclude,
];

const VALID_HOLIDAY_MODES = new Set<string>(HOLIDAY_MODE_VALUES);

function isHolidayModeValue(value: string | undefined): value is HolidayMode {
  return value !== undefined && VALID_HOLIDAY_MODES.has(value);
}

export function SpaceRatePlanEditModal({
  spaceId,
  plan,
  onClose,
}: SpaceRatePlanEditModalProps) {
  const router = useRouter();
  const isEdit = plan !== undefined;

  const boundAction = isEdit
    ? updateSpaceRatePlanAction.bind(null, plan.id)
    : createSpaceRatePlanAction;
  const [lastResult, formAction, isPending] = useActionState(
    boundAction,
    undefined,
  );

  const [form, fields] = useForm({
    id: isEdit ? `space-rate-plan-edit-${plan.id}` : "space-rate-plan-create",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: spaceRatePlanFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      spaceId,
      name: plan?.name ?? "",
      hourlyPrice: plan ? String(plan.hourlyPrice) : "0",
      holidayMode: plan?.holidayMode ?? HolidayMode.any,
      startTime: plan?.startTime ?? "",
      endTime: plan?.endTime ?? "",
      effectiveFrom: plan?.effectiveFrom
        ? formatJstDateOnly(plan.effectiveFrom)
        : "",
      effectiveTo: plan?.effectiveTo ? formatJstDateOnly(plan.effectiveTo) : "",
    },
  });

  // daysOfWeek は配列フィールド。「全曜日」ショートカットの素の state 操作が必要なため
  // useInputControl ではなくローカル state + 選択数だけ hidden input を描画する
  // （SpaceEditForm の facilities フィールドと同じ idiom）。
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>(
    plan?.daysOfWeek ?? [],
  );
  const allDaysSelected = selectedDays.length === ALL_DAYS_OF_WEEK.length;

  const toggleDay = (day: DayOfWeek, checked: boolean): void => {
    setSelectedDays((prev) =>
      checked ? [...prev, day] : prev.filter((d) => d !== day),
    );
  };

  const holidayModeControl = useInputControl(fields.holidayMode);
  const holidayModeValue = isHolidayModeValue(holidayModeControl.value)
    ? holidayModeControl.value
    : HolidayMode.any;

  // success → close は render 中 sync（set-state-in-effect 回避、既存 admin dialog 群と同じ idiom）
  const [previousResult, setPreviousResult] = useState(lastResult);
  if (lastResult !== previousResult) {
    setPreviousResult(lastResult);
    if (lastResult && lastResult.initialValue === null) {
      onClose();
    }
  }

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success(
        isEdit ? "料金プランを更新しました" : "料金プランを追加しました",
      );
      router.refresh();
    }
  }, [lastResult, router, isEdit]);

  const formErrors = form.errors;

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "料金プランを編集" : "料金プランを追加"}
          </DialogTitle>
          <DialogDescription>
            曜日・時間帯・期間ごとに時間料金を設定します。条件が重複する場合は最後に更新したプランが優先されます。
          </DialogDescription>
        </DialogHeader>

        <form {...getFormProps(form)} action={formAction} className="space-y-5">
          <input type="hidden" name={fields.spaceId.name} value={spaceId} />
          <input
            type="hidden"
            name={fields.holidayMode.name}
            value={holidayModeValue}
          />
          {selectedDays.map((day) => (
            <input
              key={day}
              type="hidden"
              name={fields.daysOfWeek.name}
              value={day}
            />
          ))}

          <div className="space-y-2">
            <Label htmlFor={fields.name.id}>プラン名 *</Label>
            <Input
              {...getInputProps(fields.name, { type: "text" })}
              placeholder="例: 平日夜間料金"
              disabled={isPending}
            />
            {fields.name.errors && (
              <p id={fields.name.errorId} className="text-sm text-destructive">
                {fields.name.errors.join(", ")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor={fields.hourlyPrice.id}>時間料金（円/時間）*</Label>
            <Input
              {...getInputProps(fields.hourlyPrice, { type: "number" })}
              step={1}
              min={0}
              max={1_000_000}
              placeholder="5000"
              disabled={isPending}
            />
            {fields.hourlyPrice.errors && (
              <p
                id={fields.hourlyPrice.errorId}
                className="text-sm text-destructive"
              >
                {fields.hourlyPrice.errors.join(", ")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>適用曜日</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() =>
                  setSelectedDays(allDaysSelected ? [] : [...ALL_DAYS_OF_WEEK])
                }
              >
                {allDaysSelected ? "選択解除" : "全曜日"}
              </Button>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-md border border-input p-3">
              {ALL_DAYS_OF_WEEK.map((day) => {
                const checkboxId = `${form.id}-day-${day}`;
                return (
                  <div key={day} className="flex items-center gap-1.5">
                    <Checkbox
                      id={checkboxId}
                      checked={selectedDays.includes(day)}
                      onCheckedChange={(checked) => toggleDay(day, checked)}
                      disabled={isPending}
                    />
                    <Label
                      htmlFor={checkboxId}
                      className="cursor-pointer font-normal"
                    >
                      {DAY_OF_WEEK_LABELS[day]}
                    </Label>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              未選択の場合は全曜日に適用されます。
            </p>
            {fields.daysOfWeek.errors && (
              <p
                id={fields.daysOfWeek.errorId}
                className="text-sm text-destructive"
              >
                {fields.daysOfWeek.errors.join(", ")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>祝日の扱い</Label>
            <RadioGroup
              value={holidayModeValue}
              onValueChange={(value) => {
                if (isHolidayModeValue(value)) holidayModeControl.change(value);
              }}
              className="gap-2"
            >
              {HOLIDAY_MODE_VALUES.map((mode) => {
                const radioId = `${form.id}-holiday-${mode}`;
                return (
                  <div key={mode} className="flex items-center gap-2">
                    <RadioGroupItem
                      id={radioId}
                      value={mode}
                      disabled={isPending}
                    />
                    <Label
                      htmlFor={radioId}
                      className="cursor-pointer font-normal"
                    >
                      {HOLIDAY_MODE_LABELS[mode]}
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
            {fields.holidayMode.errors && (
              <p
                id={fields.holidayMode.errorId}
                className="text-sm text-destructive"
              >
                {fields.holidayMode.errors.join(", ")}
              </p>
            )}
          </div>

          <div className="space-y-2 border-t border-border pt-4">
            <h4 className="text-sm font-medium text-muted-foreground">
              適用時間帯（任意・空欄で終日）
            </h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={fields.startTime.id}>開始時刻</Label>
                <Input
                  {...getInputProps(fields.startTime, { type: "time" })}
                  disabled={isPending}
                />
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
                <Label htmlFor={fields.endTime.id}>終了時刻</Label>
                <Input
                  {...getInputProps(fields.endTime, { type: "time" })}
                  disabled={isPending}
                />
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
          </div>

          <div className="space-y-2 border-t border-border pt-4">
            <h4 className="text-sm font-medium text-muted-foreground">
              有効期間（任意・空欄で無期限）
            </h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={fields.effectiveFrom.id}>有効開始日</Label>
                <Input
                  {...getInputProps(fields.effectiveFrom, { type: "date" })}
                  disabled={isPending}
                />
                {fields.effectiveFrom.errors && (
                  <p
                    id={fields.effectiveFrom.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.effectiveFrom.errors.join(", ")}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor={fields.effectiveTo.id}>有効終了日</Label>
                <Input
                  {...getInputProps(fields.effectiveTo, { type: "date" })}
                  disabled={isPending}
                />
                {fields.effectiveTo.errors && (
                  <p
                    id={fields.effectiveTo.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.effectiveTo.errors.join(", ")}
                  </p>
                )}
              </div>
            </div>
          </div>

          {formErrors && formErrors.length > 0 && (
            <div
              id={form.errorId}
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {formErrors.join(", ")}
            </div>
          )}
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isPending}
          >
            キャンセル
          </Button>
          <SubmitButton
            form={form.id}
            isPending={isPending}
            label={isEdit ? "更新" : "追加"}
            pendingLabel={isEdit ? "更新中..." : "追加中..."}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
