"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconCalendarOff, IconPlus, IconTrash } from "@tabler/icons-react";
import {
  getFormProps,
  getInputProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SubmitButton,
} from "@/admin/components/ui";
import {
  BLOCKED_DATE_TYPE,
  BLOCKED_DATE_TYPE_LABELS,
  isValidBlockedDateType,
  type BlockedDateType,
} from "@/shared/lib/validations/enums/helpers";
import { isMutationError } from "@/shared/lib/mutation-result";
import { scopedBlockedDateFormSchema } from "@/admin/lib/validations/blocked-date";
import {
  createSpaceBlockedDate,
  deleteSpaceBlockedDate,
} from "@/admin/actions/space-blocked-dates";
import type { BlockedDateData } from "@/shared/domain/blocked-dates/types";

interface BlockedDatesFieldProps {
  readonly spaceId: string;
  readonly initialBlockedDates: readonly BlockedDateData[];
}

const TYPE_VALUES: readonly BlockedDateType[] = [
  BLOCKED_DATE_TYPE.HOLIDAY,
  BLOCKED_DATE_TYPE.MAINTENANCE,
  BLOCKED_DATE_TYPE.EMERGENCY,
  BLOCKED_DATE_TYPE.OTHER,
];

function formatRange(blocked: BlockedDateData): string {
  if (blocked.startDate === blocked.endDate) return blocked.startDate;
  return `${blocked.startDate} 〜 ${blocked.endDate}`;
}

export function BlockedDatesField({
  spaceId,
  initialBlockedDates,
}: BlockedDatesFieldProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();

  const handleDelete = (blockedDateId: string): void => {
    startDeleteTransition(async () => {
      const result = await deleteSpaceBlockedDate(spaceId, blockedDateId);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("臨時休業を削除しました");
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          設備故障・点検などで特定の日付を予約不可にします（営業時間の定休日とは別管理）。
        </p>
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={() => setDialogOpen(true)}
        >
          <IconPlus className="mr-2 h-4 w-4" />
          臨時休業を追加
        </Button>
      </div>

      {initialBlockedDates.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-8 text-center">
          <IconCalendarOff
            className="h-8 w-8 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="text-sm text-muted-foreground">
            登録済みの臨時休業はありません
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {initialBlockedDates.map((blocked) => (
            <li
              key={blocked.id}
              className="flex items-center justify-between gap-4 p-4"
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground">
                  {formatRange(blocked)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {BLOCKED_DATE_TYPE_LABELS[blocked.type]}
                  {blocked.reason ? ` ・ ${blocked.reason}` : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="destructive-ghost"
                size="icon"
                aria-label={`${formatRange(blocked)} の臨時休業を削除`}
                disabled={isDeleting}
                onClick={() => handleDelete(blocked.id)}
              >
                <IconTrash className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {dialogOpen && (
        <AddBlockedDateDialog
          spaceId={spaceId}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}
    </div>
  );
}

interface AddBlockedDateDialogProps {
  readonly spaceId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

function AddBlockedDateDialog({
  spaceId,
  open,
  onOpenChange,
}: AddBlockedDateDialogProps) {
  const router = useRouter();
  const boundAction = createSpaceBlockedDate.bind(null, spaceId);
  const [lastResult, action, isPending] = useActionState(
    boundAction,
    undefined,
  );

  const [form, fields] = useForm({
    id: "space-blocked-date-create",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: scopedBlockedDateFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      startDate: "",
      endDate: "",
      reason: "",
      type: BLOCKED_DATE_TYPE.HOLIDAY,
    },
  });

  const typeControl = useInputControl(fields.type);
  const typeValue = isValidBlockedDateType(typeControl.value)
    ? typeControl.value
    : BLOCKED_DATE_TYPE.HOLIDAY;

  // success → close は render 中 sync（set-state-in-effect 回避）
  const [previousResult, setPreviousResult] = useState(lastResult);
  if (lastResult !== previousResult) {
    setPreviousResult(lastResult);
    if (lastResult && lastResult.initialValue === null) {
      onOpenChange(false);
    }
  }

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("臨時休業を追加しました");
      router.refresh();
    }
  }, [lastResult, router]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>臨時休業を追加</DialogTitle>
          <DialogDescription>
            予約を受け付けない日付の範囲・種別・理由を入力してください。
          </DialogDescription>
        </DialogHeader>

        <form {...getFormProps(form)} action={action} className="space-y-4">
          <input type="hidden" name={fields.type.name} value={typeValue} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={fields.startDate.id}>開始日</Label>
              <Input
                {...getInputProps(fields.startDate, { type: "date" })}
                disabled={isPending}
              />
              {fields.startDate.errors && (
                <p
                  id={fields.startDate.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.startDate.errors.join(", ")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor={fields.endDate.id}>終了日</Label>
              <Input
                {...getInputProps(fields.endDate, { type: "date" })}
                disabled={isPending}
              />
              {fields.endDate.errors && (
                <p
                  id={fields.endDate.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.endDate.errors.join(", ")}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={fields.type.id}>種別</Label>
            <Select
              value={typeValue}
              onValueChange={(value) => {
                if (isValidBlockedDateType(value)) typeControl.change(value);
              }}
              disabled={isPending}
            >
              <SelectTrigger id={fields.type.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_VALUES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {BLOCKED_DATE_TYPE_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor={fields.reason.id}>理由（任意）</Label>
            <Input
              {...getInputProps(fields.reason, { type: "text" })}
              placeholder="設備点検 / 年末年始 など"
              disabled={isPending}
            />
            {fields.reason.errors && (
              <p
                id={fields.reason.errorId}
                className="text-sm text-destructive"
              >
                {fields.reason.errors.join(", ")}
              </p>
            )}
          </div>
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            キャンセル
          </Button>
          <SubmitButton form={form.id} isPending={isPending} label="追加" />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
