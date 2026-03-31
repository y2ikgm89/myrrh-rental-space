"use client";

import type { DndContextProps } from "@dnd-kit/core";
import Image from "next/image";
import type { Control, FieldArrayWithId, FieldErrors } from "react-hook-form";
import { useWatch } from "react-hook-form";
import { IconPhotoPlus } from "@tabler/icons-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  TabsContent,
  DndContext,
  closestCenter,
  SortableContext,
  verticalListSortingStrategy,
  type DragEndEvent,
} from "@/admin/components/ui";
import type { SpaceEditFormData } from "../schema";
import { SortableImageItem } from "../sortable-image-item";

type SpaceEditMediaTabPanelProps = {
  control: Control<SpaceEditFormData>;
  errors: FieldErrors<SpaceEditFormData>;
  isPending: boolean;
  dndContextId: string;
  sensors: NonNullable<DndContextProps["sensors"]>;
  imageFields: FieldArrayWithId<SpaceEditFormData, "imageUrls", "id">[];
  onImageDragEnd: (event: DragEndEvent) => void;
  onRemoveImage: (index: number) => void;
  mainImagePicker: {
    openPicker: () => void;
  };
  additionalImagesPicker: {
    openPicker: () => void;
  };
};

export function SpaceEditMediaTabPanel({
  control,
  errors,
  isPending,
  dndContextId,
  sensors,
  imageFields,
  onImageDragEnd,
  onRemoveImage,
  mainImagePicker,
  additionalImagesPicker,
}: SpaceEditMediaTabPanelProps) {
  const mainImageUrl = useWatch({ control, name: "mainImageUrl" });

  return (
    <TabsContent
      value="media"
      forceMount
      className="data-[state=inactive]:hidden"
    >
      <Card>
        <CardHeader>
          <CardTitle>画像設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>メイン画像 *</Label>
            <div className="flex items-start gap-4">
              {mainImageUrl ? (
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border">
                  <Image
                    src={mainImageUrl}
                    alt="メイン画像"
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg border border-dashed bg-muted">
                  <IconPhotoPlus className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => mainImagePicker.openPicker()}
                  disabled={isPending}
                >
                  <IconPhotoPlus className="mr-2 h-4 w-4" />
                  画像を選択
                </Button>
                {mainImageUrl && (
                  <p className="truncate text-xs text-muted-foreground">
                    {mainImageUrl}
                  </p>
                )}
              </div>
            </div>
            {errors.mainImageUrl && (
              <p className="text-sm text-destructive">
                {errors.mainImageUrl.message}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>追加画像（最大10枚）</Label>
              <span className="text-sm text-muted-foreground">
                {imageFields.length} / 10 枚
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => additionalImagesPicker.openPicker()}
              disabled={isPending || imageFields.length >= 10}
            >
              <IconPhotoPlus className="mr-2 h-4 w-4" />
              画像を追加
            </Button>
            {imageFields.length > 0 && (
              <>
                <p className="text-xs text-muted-foreground">
                  ドラッグ&ドロップで順序を変更できます
                </p>
                <DndContext
                  id={dndContextId}
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={onImageDragEnd}
                >
                  <SortableContext
                    items={imageFields.map((f) => f.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {imageFields.map((field, index) => (
                        <SortableImageItem
                          key={field.id}
                          id={field.id}
                          url={field.url}
                          index={index}
                          onRemove={onRemoveImage}
                          disabled={isPending}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
