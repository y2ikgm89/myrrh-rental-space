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
import type { MediaUsage } from "@/admin/lib/validations/media";
import { GalleryItemRow } from "./GalleryItemRow";

type GalleryFormItem = {
  readonly url: string;
  readonly alt?: string | undefined;
  readonly caption?: string | undefined;
};

interface GalleryFieldProps<TForm extends Record<string, unknown>> {
  readonly field: FieldMetadata<GalleryFormItem[] | undefined, TForm>;
  readonly form: FormMetadata<TForm>;
  readonly defaultUsage: Extract<MediaUsage, "SPACE" | "EVENT">;
  readonly max?: number;
  readonly disabled?: boolean;
}

export function GalleryField<TForm extends Record<string, unknown>>({
  field,
  form,
  defaultUsage,
  max = 20,
  disabled,
}: GalleryFieldProps<TForm>): ReactElement {
  const dndId = useId();
  const items = field.getFieldList();
  const isDisabled = disabled ?? false;

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const remaining = max - items.length;

  const picker = useMultipleMediaPicker({
    defaultUsage,
    accept: "image-or-video",
    maxSelections: Math.max(0, remaining),
    onSelect: (media) => {
      if (isDisabled) return;
      const toAdd = media.slice(0, Math.max(0, remaining));
      const fieldName: string = field.name;
      for (const m of toAdd) {
        form.insert<GalleryFormItem[]>({
          name: fieldName,
          defaultValue: { url: m.url, alt: "", caption: "" },
        });
      }
    },
  });

  const onDragEnd = (event: DragEndEvent) => {
    if (isDisabled) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((it) => it.key === String(active.id));
    const to = items.findIndex((it) => it.key === String(over.id));
    if (from < 0 || to < 0) return;
    const fieldName: string = field.name;
    form.reorder<GalleryFormItem[]>({ name: fieldName, from, to });
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
          disabled={isDisabled || items.length >= max}
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
            disabled={isDisabled}
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
                    onRemove={() => {
                      const fieldName: string = field.name;
                      form.remove<GalleryFormItem[]>({
                        name: fieldName,
                        index,
                      });
                    }}
                    disabled={isDisabled}
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
