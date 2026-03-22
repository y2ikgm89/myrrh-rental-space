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
  Textarea,
} from "@/admin/components/ui";
import { ImagePlus } from "lucide-react";
import { useSingleMediaPicker } from "@/admin/hooks/use-media-picker";
import {
  conceptConfigSchema,
  parseConceptLayout,
  parseImageAspect,
  parseImagePosition,
  parseTextAlign,
  type ConceptConfig,
  type ConceptConfigInput,
} from "@/shared/lib/validations/section";
import {
  getConceptConfig,
} from "@/shared/lib/validations/section-defaults";
import {
  conceptLayoutLabels,
  imageAspectLabels,
  imagePositionLabels,
  textAlignLabels,
} from "@/shared/lib/validations/section-options";
import { keysOf } from "@/shared/lib/serialize";
import { FormActions, type ConfigFormProps } from "./shared";

export default function ConceptConfigForm({
  section,
  onSave,
  isPending,
  onDirtyChange,
}: ConfigFormProps) {
  const config = getConceptConfig(section.config);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isDirty },
  } = useForm<ConceptConfigInput, unknown, ConceptConfig>({
    resolver: standardSchemaResolver(conceptConfigSchema),
    defaultValues: config,
  });

  const imageUrl = useWatch({ control, name: "imageUrl" });

  const imagePicker = useSingleMediaPicker({
    defaultUsage: "GENERAL",
    onSelect: (media) => {
      const selected = media[0];
      if (selected) {
        setValue("imageUrl", selected.url);
      }
    },
  });

  return (
    <form
      onSubmit={handleSubmit((data) => onSave({ config: data }))}
      className="space-y-6"
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="concept-section-label">
            セクションラベル（英語装飾）
          </Label>
          <Input
            id="concept-section-label"
            {...register("sectionLabel")}
            placeholder="例: Our Philosophy"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="concept-heading">見出し</Label>
          <Input
            id="concept-heading"
            {...register("heading")}
            placeholder="空間が、体験を変える"
            disabled={isPending}
          />
          {errors.heading && (
            <p className="text-sm text-destructive">{errors.heading.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="concept-body">本文</Label>
          <Textarea
            id="concept-body"
            {...register("body")}
            placeholder="コンセプトの説明文を入力..."
            rows={5}
            disabled={isPending}
          />
          {errors.body && (
            <p className="text-sm text-destructive">{errors.body.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>画像（任意）</Label>
          <div className="flex items-start gap-3">
            {imageUrl ? (
              <div className="relative h-20 w-36 shrink-0 overflow-hidden rounded-lg border">
                <Image
                  src={imageUrl}
                  alt="コンセプト画像"
                  fill
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="flex h-20 w-36 shrink-0 items-center justify-center rounded-lg border border-dashed bg-muted">
                <ImagePlus className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 space-y-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => imagePicker.openPicker()}
                disabled={isPending}
              >
                <ImagePlus className="mr-1 h-3 w-3" />
                画像を選択
              </Button>
              {imageUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setValue("imageUrl", "")}
                  disabled={isPending}
                >
                  削除
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="concept-layout">レイアウト</Label>
            <Select
              defaultValue={config.layout}
              onValueChange={(v) => setValue("layout", parseConceptLayout(v))}
              disabled={isPending}
            >
              <SelectTrigger id="concept-layout">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(conceptLayoutLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {conceptLayoutLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="concept-image-aspect">画像アスペクト比</Label>
            <Select
              defaultValue={config.imageAspect}
              onValueChange={(v) =>
                setValue("imageAspect", parseImageAspect(v))
              }
              disabled={isPending}
            >
              <SelectTrigger id="concept-image-aspect">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(imageAspectLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {imageAspectLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="concept-image-position">画像配置</Label>
            <Select
              defaultValue={config.imagePosition}
              onValueChange={(v) =>
                setValue("imagePosition", parseImagePosition(v))
              }
              disabled={isPending}
            >
              <SelectTrigger id="concept-image-position">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(imagePositionLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {imagePositionLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="concept-text-align">テキスト配置</Label>
            <Select
              defaultValue={config.textAlign}
              onValueChange={(v) => setValue("textAlign", parseTextAlign(v))}
              disabled={isPending}
            >
              <SelectTrigger id="concept-text-align">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(textAlignLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {textAlignLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
