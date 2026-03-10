"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Input,
  Label,
  Switch,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SubmitButton,
} from "@/admin/components/ui";

import { keysOf } from "@/shared/lib/serialize";
import {
  galleryConfigSchema,
  parseGalleryLayout,
  parseGalleryGap,
  parseGalleryImageAspect,
  parseGalleryHoverEffect,
  type GalleryConfig,
  type GalleryConfigInput,
} from "@/admin/lib/validations/homepage-section";
import {
  galleryLayoutLabels,
  galleryGapLabels,
  galleryImageAspectLabels,
  galleryHoverEffectLabels,
} from "@/shared/lib/validations/section-options";

export function GalleryConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: GalleryConfig;
  onSave: (config: GalleryConfig) => void;
  isPending: boolean;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<GalleryConfigInput, unknown, GalleryConfig>({
    resolver: zodResolver(galleryConfigSchema),
    defaultValues: config,
  });

  const enableLightbox = useWatch({ control, name: "enableLightbox" });

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="gallery-section-label">
            セクションラベル（英語装飾）
          </Label>
          <Input
            id="gallery-section-label"
            {...register("sectionLabel")}
            placeholder="Gallery"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="gallery-title">タイトル</Label>
          <Input
            id="gallery-title"
            {...register("title")}
            placeholder="ギャラリー"
            disabled={isPending}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
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
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="gallery-gap">ギャップ</Label>
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

          <div className="space-y-2">
            <Label htmlFor="gallery-image-aspect">画像アスペクト比</Label>
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

        <div className="flex items-center gap-2">
          <Switch
            id="gallery-lightbox"
            checked={enableLightbox ?? false}
            onCheckedChange={(checked) => setValue("enableLightbox", checked)}
            disabled={isPending}
          />
          <Label htmlFor="gallery-lightbox">ライトボックスを有効化</Label>
        </div>
      </div>

      <SubmitButton isPending={isPending} label="保存" />
    </form>
  );
}
