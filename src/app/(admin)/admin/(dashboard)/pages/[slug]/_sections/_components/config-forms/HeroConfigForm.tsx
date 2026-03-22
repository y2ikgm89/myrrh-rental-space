"use client";

import Image from "next/image";
import { useState } from "react";
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
  Textarea,
} from "@/admin/components/ui";
import { ImagePlus } from "lucide-react";
import { useSingleMediaPicker } from "@/admin/hooks/use-media-picker";
import { CTAButtonEditor } from "@/admin/components/cta-button-editor";
import {
  heroConfigSchema,
  parseHeroHeight,
  parseHeroVariant,
  type HeroConfig,
  type HeroConfigInput,
  type CTAButtonItem,
} from "@/shared/lib/validations/section";
import {
  getHeroConfig,
} from "@/shared/lib/validations/section-defaults";
import {
  heroVariantLabels,
  heroHeightLabels,
} from "@/shared/lib/validations/section-options";
import { keysOf, omitUndefined } from "@/shared/lib/serialize";
import { FormActions, type ConfigFormProps } from "./shared";

export default function HeroConfigForm({
  section,
  onSave,
  isPending,
  onDirtyChange,
}: ConfigFormProps) {
  const config = getHeroConfig(section.config);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isDirty },
  } = useForm<HeroConfigInput, unknown, HeroConfig>({
    resolver: standardSchemaResolver(heroConfigSchema),
    defaultValues: config,
  });

  const backgroundImageUrl = useWatch({ control, name: "backgroundImageUrl" });
  const variant = useWatch({ control, name: "variant" });

  const [buttons, setButtons] = useState<CTAButtonItem[]>(
    config.buttons.map((b) => omitUndefined(b)),
  );
  const handleButtonsChange = (newButtons: CTAButtonItem[]) => {
    setButtons(newButtons);
    setValue("buttons", newButtons);
  };

  const bgPicker = useSingleMediaPicker({
    defaultUsage: "GENERAL",
    onSelect: (media) => {
      const selected = media[0];
      if (selected) {
        setValue("backgroundImageUrl", selected.url);
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
          <Label htmlFor="hero-title">タイトル（任意）</Label>
          <Input
            id="hero-title"
            {...register("title")}
            placeholder="ページのメインタイトル"
            disabled={isPending}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="hero-subtitle">サブタイトル（任意）</Label>
          <Textarea
            id="hero-subtitle"
            {...register("subtitle")}
            placeholder="サブタイトルを入力"
            rows={2}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label>背景画像（任意）</Label>
          <div className="flex items-start gap-3">
            {backgroundImageUrl ? (
              <div className="relative h-20 w-36 shrink-0 overflow-hidden rounded-lg border">
                <Image
                  src={backgroundImageUrl}
                  alt="背景画像"
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
                onClick={() => bgPicker.openPicker()}
                disabled={isPending}
              >
                <ImagePlus className="mr-1 h-3 w-3" />
                画像を選択
              </Button>
              {backgroundImageUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setValue("backgroundImageUrl", "")}
                  disabled={isPending}
                >
                  削除
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="hero-variant">バリエーション</Label>
            <Select
              defaultValue={config.variant}
              onValueChange={(v) => setValue("variant", parseHeroVariant(v))}
              disabled={isPending}
            >
              <SelectTrigger id="hero-variant">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(heroVariantLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {heroVariantLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hero-height">高さ</Label>
            <Select
              defaultValue={config.height}
              onValueChange={(v) => setValue("height", parseHeroHeight(v))}
              disabled={isPending}
            >
              <SelectTrigger id="hero-height">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(heroHeightLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {heroHeightLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hero-overlay-opacity">オーバーレイ透過度</Label>
            <Input
              id="hero-overlay-opacity"
              type="number"
              min={0}
              max={100}
              {...register("overlayOpacity", { valueAsNumber: true })}
              disabled={isPending}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="hero-overlay"
            checked={config.overlay}
            onCheckedChange={(checked) => setValue("overlay", checked)}
            disabled={isPending}
          />
          <Label htmlFor="hero-overlay">オーバーレイを表示</Label>
        </div>

        {variant === "video" && (
          <div className="space-y-2">
            <Label htmlFor="hero-video-url">動画URL</Label>
            <Input
              id="hero-video-url"
              {...register("videoUrl")}
              placeholder="https://..."
              disabled={isPending}
            />
          </div>
        )}
        {variant === "parallax" && (
          <div className="space-y-2">
            <Label htmlFor="hero-parallax-speed">パララックス速度</Label>
            <Input
              id="hero-parallax-speed"
              type="number"
              min={0}
              max={1}
              step={0.1}
              {...register("parallaxSpeed", { valueAsNumber: true })}
              disabled={isPending}
            />
          </div>
        )}

        <div className="space-y-2">
          <Label>ボタン</Label>
          <CTAButtonEditor
            buttons={buttons}
            onChange={handleButtonsChange}
            disabled={isPending}
          />
        </div>
      </div>

      <FormActions
        isDirty={isDirty}
        isPending={isPending}
        onDirtyChange={onDirtyChange}
      />
      {bgPicker.mediaPickerDialog}
    </form>
  );
}
