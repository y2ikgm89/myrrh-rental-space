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
} from "@/admin/components/ui";
import { ImagePlus } from "lucide-react";
import { useSingleMediaPicker } from "@/admin/hooks/use-media-picker";
import { CTAButtonEditor } from "@/admin/components/cta-button-editor";
import {
  heroParallaxConfigSchema,
  parseContentPosition,
  parseOverlayStyle,
  parseHeroParallaxHeight,
  type HeroParallaxConfig,
  type HeroParallaxConfigInput,
  type CTAButtonItem,
} from "@/shared/lib/validations/section";
import { getHeroParallaxConfig } from "@/shared/lib/validations/section-defaults";
import {
  contentPositionLabels,
  overlayStyleLabels,
  heroParallaxHeightLabels,
} from "@/shared/lib/validations/section-options";
import { keysOf, omitUndefined } from "@/shared/lib/serialize";
import { FormActions, type ConfigFormProps } from "./shared";

export default function HeroParallaxConfigForm({
  section,
  onSave,
  isPending,
  onDirtyChange,
}: ConfigFormProps) {
  const config = getHeroParallaxConfig(section.config);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isDirty },
  } = useForm<HeroParallaxConfigInput, unknown, HeroParallaxConfig>({
    resolver: standardSchemaResolver(heroParallaxConfigSchema),
    defaultValues: config,
  });

  const backgroundImageUrl = useWatch({ control, name: "backgroundImageUrl" });

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
          <Label htmlFor="hero-parallax-tagline">タグライン</Label>
          <Input
            id="hero-parallax-tagline"
            {...register("tagline")}
            placeholder="Luxury Rental Space"
            disabled={isPending}
          />
          {errors.tagline && (
            <p className="text-sm text-destructive">{errors.tagline.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="hero-parallax-title">タイトル</Label>
          <Input
            id="hero-parallax-title"
            {...register("title")}
            placeholder="洗練された空間で 特別なひとときを"
            disabled={isPending}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="hero-parallax-subtitle">サブタイトル</Label>
          <Input
            id="hero-parallax-subtitle"
            {...register("subtitle")}
            placeholder="厳選されたレンタルスペースが、あなたの大切な瞬間を彩ります。"
            disabled={isPending}
          />
          {errors.subtitle && (
            <p className="text-sm text-destructive">
              {errors.subtitle.message}
            </p>
          )}
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
            <Label htmlFor="hero-parallax-content-position">
              コンテンツ配置
            </Label>
            <Select
              defaultValue={config.contentPosition}
              onValueChange={(v) =>
                setValue("contentPosition", parseContentPosition(v))
              }
              disabled={isPending}
            >
              <SelectTrigger id="hero-parallax-content-position">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(contentPositionLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {contentPositionLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hero-parallax-height">高さ</Label>
            <Select
              defaultValue={config.height}
              onValueChange={(v) =>
                setValue("height", parseHeroParallaxHeight(v))
              }
              disabled={isPending}
            >
              <SelectTrigger id="hero-parallax-height">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(heroParallaxHeightLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {heroParallaxHeightLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hero-parallax-overlay-style">オーバーレイ</Label>
            <Select
              defaultValue={config.overlayStyle}
              onValueChange={(v) =>
                setValue("overlayStyle", parseOverlayStyle(v))
              }
              disabled={isPending}
            >
              <SelectTrigger id="hero-parallax-overlay-style">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(overlayStyleLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {overlayStyleLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="hero-parallax-speed">パララックス速度（0〜1）</Label>
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

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Switch
              id="hero-parallax-overlay-gradient"
              checked={config.overlayGradient}
              onCheckedChange={(checked) =>
                setValue("overlayGradient", checked)
              }
              disabled={isPending}
            />
            <Label htmlFor="hero-parallax-overlay-gradient">
              オーバーレイグラデーション
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="hero-parallax-scroll-indicator"
              checked={config.scrollIndicator}
              onCheckedChange={(checked) =>
                setValue("scrollIndicator", checked)
              }
              disabled={isPending}
            />
            <Label htmlFor="hero-parallax-scroll-indicator">
              スクロールインジケーター
            </Label>
          </div>
        </div>

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
