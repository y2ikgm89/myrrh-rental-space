"use client";

import { useId, type ReactElement } from "react";
import Image from "next/image";
import { IconGripVertical, IconX } from "@tabler/icons-react";
import {
  Button,
  Input,
  Label,
  toTranslate3d,
  useSortable,
} from "@/admin/components/ui";
import type { FieldMetadata } from "@conform-to/react";
import type { GalleryItem } from "@/shared/lib/validations/gallery";

interface GalleryItemRowProps {
  readonly id: string;
  readonly index: number;
  readonly urlField: FieldMetadata<GalleryItem["url"]>;
  readonly altField: FieldMetadata<GalleryItem["alt"]>;
  readonly captionField: FieldMetadata<GalleryItem["caption"]>;
  readonly url: string;
  readonly onRemove: () => void;
  readonly disabled?: boolean;
}

export function GalleryItemRow({
  id,
  index,
  urlField,
  altField,
  captionField,
  url,
  onRemove,
  disabled,
}: GalleryItemRowProps): ReactElement {
  const altId = useId();
  const captionId = useId();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, ...(disabled !== undefined && { disabled }) });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: toTranslate3d(transform), transition }}
      className={`flex items-start gap-3 rounded border bg-card p-3 ${isDragging ? "opacity-50" : ""}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="並べ替え"
        className="mt-1 cursor-grab touch-none active:cursor-grabbing"
        disabled={disabled}
      >
        <IconGripVertical
          className="h-5 w-5 text-muted-foreground"
          aria-hidden="true"
        />
      </button>

      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded">
        <Image
          src={url}
          alt={altField.value ?? ""}
          fill
          sizes="96px"
          className="object-cover"
        />
      </div>

      <input type="hidden" name={urlField.name} value={url} />

      <div className="flex-1 space-y-2">
        <div>
          <Label htmlFor={altId} className="text-xs">
            代替テキスト (alt)
          </Label>
          <Input
            id={altId}
            name={altField.name}
            defaultValue={altField.initialValue ?? ""}
            placeholder="画像の説明 (省略可)"
            maxLength={200}
          />
        </div>
        <div>
          <Label htmlFor={captionId} className="text-xs">
            キャプション
          </Label>
          <Input
            id={captionId}
            name={captionField.name}
            defaultValue={captionField.initialValue ?? ""}
            placeholder="画像の補足 (省略可)"
            maxLength={500}
          />
        </div>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`${index + 1} 番目の画像を削除`}
      >
        <IconX className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
