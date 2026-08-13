"use client";

import type { ReactElement } from "react";
import type { FieldMetadata } from "@conform-to/react";
import { getInputProps } from "@conform-to/react";
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

/**
 * 複数チケット種別 (= 参加費・定員枠) の入力 UI。
 *
 * 属性別の出し分け (一般 / 学生 / シニア / 男女別 等) は EventTicket.name の
 * free-text 運用が業界 canonical (Peatix / connpass / Eventbrite 全社同パターン)。
 * 構造化 enum を入れても申込者の属性検証は self-report で運用が回らない上、
 * 軸を増やすたび schema migration が必要になるため、テンプレ追加ボタン +
 * placeholder ガイダンスで「どこで何を入力するか」の発見性を担保する。
 *
 * 実装は conform の field.array (`getFieldList()` / `getFieldset()`) を利用し、
 * `tickets[N].<field>` 形式で FormData に direct transit する。各 fieldset は
 * 独自 `.errors` を持つため、per-row / per-input inline error が conform native の
 * `getInputProps` + `errors.join(", ")` で自然に実現する (Option (b) の
 * ticket-errors.ts helper は不要になり削除済み)。
 *
 * 追加 / 削除 / 並べ替え / preset 適用は `form.insert` / `form.remove` /
 * `form.reorder` で行う (RefundPolicySection / DiscountSection と同型パターン)。
 * isAvailable Switch は Radix `name` prop で hidden input を emit させ、
 * `switchBoolean()` schema 側で unchecked → false を吸収する (per-row `useInputControl`
 * を避けるため — hooks-in-loop を回避しつつ hydration-safe)。
 */

/**
 * FormData transit 時の 1 ticket の shape。conform が
 * 数値を string に、boolean を "on" / undefined に自動 serialize するため、
 * form の defaultValue にはドメイン型そのまま (number / boolean / null) を渡してよい。
 */
type TicketDefaultValue = {
  id?: string;
  name: string;
  description: string;
  price: number;
  capacity: number | null;
  unitSize: number;
  isAvailable: boolean;
};

/**
 * conform の FieldMetadata と structurally 一致させるため、
 * `event-form-schema.ts` の `ticketInputSchema` の z.input と同一構造で宣言する:
 * - `.default(...)` / `.optional()` を付けたフィールドは `?` 付きで optional
 * - `.nullable()` を付けたフィールドは値に `| null`
 * - `switchBoolean()` は `.default(false)` なので optional
 */
type TicketFieldsetShape = {
  name: string;
  price: number;
  unitSize: number;
  id?: string | undefined;
  description?: string | null | undefined;
  capacity?: number | null | undefined;
  isAvailable?: boolean | undefined;
};

/**
 * TicketsField への callback 契約。`form.insert` / `form.remove` / `form.reorder` を
 * 直接受け取らずラップして渡す理由:
 *   - `FormMetadata<Schema>` は Schema について invariant で、TicketsField を
 *     再利用可能に保つには generic 化が必要 → 呼び出し側の型負担が増える
 *   - callback にすれば TicketsField は「tickets 配列の CRUD」だけを知ればよく、
 *     ホスト form の全体形を型で持たなくて済む
 */
type TicketsFieldProps = {
  field: FieldMetadata<TicketFieldsetShape[]>;
  onInsertTicket: (defaultValue: TicketDefaultValue) => void;
  onRemoveTicket: (index: number) => void;
  onReorderTicket: (from: number, to: number) => void;
  isPending: boolean;
};

type PresetTicket = Omit<TicketDefaultValue, "id">;
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
        description: "",
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
        description: "",
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
        description: "",
        price: 5000,
        capacity: null,
        unitSize: 1,
        isAvailable: true,
      },
      {
        name: "女性",
        description: "",
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
        description: "",
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
        description: "",
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

const EMPTY_TICKET_DRAFT: TicketDefaultValue = {
  name: "",
  description: "",
  price: 0,
  capacity: null,
  unitSize: 1,
  isAvailable: true,
};

export function TicketsField({
  field,
  onInsertTicket,
  onRemoveTicket,
  onReorderTicket,
  isPending,
}: TicketsFieldProps): ReactElement {
  const ticketFields = field.getFieldList();
  const capacityRequired = ticketFields.length > 1;
  const arrayErrors = field.errors;

  const moveTicket = (index: number, direction: -1 | 1): void => {
    const to = index + direction;
    if (to < 0 || to >= ticketFields.length) return;
    onReorderTicket(index, to);
  };

  const applyPreset = (preset: Preset): void => {
    /**
     * 空ドラフト (1 件 / 未編集) のみのときは preset で置換、
     * それ以外は末尾に append。空判定は初期値 (未編集の name/price/id) で行い、
     * ユーザーが少しでも触った行を preset で破壊しないよう保守的に振る。
     */
    const first = ticketFields[0];
    const firstShape = first?.getFieldset();
    const isEmptyDraft =
      ticketFields.length === 1 &&
      firstShape !== undefined &&
      (firstShape.name.initialValue === "" ||
        firstShape.name.initialValue === undefined) &&
      (firstShape.price.initialValue === "0" ||
        firstShape.price.initialValue === undefined) &&
      firstShape.id.initialValue === undefined;

    if (isEmptyDraft) {
      onRemoveTicket(0);
    }
    for (const item of preset.items) {
      onInsertTicket({ ...item });
    }
  };

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

        {ticketFields.length === 0 && (
          <p className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            参加費区分が登録されていません。テンプレから追加するか、下の「区分を追加」ボタンで作成してください。
          </p>
        )}

        {ticketFields.length > 1 && (
          <p className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            区分が複数あるため、各区分の <strong>受付人数</strong>{" "}
            は必須です（受付できる人数を区分ごとに分配する必要があります）。
          </p>
        )}

        {ticketFields.map((ticketField, index) => (
          <TicketRow
            key={ticketField.key}
            index={index}
            ticketField={ticketField}
            capacityRequired={capacityRequired}
            isPending={isPending}
            canMoveUp={index > 0}
            canMoveDown={index < ticketFields.length - 1}
            onMoveUp={() => moveTicket(index, -1)}
            onMoveDown={() => moveTicket(index, 1)}
            onRemove={() => onRemoveTicket(index)}
          />
        ))}

        <Button
          type="button"
          variant="outline"
          onClick={() => onInsertTicket({ ...EMPTY_TICKET_DRAFT })}
          disabled={isPending}
        >
          <IconPlus className="h-4 w-4" aria-hidden />
          区分を追加
        </Button>

        {arrayErrors && arrayErrors.length > 0 && (
          <p
            id={field.errorId}
            className="text-sm text-destructive"
            role="alert"
          >
            {arrayErrors.join(", ")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

type TicketRowProps = {
  index: number;
  ticketField: ReturnType<
    FieldMetadata<TicketFieldsetShape[]>["getFieldList"]
  >[number];
  capacityRequired: boolean;
  isPending: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
};

/**
 * 1 ticket 行。React hooks を row 内部で呼ぶ必要が出た場合に備えて sub-component
 * として抽出している (現状 hooks なしだが、Switch の isAvailable を将来
 * useInputControl 化する余地を残す)。
 */
function TicketRow({
  index,
  ticketField,
  capacityRequired,
  isPending,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onRemove,
}: TicketRowProps): ReactElement {
  const t = ticketField.getFieldset();
  const hasAnyRowError =
    Boolean(ticketField.errors && ticketField.errors.length > 0) ||
    Boolean(t.name.errors && t.name.errors.length > 0) ||
    Boolean(t.price.errors && t.price.errors.length > 0) ||
    Boolean(t.unitSize.errors && t.unitSize.errors.length > 0) ||
    Boolean(t.capacity.errors && t.capacity.errors.length > 0) ||
    Boolean(t.description.errors && t.description.errors.length > 0) ||
    Boolean(t.isAvailable.errors && t.isAvailable.errors.length > 0);

  // conform は boolean を "on" / undefined に serialize するため、
  // 未定義 = 未チェック、"on" = チェック。
  const isAvailableChecked = t.isAvailable.initialValue === "on";

  return (
    <div
      className={
        hasAnyRowError
          ? "space-y-3 rounded-md border border-destructive/60 bg-destructive/5 p-4"
          : "space-y-3 rounded-md border border-border bg-card p-4"
      }
    >
      <input {...getInputProps(t.id, { type: "hidden" })} />

      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">
          #{String(index + 1)}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onMoveUp}
            disabled={isPending || !canMoveUp}
            aria-label="上へ移動"
          >
            ↑
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onMoveDown}
            disabled={isPending || !canMoveDown}
            aria-label="下へ移動"
          >
            ↓
          </Button>
          <Button
            type="button"
            variant="destructive-ghost"
            size="sm"
            onClick={onRemove}
            disabled={isPending}
            aria-label="削除"
          >
            <IconTrash className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>

      {ticketField.errors && ticketField.errors.length > 0 && (
        <p
          id={ticketField.errorId}
          className="text-sm text-destructive"
          role="alert"
        >
          {ticketField.errors.join(", ")}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={t.name.id}>区分名</Label>
          <Input
            {...getInputProps(t.name, { type: "text" })}
            disabled={isPending}
            placeholder="例: 一般 / 学生 / 女性 / 65歳以上"
          />
          {t.name.errors && t.name.errors.length > 0 && (
            <p
              id={t.name.errorId}
              className="mt-1 text-xs text-destructive"
              role="alert"
            >
              {t.name.errors.join(", ")}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor={t.price.id}>料金 (円)</Label>
          <Input
            {...getInputProps(t.price, { type: "number" })}
            min={0}
            disabled={isPending}
          />
          {t.price.errors && t.price.errors.length > 0 && (
            <p
              id={t.price.errorId}
              className="mt-1 text-xs text-destructive"
              role="alert"
            >
              {t.price.errors.join(", ")}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor={t.unitSize.id}>1チケットあたりの人数</Label>
          <Input
            {...getInputProps(t.unitSize, { type: "number" })}
            min={1}
            disabled={isPending}
          />
          {t.unitSize.errors && t.unitSize.errors.length > 0 ? (
            <p
              id={t.unitSize.errorId}
              className="mt-1 text-xs text-destructive"
              role="alert"
            >
              {t.unitSize.errors.join(", ")}
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              例: グループ枠なら 4 (4 名で 1 チケット)
            </p>
          )}
        </div>

        <div>
          <Label htmlFor={t.capacity.id}>
            受付人数{" "}
            {capacityRequired ? (
              <span aria-hidden="true" className="text-destructive">
                *
              </span>
            ) : (
              <span className="font-normal text-muted-foreground">(任意)</span>
            )}
          </Label>
          <Input
            {...getInputProps(t.capacity, { type: "number" })}
            min={1}
            disabled={isPending}
            required={capacityRequired}
            aria-required={capacityRequired}
          />
          {t.capacity.errors && t.capacity.errors.length > 0 ? (
            <p
              id={t.capacity.errorId}
              className="mt-1 text-xs text-destructive"
              role="alert"
            >
              {t.capacity.errors.join(", ")}
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              {capacityRequired
                ? "区分が複数のため必須。各区分で受け付ける人数を入力します。"
                : "空欄なら基本情報の定員を使用します。"}
            </p>
          )}
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor={t.description.id}>説明 / 条件 (任意)</Label>
          <Input
            {...getInputProps(t.description, { type: "text" })}
            disabled={isPending}
            placeholder="例: 高校生以上の学生証提示 / 女性限定 / ドリンク付き"
          />
          {t.description.errors && t.description.errors.length > 0 && (
            <p
              id={t.description.errorId}
              className="mt-1 text-xs text-destructive"
              role="alert"
            >
              {t.description.errors.join(", ")}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1 sm:col-span-2">
          <div className="flex items-center gap-2">
            {/*
             * Radix Switch は `name` prop 付きで <input type="checkbox"> hidden を emit する。
             * 未チェック時は FormData に含まれず、`switchBoolean() = z.boolean().default(false)`
             * が undefined → false を吸収する。per-row useInputControl を避けるため
             * uncontrolled (defaultChecked) で運用する。
             */}
            <Switch
              id={t.isAvailable.id}
              name={t.isAvailable.name}
              defaultChecked={isAvailableChecked}
              disabled={isPending}
              aria-describedby={
                t.isAvailable.errors && t.isAvailable.errors.length > 0
                  ? t.isAvailable.errorId
                  : undefined
              }
            />
            <Label htmlFor={t.isAvailable.id}>
              申込受付中にする (OFF で一時停止)
            </Label>
          </div>
          {t.isAvailable.errors && t.isAvailable.errors.length > 0 && (
            <p
              id={t.isAvailable.errorId}
              className="text-xs text-destructive"
              role="alert"
            >
              {t.isAvailable.errors.join(", ")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
