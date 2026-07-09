"use client";

import type { ReactElement } from "react";
import { IconPlus, IconTrash, IconTemplate } from "@tabler/icons-react";
import {
  Button,
  Input,
  Label,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Switch,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/admin/components/ui";
import {
  createDefaultTicket,
  type EventTicketInput,
} from "@/shared/domain/events/ticket-types";

/**
 * 複数チケット種別 (= 参加費・定員枠) の入力 UI。
 *
 * 属性別の出し分け (一般 / 学生 / シニア / 男女別 等) は EventTicket.name の
 * free-text 運用が業界 canonical (Peatix / connpass / Eventbrite 全社同パターン)。
 * 構造化 enum を入れても申込者の属性検証は self-report で運用が回らない上、
 * 軸を増やすたび schema migration が必要になるため、テンプレ追加ボタン +
 * placeholder ガイダンスで「どこで何を入力するか」の発見性を担保する。
 *
 * 型は `@/shared/domain/events/ticket-types` の `EventTicketInput` SSoT を共有する。
 * 永続化順はこの配列順から server/domain が再採番する。
 */
type TicketsFieldProps = {
  tickets: readonly EventTicketInput[];
  onChange: (next: EventTicketInput[]) => void;
  errors?: string[] | undefined;
  isPending: boolean;
};

type PresetTicket = Omit<EventTicketInput, "id" | "_key">;
type Preset = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly items: readonly PresetTicket[];
};

const PRESETS: readonly Preset[] = [
  {
    id: "general-only",
    label: "一般のみ",
    description: "シンプルな単一料金",
    items: [
      {
        name: "一般",
        description: null,
        price: 5000,
        capacity: null,
        unitSize: 1,
        isAvailable: true,
      },
    ],
  },
  {
    id: "age-tier",
    label: "一般 / 学生 / シニア",
    description: "年齢層別の 3 区分",
    items: [
      {
        name: "一般",
        description: null,
        price: 5000,
        capacity: null,
        unitSize: 1,
        isAvailable: true,
      },
      {
        name: "学生",
        description: "高校生以上の学生証提示",
        price: 3000,
        capacity: null,
        unitSize: 1,
        isAvailable: true,
      },
      {
        name: "シニア (65歳以上)",
        description: "年齢確認書類のご提示",
        price: 4000,
        capacity: null,
        unitSize: 1,
        isAvailable: true,
      },
    ],
  },
  {
    id: "gender",
    label: "男性 / 女性",
    description: "性別による出し分け",
    items: [
      {
        name: "男性",
        description: null,
        price: 5000,
        capacity: null,
        unitSize: 1,
        isAvailable: true,
      },
      {
        name: "女性",
        description: null,
        price: 4000,
        capacity: null,
        unitSize: 1,
        isAvailable: true,
      },
    ],
  },
  {
    id: "time-tier",
    label: "早割 / 通常 / 当日",
    description: "時期による価格分け",
    items: [
      {
        name: "早割",
        description: "開催1週間前まで",
        price: 4000,
        capacity: null,
        unitSize: 1,
        isAvailable: true,
      },
      {
        name: "通常",
        description: null,
        price: 5000,
        capacity: null,
        unitSize: 1,
        isAvailable: true,
      },
      {
        name: "当日",
        description: "受付にて現金のみ",
        price: 6000,
        capacity: null,
        unitSize: 1,
        isAvailable: true,
      },
    ],
  },
  {
    id: "group",
    label: "個人 / グループ (4名)",
    description: "1チケット複数人の枠",
    items: [
      {
        name: "個人",
        description: null,
        price: 5000,
        capacity: null,
        unitSize: 1,
        isAvailable: true,
      },
      {
        name: "グループ (4名)",
        description: "1枠で4名様まで",
        price: 18000,
        capacity: null,
        unitSize: 4,
        isAvailable: true,
      },
    ],
  },
];

export function TicketsField({
  tickets,
  onChange,
  errors,
  isPending,
}: TicketsFieldProps): ReactElement {
  function updateTicket(index: number, patch: Partial<EventTicketInput>): void {
    const next = tickets.map((t, i) => (i === index ? { ...t, ...patch } : t));
    onChange(next);
  }

  function removeTicket(index: number): void {
    const next = tickets.filter((_, i) => i !== index);
    onChange(next);
  }

  function addTicket(): void {
    onChange([...tickets, createDefaultTicket()]);
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
    onChange(next);
  }

  function applyPreset(preset: Preset): void {
    const isEmptyDraft =
      tickets.length === 1 &&
      tickets[0]?.id === undefined &&
      tickets[0]?.name === "" &&
      tickets[0]?.price === 0;
    const baseTickets = isEmptyDraft ? [] : tickets;
    const additions: EventTicketInput[] = preset.items.map((item) => ({
      ...item,
    }));
    onChange([...baseTickets, ...additions]);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>参加費・定員</CardTitle>
        <p className="text-sm text-muted-foreground">
          複数の区分 (一般 / 学生 / シニア / 男女別 / 早割 等) を登録できます。
          属性条件は <strong>区分名</strong> と <strong>説明</strong>{" "}
          で表現します (例:「学生 (高校生以上)」「女性限定」)。
          1チケットの人数を変えるとグループ料金 (4名で18,000円 等)
          も表現できます。
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                <IconTemplate className="mr-1 h-4 w-4" aria-hidden />
                テンプレから追加
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuLabel>
                よく使う区分パターン (末尾に追加)
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {PRESETS.map((preset) => (
                <DropdownMenuItem
                  key={preset.id}
                  onSelect={() => applyPreset(preset)}
                  className="flex flex-col items-start gap-0.5"
                >
                  <span className="font-medium">{preset.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {preset.description}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <p className="text-xs text-muted-foreground">
            空のままなら置換、入力済みなら末尾に追加されます。料金・人数は後で調整可能です。
          </p>
        </div>

        {tickets.length === 0 && (
          <p className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            参加費区分が登録されていません。テンプレから追加するか、下の「区分を追加」ボタンで作成してください。
          </p>
        )}

        {/* 単一区分のときは基本情報の定員を使えるため枠数は任意 */}
        {tickets.length > 1 && (
          <p className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            区分が複数あるため、各区分の <strong>枠数</strong>{" "}
            は必須です（受付できる人数を区分ごとに分配する必要があります）。
          </p>
        )}

        {tickets.map((ticket, index) => {
          const inputBase = `event-ticket-${index}`;
          const capacityRequired = tickets.length > 1;
          return (
            <div
              key={ticket._key ?? ticket.id ?? `idx-${String(index)}`}
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
                  <Label htmlFor={`${inputBase}-name`}>区分名</Label>
                  <Input
                    id={`${inputBase}-name`}
                    type="text"
                    value={ticket.name}
                    onChange={(e) =>
                      updateTicket(index, { name: e.target.value })
                    }
                    disabled={isPending}
                    placeholder="例: 一般 / 学生 / 女性 / 65歳以上"
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
                    例: グループ枠なら 4 (4 名で 1 チケット)
                  </p>
                </div>

                <div>
                  <Label htmlFor={`${inputBase}-capacity`}>
                    枠数{" "}
                    {capacityRequired ? (
                      <span aria-hidden="true" className="text-destructive">
                        *
                      </span>
                    ) : (
                      <span className="font-normal text-muted-foreground">
                        (任意)
                      </span>
                    )}
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
                    required={capacityRequired}
                    aria-required={capacityRequired}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {capacityRequired
                      ? "区分が複数のため必須。各区分で受け付ける人数を入力します。"
                      : "空欄なら基本情報の定員を使用します。"}
                  </p>
                </div>

                <div className="sm:col-span-2">
                  <Label htmlFor={`${inputBase}-description`}>
                    説明 / 条件 (任意)
                  </Label>
                  <Input
                    id={`${inputBase}-description`}
                    type="text"
                    value={ticket.description ?? ""}
                    onChange={(e) =>
                      updateTicket(index, { description: e.target.value })
                    }
                    disabled={isPending}
                    placeholder="例: 高校生以上の学生証提示 / 女性限定 / ドリンク付き"
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
          区分を追加
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
