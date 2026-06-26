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
} from "@/admin/components/ui";

/** フォームで扱うスロット 1 件（datetime-local 文字列形式）。JSON hidden input で transit。 */
export type SlotFormItem = {
  /** 既存スロットの更新時に指定。新規スロットは undefined。 */
  id?: string;
  /** datetime-local 形式 "YYYY-MM-DDTHH:mm" */
  startAt: string;
  /** datetime-local 形式 "YYYY-MM-DDTHH:mm" */
  endAt: string;
  capacity: number;
};

type Props = {
  slots: SlotFormItem[];
  onChange: (slots: SlotFormItem[]) => void;
  /** conform から渡されるスロット全体エラー */
  errors?: readonly string[] | undefined;
  isPending: boolean;
};

function emptySlot(): SlotFormItem {
  return { startAt: "", endAt: "", capacity: 0 };
}

export function EventScheduleFields({
  slots,
  onChange,
  errors,
  isPending,
}: Props): ReactElement {
  const addSlot = () => onChange([...slots, emptySlot()]);
  const removeSlot = (i: number) =>
    onChange(slots.filter((_, idx) => idx !== i));
  const updateSlot = (i: number, patch: Partial<SlotFormItem>) =>
    onChange(slots.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  return (
    <Card>
      <CardHeader>
        <CardTitle>タイムスロット</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {errors && errors.length > 0 && (
          <p className="text-sm text-destructive">{errors.join(", ")}</p>
        )}

        {slots.map((slot, i) => (
          <div key={slot.id ?? i} className="rounded-md border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">スロット {i + 1}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeSlot(i)}
                disabled={isPending || slots.length <= 1}
                aria-label={`スロット ${String(i + 1)} を削除`}
              >
                <IconTrash className="h-4 w-4" />
              </Button>
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
                min={0}
                value={slot.capacity}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  updateSlot(i, {
                    capacity: Number.isFinite(n) && n >= 0 ? n : 0,
                  });
                }}
                disabled={isPending}
              />
            </div>
          </div>
        ))}

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
      </CardContent>
    </Card>
  );
}
