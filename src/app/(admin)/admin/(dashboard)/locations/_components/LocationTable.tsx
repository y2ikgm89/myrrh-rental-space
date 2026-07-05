"use client";

/**
 * LocationTable
 *
 * 拠点一覧テーブル。`sortable`（検索なし）のとき D&D 並び替えを有効化し、
 * `updateLocationOrder` に {id, sortOrder} を渡す。sortOrder はシステム管理
 * （create=末尾自動採番 / reorder=D&D SSoT / update=不変）。`startIndex` は
 * ページオフセットで global な sortOrder を維持する。
 */

import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  PublishSwitch,
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
  toTranslate3d,
  type DragEndEvent,
} from "@/admin/components/ui";
import { DragHandle } from "@/admin/components/ui/sortable";
import { stopRowClick } from "@/admin/components/table";
import {
  updateLocationOrder,
  updateLocationPublished,
} from "@/admin/actions/location";
import { isMutationError } from "@/shared/lib/mutation-result";
import { cn } from "@/shared/lib/cn";
import type { LocationWithStats } from "@/shared/domain/locations/types";
import { EmptyState } from "@/admin/components/EmptyState";
import { LocationActionCell } from "./LocationActionCell";

// =============================================================================
// GbpSyncBadge — 拠点ごとの GBP 同期ステータス表示
// =============================================================================

function GbpSyncBadge({
  hasPlaceId,
  enabled,
  syncedAt,
  error,
}: {
  hasPlaceId: boolean;
  enabled: boolean;
  syncedAt: string | null;
  error: string | null;
}) {
  if (!hasPlaceId) return <Badge variant="secondary">Place ID 未設定</Badge>;
  if (!enabled) return <Badge variant="secondary">同期 OFF</Badge>;
  if (error)
    return (
      <Badge variant="destructive" title={error}>
        エラー
      </Badge>
    );
  if (syncedAt) return <Badge variant="success">同期済</Badge>;
  return <Badge variant="outline">未同期</Badge>;
}

// =============================================================================
// Types
// =============================================================================

type LocationTableProps = {
  readonly locations: LocationWithStats[];
  /** 検索なしのとき true（D&D 並び替えを有効化） */
  readonly sortable: boolean;
  /** ページオフセット（global な sortOrder 維持用） */
  readonly startIndex: number;
};

type SortableRowProps = {
  readonly location: LocationWithStats;
  readonly sortable: boolean;
  readonly isPending: boolean;
};

function SortableRow({ location, sortable, isPending }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: location.id, disabled: !sortable || isPending });

  const style = {
    transform: toTranslate3d(transform),
    transition,
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn(
        "group",
        isDragging && "z-50 shadow-lg ring-2 ring-primary/20",
      )}
    >
      <TableCell className="w-12" onClick={stopRowClick}>
        {sortable ? (
          <div {...attributes} {...listeners}>
            <DragHandle disabled={isPending} />
          </div>
        ) : (
          <span className="block h-4 w-4" aria-hidden="true" />
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          {location.imageUrl && (
            <Image
              src={location.imageUrl}
              alt={location.name}
              width={40}
              height={40}
              className="size-10 rounded object-cover"
            />
          )}
          <div>
            <div className="font-medium">{location.name}</div>
            {location.description && (
              <div className="text-sm text-muted-foreground line-clamp-1">
                {location.description.slice(0, 50)}
                {location.description.length > 50 && "..."}
              </div>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <div className="text-sm">{location.address}</div>
      </TableCell>
      <TableCell className="hidden text-right md:table-cell">
        <Badge variant="secondary">{location._count.spaces}件</Badge>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <GbpSyncBadge
          hasPlaceId={!!location.googleBusinessPlaceId}
          enabled={location.gbpSyncEnabled}
          syncedAt={location.gbpSyncedAt}
          error={location.gbpSyncError}
        />
      </TableCell>
      <TableCell onClick={stopRowClick}>
        <PublishSwitch
          id={location.id}
          isPublished={location.isPublished}
          onToggle={updateLocationPublished}
          resourceLabel={`${location.name} の公開状態`}
        />
      </TableCell>
      <TableCell className="text-right" onClick={stopRowClick}>
        <LocationActionCell locationId={location.id} />
      </TableCell>
    </TableRow>
  );
}

// =============================================================================
// LocationTable Component
// =============================================================================

export function LocationTable({
  locations: initialLocations,
  sortable,
  startIndex,
}: LocationTableProps) {
  const router = useRouter();
  const [locations, setLocations] = useState<LocationWithStats[]>(() => [
    ...initialLocations,
  ]);

  // React 19: props 変化を render 中に state へ同期
  const [previousInitial, setPreviousInitial] = useState(initialLocations);
  if (initialLocations !== previousInitial) {
    setPreviousInitial(initialLocations);
    setLocations([...initialLocations]);
  }

  const [isPending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !sortable || isPending) return;

    const oldIndex = locations.findIndex((l) => l.id === active.id);
    const newIndex = locations.findIndex((l) => l.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(locations, oldIndex, newIndex);
    setLocations(reordered);

    startTransition(async () => {
      const items = reordered.map((location, index) => ({
        id: location.id,
        sortOrder: startIndex + index,
      }));
      const result = await updateLocationOrder(items);
      if (isMutationError(result)) {
        toast.error(result.error);
        setLocations([...initialLocations]);
        return;
      }
      toast.success("拠点の並び順を更新しました");
      router.refresh();
    });
  };

  if (locations.length === 0) {
    return (
      <EmptyState
        message="場所がありません"
        action={{ label: "新規作成", href: "/admin/locations/new" }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {sortable
          ? "ドラッグ&ドロップで並び替えできます"
          : "並び替えは検索を解除すると有効になります"}
      </p>
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <DndContext
            id="location-sortable"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={locations.map((l) => l.id)}
              strategy={verticalListSortingStrategy}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12" />
                    <TableHead>場所名</TableHead>
                    <TableHead className="hidden lg:table-cell">住所</TableHead>
                    <TableHead className="hidden text-right md:table-cell">
                      スペース数
                    </TableHead>
                    <TableHead className="hidden md:table-cell">
                      GBP 同期
                    </TableHead>
                    <TableHead>公開状態</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {locations.map((location) => (
                    <SortableRow
                      key={location.id}
                      location={location}
                      sortable={sortable}
                      isPending={isPending}
                    />
                  ))}
                </TableBody>
              </Table>
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </div>
  );
}
