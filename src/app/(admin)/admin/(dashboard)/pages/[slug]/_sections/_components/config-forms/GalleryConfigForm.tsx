"use client";

import Image from "next/image";
import { useForm, useWatch } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@/admin/components/ui";
import { Plus, Trash2 } from "lucide-react";
import { useMultipleMediaPicker } from "@/admin/hooks/use-media-picker";
import {
  galleryConfigSchema,
  getGalleryConfig,
  parseGalleryLayout,
  parseGalleryGap,
  parseGalleryImageAspect,
  parseGalleryHoverEffect,
  type GalleryConfig,
  type GalleryConfigInput,
} from "@/shared/lib/validations/section";
import {
  galleryLayoutLabels,
  galleryGapLabels,
  galleryImageAspectLabels,
  galleryHoverEffectLabels,
} from "@/shared/lib/validations/section-options";
import { keysOf } from "@/shared/lib/serialize";
import { FormActions, type ConfigFormProps } from "./shared";

export default function GalleryConfigForm({
  section,
  onSave,
  isPending,
  onDirtyChange,
}: ConfigFormProps) {
  const config = getGalleryConfig(section.config);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { isDirty },
  } = useForm<GalleryConfigInput, unknown, GalleryConfig>({
    resolver: standardSchemaResolver(galleryConfigSchema),
    defaultValues: config,
  });

  const images = useWatch({ control, name: "images" }) ?? [];

  const imagePicker = useMultipleMediaPicker({
    defaultUsage: "GENERAL",
    maxSelections: 20,
    onSelect: (media) => {
      const newImages = media.map((m) => ({
        url: m.url,
        alt: m.alt ?? "",
        caption: "",
      }));
      setValue("images", [...images, ...newImages]);
    },
  });

  const removeImage = (index: number) => {
    const updated = images.filter((_, i) => i !== index);
    setValue("images", updated);
  };

  const handleFormSave = handleSubmit((data) => {
    onSave({ config: data });
  });

  return (
    <form onSubmit={handleFormSave} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="gallery-section-label">
            セクションラベル（英語装飾）
          </Label>
          <Input
            id="gallery-section-label"
            {...register("sectionLabel")}
            placeholder="例: Gallery"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="gallery-title">タイトル（任意）</Label>
          <Input
            id="gallery-title"
            {...register("title")}
            placeholder="ギャラリー"
            disabled={isPending}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="gallery-layout">レイアウト</Label>
            <Select
              defaultValue={config.layout}
              onValueChange={(v) => setValue("layout", parseGalleryLayout(v))}
              disabled={isPending}
            >
              <SelectTrigger id="gallery-layout">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(galleryLayoutLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {galleryLayoutLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gallery-columns">カラム数</Label>
            <Input
              id="gallery-columns"
              type="number"
              min={1}
              max={6}
              {...register("columns", { valueAsNumber: true })}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="gallery-gap">間隔</Label>
            <Select
              defaultValue={config.gap}
              onValueChange={(v) => setValue("gap", parseGalleryGap(v))}
              disabled={isPending}
            >
              <SelectTrigger id="gallery-gap">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(galleryGapLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {galleryGapLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="gallery-image-aspect">画像比率</Label>
            <Select
              defaultValue={config.imageAspect}
              onValueChange={(v) =>
                setValue("imageAspect", parseGalleryImageAspect(v))
              }
              disabled={isPending}
            >
              <SelectTrigger id="gallery-image-aspect">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(galleryImageAspectLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {galleryImageAspectLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gallery-hover-effect">ホバーエフェクト</Label>
            <Select
              defaultValue={config.hoverEffect}
              onValueChange={(v) =>
                setValue("hoverEffect", parseGalleryHoverEffect(v))
              }
              disabled={isPending}
            >
              <SelectTrigger id="gallery-hover-effect">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(galleryHoverEffectLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {galleryHoverEffectLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="gallery-lightbox"
            checked={config.enableLightbox}
            onCheckedChange={(checked) => setValue("enableLightbox", checked)}
            disabled={isPending}
          />
          <Label htmlFor="gallery-lightbox">ライトボックスを有効化</Label>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>画像</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => imagePicker.openPicker()}
              disabled={isPending}
            >
              <Plus className="h-3 w-3 mr-1" />
              画像を追加
            </Button>
          </div>
          {images.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {images.map((img, index) => (
                <div
                  key={img.url}
                  className="group relative aspect-square overflow-hidden rounded-lg border"
                >
                  <Image
                    src={img.url}
                    alt={img.alt ?? ""}
                    fill
                    className="object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute top-1 right-1 p-1 rounded-full bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 border border-dashed rounded-lg">
              <p className="text-sm text-muted-foreground">
                画像が追加されていません
              </p>
            </div>
          )}
        </div>
      </div>

      <FormActions
        isDirty={isDirty}
        isPending={isPending}
        onDirtyChange={onDirtyChange}
      />

      {imagePicker.mediaPickerDialog}
    </form>
  );
}
