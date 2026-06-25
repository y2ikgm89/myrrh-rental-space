"use client";

import { useId, type ReactElement } from "react";
import {
  Button,
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  SortableContext,
  sortableKeyboardCoordinates,
  useSensor,
  useSensors,
  verticalListSortingStrategy,
  type DragEndEvent,
} from "@/admin/components/ui";
import { IconPhotoPlus } from "@tabler/icons-react";
import type { FieldMetadata, FormMetadata } from "@conform-to/react";
import { useMultipleMediaPicker } from "@/admin/hooks/use-media-picker";
import type { GalleryItem } from "@/shared/lib/validations/gallery";
import type { MediaUsage } from "@/admin/lib/validations/media";
import { asConformButtonGetter } from "@/shared/lib/conform/typed-input-control";
import { GalleryItemRow } from "./GalleryItemRow";

// conform FieldName branded type 境界を吸収する制御関数型
// (AutoArrayField と同パターン — typed-input-control.ts SSoT helper 経由)
type InsertControl = (opts: {
  name: string;
  defaultValue?: Record<string, unknown>;
}) => void;
type RemoveControl = (opts: { name: string; index: number }) => void;
type ReorderControl = (opts: {
  name: string;
  from: number;
  to: number;
}) => void;

interface GalleryFieldProps {
  readonly field: FieldMetadata<GalleryItem[]>;
  readonly form: FormMetadata<Record<string, unknown>>;
  readonly defaultUsage: Extract<MediaUsage, "SPACE" | "EVENT">;
  readonly max?: number;
  readonly disabled?: boolean;
}

export function GalleryField({
  field,
  form,
  defaultUsage,
  max = 20,
  disabled,
}: GalleryFieldProps): ReactElement {
  const dndId = useId();
  const items = field.getFieldList();

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const remaining = max - items.length;

  // conform 制御関数 (branded FieldName 境界を helper で緩める)
  const insertItem = asConformButtonGetter<InsertControl>(form.insert);
  const removeItem = asConformButtonGetter<RemoveControl>(form.remove);
  const reorderItem = asConformButtonGetter<ReorderControl>(form.reorder);

  const picker = useMultipleMediaPicker({
    defaultUsage,
    accept: "image-or-video",
    maxSelections: Math.max(0, remaining),
    onSelect: (media) => {
      const toAdd = media.slice(0, Math.max(0, remaining));
      for (const m of toAdd) {
        insertItem({
          name: field.name,
          defaultValue: { url: m.url, alt: "", caption: "" },
        });
      }
    },
  });

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((it) => it.key === String(active.id));
    const to = items.findIndex((it) => it.key === String(over.id));
    if (from < 0 || to < 0) return;
    reorderItem({ name: field.name, from, to });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {items.length} / {max} 枚
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => picker.openPicker()}
          disabled={(disabled ?? false) || items.length >= max}
        >
          <IconPhotoPlus className="mr-2 h-4 w-4" aria-hidden="true" />
          画像を追加
        </Button>
      </div>

      {items.length > 0 && (
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={items.map((it) => it.key ?? "")}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {items.map((item, index) => {
                const { url, alt, caption } = item.getFieldset();
                return (
                  <GalleryItemRow
                    key={item.key}
                    id={item.key ?? String(index)}
                    index={index}
                    urlField={url}
                    altField={alt}
                    captionField={caption}
                    url={url.initialValue ?? ""}
                    onRemove={() => removeItem({ name: field.name, index })}
                    {...(disabled !== undefined && { disabled })}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {picker.mediaPickerDialog}

      {field.errors && field.errors.length > 0 && (
        <p className="text-sm text-destructive">{field.errors.join(", ")}</p>
      )}
    </div>
  );
}
