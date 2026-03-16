"use client";

import Image from "next/image";
import { useForm, useWatch } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import {
  Button,
  Input,
  Label,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SubmitButton,
} from "@/admin/components/ui";
import { ImagePlus } from "lucide-react";
import { keysOf } from "@/shared/lib/serialize";
import { useSingleMediaPicker } from "@/admin/hooks/use-media-picker";
import {
  conceptConfigSchema,
  parseConceptLayout,
  parseImageAspect,
  type ConceptConfig,
  type ConceptConfigInput,
} from "@/admin/lib/validations/homepage-section";
import {
  conceptLayoutLabels,
  imageAspectLabels,
} from "@/shared/lib/validations/section-options";

export function ConceptConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: ConceptConfig;
  onSave: (config: ConceptConfig) => void;
  isPending: boolean;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<ConceptConfigInput, unknown, ConceptConfig>({
    resolver: standardSchemaResolver(conceptConfigSchema),
    defaultValues: config,
  });

  const imageUrl = useWatch({ control, name: "imageUrl" });
  const imagePosition = useWatch({ control, name: "imagePosition" });
  const textAlign = useWatch({ control, name: "textAlign" });

  const imgPicker = useSingleMediaPicker({
    defaultUsage: "GENERAL",
    onSelect: (media) => {
      const selected = media[0];
      if (selected) {
        setValue("imageUrl", selected.url);
      }
    },
  });

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="concept-section-label">
            セクションラベル（英語装飾）
          </Label>
          <Input
            id="concept-section-label"
            {...register("sectionLabel")}
            placeholder="Our Philosophy"
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
            placeholder="コンセプトの本文を入力..."
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
                onClick={() => imgPicker.openPicker()}
                disabled={isPending}
              >
                <ImagePlus className="mr-1 h-3 w-3" />
                画像を選択
              </Button>
              {imageUrl && (
                <>
                  <p className="truncate text-xs text-muted-foreground">
                    {imageUrl}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setValue("imageUrl", "")}
                    disabled={isPending}
                  >
                    削除
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>画像位置</Label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                value="left"
                checked={imagePosition === "left"}
                onChange={() => setValue("imagePosition", "left")}
                disabled={isPending}
              />
              左
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                value="right"
                checked={imagePosition === "right"}
                onChange={() => setValue("imagePosition", "right")}
                disabled={isPending}
              />
              右
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <Label>テキスト配置</Label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                value="left"
                checked={textAlign === "left"}
                onChange={() => setValue("textAlign", "left")}
                disabled={isPending}
              />
              左寄せ
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                value="center"
                checked={textAlign === "center"}
                onChange={() => setValue("textAlign", "center")}
                disabled={isPending}
              />
              中央
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                value="right"
                checked={textAlign === "right"}
                onChange={() => setValue("textAlign", "right")}
                disabled={isPending}
              />
              右寄せ
            </label>
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
      </div>

      <SubmitButton isPending={isPending} label="保存" />

      {/* メディアピッカーダイアログ */}
      {imgPicker.mediaPickerDialog}
    </form>
  );
}
