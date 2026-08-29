"use client";

import Image from "next/image";
import { getInputProps } from "@conform-to/react";
import type { LocationFormInput } from "@/shared/lib/validations/location";
import type { FieldMetadata } from "@conform-to/react";
import { Button, Input, useSortable } from "@/admin/components/ui";
import { useSortableImperativeRef } from "@/admin/components/ui/sortable";
import { cn } from "@/shared/lib/cn";

export function DragHandle({
  className,
  disabled,
}: {
  className?: string;
  disabled?: boolean | undefined;
}) {
  return (
    <div
      className={cn(
        "flex h-8 w-8 cursor-grab items-center justify-center rounded text-muted-foreground transition-colors",
        "hover:bg-muted hover:text-foreground",
        "active:cursor-grabbing",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
      aria-label="ドラッグして並び替え"
    >
      <svg
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path
          d="M4 8h16M4 16h16"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

type SortableImageItemProps = {
  id: string;
  url: string;
  index: number;
  onRemove: () => void;
  disabled?: boolean;
};

export function SortableImageItem({
  id,
  url,
  index,
  onRemove,
  disabled,
}: SortableImageItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, ...(disabled !== undefined && { disabled }) });

  const combinedRef = useSortableImperativeRef(
    setNodeRef,
    transform,
    transition,
  );

  return (
    <div
      ref={combinedRef}
      className={cn(
        "flex items-center gap-2 rounded border p-2",
        isDragging && "z-50 shadow-lg ring-2 ring-primary/20",
      )}
    >
      <div {...attributes} {...listeners}>
        <DragHandle disabled={disabled} />
      </div>
      <Image
        src={url}
        alt={`画像${index + 1}`}
        width={40}
        height={40}
        className="size-10 rounded object-cover"
      />
      <span className="flex-1 truncate text-sm">{url}</span>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={onRemove}
        disabled={disabled}
      >
        削除
      </Button>
    </div>
  );
}

type AccessLineField = FieldMetadata<
  NonNullable<LocationFormInput["accessLines"]>[number],
  LocationFormInput
>;

type SortableAccessLineItemProps = {
  id: string;
  index: number;
  itemField: AccessLineField;
  disabled?: boolean;
  onRemove: () => void;
};

export function SortableAccessLineItem({
  id,
  index,
  itemField,
  disabled,
  onRemove,
}: SortableAccessLineItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, ...(disabled !== undefined && { disabled }) });

  const combinedRef = useSortableImperativeRef(
    setNodeRef,
    transform,
    transition,
  );

  const itemFields = itemField.getFieldset();

  return (
    <div
      ref={combinedRef}
      className={cn(
        "flex items-center gap-2 rounded border p-2",
        isDragging && "z-50 shadow-lg ring-2 ring-primary/20",
      )}
    >
      <div {...attributes} {...listeners}>
        <DragHandle disabled={disabled} />
      </div>
      <div className="flex-1">
        <Input
          {...getInputProps(itemFields.value, { type: "text" })}
          placeholder="例: 東京メトロ「表参道駅」A1出口より徒歩5分"
          disabled={disabled}
        />
        {itemFields.value.errors && (
          <p className="mt-1 text-sm text-destructive">
            {itemFields.value.errors.join(", ")}
          </p>
        )}
      </div>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`経路 ${index + 1} を削除`}
      >
        削除
      </Button>
    </div>
  );
}
