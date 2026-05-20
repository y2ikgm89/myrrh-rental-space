"use client";

import type { ReactElement } from "react";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import {
  Button,
  Input,
  Label,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Switch,
} from "@/admin/components/ui";

/**
 * チケット種別の入力データ (admin form state)
 *
 * Peatix / Eventbrite 流の複数チケット種別 UI。
 * 例: 「一般 5000円」「学割 3000円」「4人グループ 12000円 (unitSize=4)」
 *
 * `id` は既存 ticket のみ持つ (update 時に diff/upsert で利用)。新規追加分は省略。
 */
export type TicketDraft = {
  readonly id?: string;
  readonly name: string;
  readonly description?: string;
  readonly price: number;
  readonly capacity: number | null;
  readonly unitSize: number;
  readonly sortOrder: number;
  readonly isAvailable: boolean;
};

export function createDefaultTicket(sortOrder: number): TicketDraft {
  return {
    name: "",
    description: "",
    price: 0,
    capacity: null,
    unitSize: 1,
    sortOrder,
    isAvailable: true,
  };
}

type TicketsFieldProps = {
  tickets: readonly TicketDraft[];
  onChange: (next: TicketDraft[]) => void;
  errors?: string[] | undefined;
  isPending: boolean;
};

export function TicketsField({
  tickets,
  onChange,
  errors,
  isPending,
}: TicketsFieldProps): ReactElement {
  function updateTicket(index: number, patch: Partial<TicketDraft>): void {
    const next = tickets.map((t, i) => (i === index ? { ...t, ...patch } : t));
    onChange(next);
  }

  function removeTicket(index: number): void {
    const next = tickets
      .filter((_, i) => i !== index)
      .map((t, i) => ({ ...t, sortOrder: i }));
    onChange(next);
  }

  function addTicket(): void {
    onChange([...tickets, createDefaultTicket(tickets.length)]);
  }

  function moveTicket(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= tickets.length) return;
    const next = [...tickets];
    const a = next[index];
    const b = next[target];
    if (!a || !b) return;
    next[index] = b;
    next[target] = a;
    onChange(next.map((t, i) => ({ ...t, sortOrder: i })));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>チケット種別</CardTitle>
        <p className="text-sm text-muted-foreground">
          複数のチケット種別を登録できます (一般 / 学割 / グループ等)。1
          チケットあたりの人数を指定すると「4人で5000円」のようなグループ料金を表現できます。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {tickets.length === 0 && (
          <p className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            チケット種別が登録されていません。下のボタンから追加してください。
          </p>
        )}

        {tickets.map((ticket, index) => {
          const inputBase = `event-ticket-${index}`;
          return (
            <div
              key={ticket.id ?? `new-${String(index)}`}
              className="space-y-3 rounded-md border border-border bg-card p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">
                  #{String(index + 1)}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => moveTicket(index, -1)}
                    disabled={isPending || index === 0}
                    aria-label="上へ移動"
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => moveTicket(index, 1)}
                    disabled={isPending || index === tickets.length - 1}
                    aria-label="下へ移動"
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    variant="destructive-ghost"
                    size="sm"
                    onClick={() => removeTicket(index)}
                    disabled={isPending}
                    aria-label="削除"
                  >
                    <IconTrash className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor={`${inputBase}-name`}>チケット名</Label>
                  <Input
                    id={`${inputBase}-name`}
                    type="text"
                    value={ticket.name}
                    onChange={(e) =>
                      updateTicket(index, { name: e.target.value })
                    }
                    disabled={isPending}
                    placeholder="例: 一般 / 学割"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor={`${inputBase}-price`}>料金 (円)</Label>
                  <Input
                    id={`${inputBase}-price`}
                    type="number"
                    min={0}
                    value={ticket.price}
                    onChange={(e) =>
                      updateTicket(index, {
                        price: Number(e.target.value) || 0,
                      })
                    }
                    disabled={isPending}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor={`${inputBase}-unitSize`}>
                    1チケットあたりの人数
                  </Label>
                  <Input
                    id={`${inputBase}-unitSize`}
                    type="number"
                    min={1}
                    value={ticket.unitSize}
                    onChange={(e) =>
                      updateTicket(index, {
                        unitSize: Number(e.target.value) || 1,
                      })
                    }
                    disabled={isPending}
                    required
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    例: グループチケットなら 4 (4 人で 1 チケット)
                  </p>
                </div>

                <div>
                  <Label htmlFor={`${inputBase}-capacity`}>
                    枠数 (空欄=制限なし)
                  </Label>
                  <Input
                    id={`${inputBase}-capacity`}
                    type="number"
                    min={1}
                    value={ticket.capacity ?? ""}
                    onChange={(e) =>
                      updateTicket(index, {
                        capacity:
                          e.target.value === ""
                            ? null
                            : Number(e.target.value) || null,
                      })
                    }
                    disabled={isPending}
                  />
                </div>

                <div className="sm:col-span-2">
                  <Label htmlFor={`${inputBase}-description`}>
                    説明 (任意)
                  </Label>
                  <Input
                    id={`${inputBase}-description`}
                    type="text"
                    value={ticket.description ?? ""}
                    onChange={(e) =>
                      updateTicket(index, { description: e.target.value })
                    }
                    disabled={isPending}
                    placeholder="例: 学生証提示 / ドリンク付き"
                  />
                </div>

                <div className="flex items-center gap-2 sm:col-span-2">
                  <Switch
                    id={`${inputBase}-isAvailable`}
                    checked={ticket.isAvailable}
                    onCheckedChange={(checked) =>
                      updateTicket(index, { isAvailable: checked })
                    }
                    disabled={isPending}
                  />
                  <Label htmlFor={`${inputBase}-isAvailable`}>
                    申込受付中にする (OFF で一時停止)
                  </Label>
                </div>
              </div>
            </div>
          );
        })}

        <Button
          type="button"
          variant="outline"
          onClick={addTicket}
          disabled={isPending}
        >
          <IconPlus className="h-4 w-4" aria-hidden />
          チケット種別を追加
        </Button>

        {errors && errors.length > 0 && (
          <p className="text-sm text-destructive" role="alert">
            {errors.join(", ")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
