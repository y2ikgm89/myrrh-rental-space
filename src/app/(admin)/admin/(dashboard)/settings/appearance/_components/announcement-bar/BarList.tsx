"use client";

import { formatMonthDayTime } from "@/shared/lib/date-format";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  SortableContext,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Switch,
  arrayMove,
  closestCenter,
  sortableKeyboardCoordinates,
  toTranslate3d,
  useSensor,
  useSensors,
  useSortable,
  verticalListSortingStrategy,
  type DragEndEvent,
} from "@/admin/components/ui";
import { DragHandle } from "@/admin/components/ui/sortable";
import { PortableTextSpans } from "@/shared/components/portable-text/PortableTextSpans";
import { cn } from "@/shared/lib/cn";
import type { BarListProps } from "./types";

type BarRowProps = {
  readonly bar: BarListProps["bars"][number];
  readonly isPending: boolean;
  readonly onEdit: BarListProps["onEdit"];
  readonly onToggleActive: BarListProps["onToggleActive"];
  readonly onDelete: BarListProps["onDelete"];
};

function SortableBarRow({
  bar,
  isPending,
  onEdit,
  onToggleActive,
  onDelete,
}: BarRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: bar.id, disabled: isPending });

  const style = {
    transform: toTranslate3d(transform),
    transition,
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn(isDragging && "z-50 shadow-lg ring-2 ring-primary/20")}
    >
      <TableCell className="w-12">
        <div {...attributes} {...listeners}>
          <DragHandle disabled={isPending} />
        </div>
      </TableCell>
      <TableCell>
        <Switch
          checked={bar.isActive}
          onCheckedChange={(checked) => onToggleActive(bar.id, checked)}
          disabled={isPending}
          aria-label="お知らせバーの有効状態"
        />
      </TableCell>
      <TableCell className="max-w-[300px] truncate">
        <span className="inline-flex items-center gap-1.5">
          <PortableTextSpans spans={bar.message} iconClassName="h-4 w-4" />
        </span>
      </TableCell>
      <TableCell>
        <Badge variant={bar.isActive ? "default" : "secondary"}>
          {bar.isActive ? "有効" : "無効"}
        </Badge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {bar.startAt || bar.endAt ? (
          <>
            {bar.startAt && formatMonthDayTime(bar.startAt)}
            {bar.startAt && bar.endAt && " 〜 "}
            {bar.endAt && formatMonthDayTime(bar.endAt)}
          </>
        ) : (
          "常時"
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(bar)}
            disabled={isPending}
          >
            編集
          </Button>
          <Button
            variant="destructive-ghost"
            size="sm"
            onClick={() => onDelete(bar.id)}
            disabled={isPending}
          >
            削除
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function BarList({
  bars,
  isPending,
  onEdit,
  onCreate,
  onToggleActive,
  onReorder,
  onDelete,
}: BarListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || isPending) return;

    const oldIndex = bars.findIndex((bar) => bar.id === active.id);
    const newIndex = bars.findIndex((bar) => bar.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    onReorder(arrayMove(bars, oldIndex, newIndex));
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={onCreate}>新規作成</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>お知らせバー一覧</CardTitle>
        </CardHeader>
        <CardContent>
          {bars.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              お知らせバーがありません
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                ドラッグ&ドロップで表示順を変更できます
              </p>
              <DndContext
                id="announcement-bars-sortable"
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={bars.map((bar) => bar.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12" />
                        <TableHead className="w-[80px]">表示</TableHead>
                        <TableHead>メッセージ</TableHead>
                        <TableHead className="w-[90px]">状態</TableHead>
                        <TableHead className="w-[150px]">表示期間</TableHead>
                        <TableHead className="w-[100px]">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bars.map((bar) => (
                        <SortableBarRow
                          key={bar.id}
                          bar={bar}
                          isPending={isPending}
                          onEdit={onEdit}
                          onToggleActive={onToggleActive}
                          onDelete={onDelete}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </SortableContext>
              </DndContext>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
