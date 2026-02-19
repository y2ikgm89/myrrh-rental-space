"use client";

import { useState } from "react";
import Image from "next/image";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Input,
  Label,
  Switch,
  Textarea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import { Save, ImagePlus } from "lucide-react";
import { keysOf } from "@/shared/lib/serialize";
import { useSingleMediaPicker } from "@/admin/hooks/use-media-picker";
import { CTAButtonEditor } from "@/admin/components/cta-button-editor";
import {
  heroParallaxConfigSchema,
  parseContentPosition,
  parseHeroParallaxHeight,
  parseOverlayStyle,
  type HeroParallaxConfig,
  type HeroParallaxConfigInput,
  type CTAButtonItem,
} from "@/admin/lib/validations/homepage-section";
import {
  contentPositionLabels,
  heroParallaxHeightLabels,
  overlayStyleLabels,
} from "@/shared/lib/validations/section-options";

export function HeroParallaxConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: HeroParallaxConfig;
  onSave: (config: HeroParallaxConfig) => void;
  isPending: boolean;
}) {
  const [buttons, setButtons] = useState<CTAButtonItem[]>(config.buttons);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<HeroParallaxConfigInput, unknown, HeroParallaxConfig>({
    resolver: zodResolver(heroParallaxConfigSchema),
    defaultValues: config,
  });

  const backgroundImageUrl = useWatch({ control, name: "backgroundImageUrl" });

  const bgPicker = useSingleMediaPicker({
    defaultUsage: "GENERAL",
    onSelect: (media) => {
      const selected = media[0];
      if (selected) {
        setValue("backgroundImageUrl", selected.url);
      }
    },
  });

  const handleButtonsChange = (newButtons: CTAButtonItem[]) => {
    setButtons(newButtons);
    setValue("buttons", newButtons);
  };

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
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
          <Textarea
            id="hero-parallax-subtitle"
            {...register("subtitle")}
            placeholder="厳選されたレンタルスペースが、あなたの大切な瞬間を彩ります。"
            rows={2}
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
                <>
                  <p className="truncate text-xs text-muted-foreground">
                    {backgroundImageUrl}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setValue("backgroundImageUrl", "")}
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
          <Label>ボタン</Label>
          <CTAButtonEditor
            buttons={buttons}
            onChange={handleButtonsChange}
            disabled={isPending}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="hero-parallax-position">コンテンツ配置</Label>
            <Select
              defaultValue={config.contentPosition}
              onValueChange={(v) =>
                setValue("contentPosition", parseContentPosition(v))
              }
              disabled={isPending}
            >
              <SelectTrigger id="hero-parallax-position">
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
            <Label htmlFor="hero-parallax-height">セクション高さ</Label>
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
            <Label htmlFor="hero-parallax-overlay-style">
              オーバーレイスタイル
            </Label>
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
          <Label htmlFor="hero-parallax-speed">パララックス速度</Label>
          <Input
            id="hero-parallax-speed"
            type="number"
            step={0.1}
            min={0}
            max={1}
            {...register("parallaxSpeed", { valueAsNumber: true })}
            disabled={isPending}
          />
          <p className="text-xs text-muted-foreground">
            0（効果なし）〜 1（最大）
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="hero-parallax-overlay"
            {...register("overlayGradient")}
            disabled={isPending}
          />
          <Label htmlFor="hero-parallax-overlay">
            オーバーレイグラデーション
          </Label>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="hero-parallax-scroll"
            {...register("scrollIndicator")}
            disabled={isPending}
          />
          <Label htmlFor="hero-parallax-scroll">スクロールインジケーター</Label>
        </div>
      </div>

      <Button type="submit" disabled={isPending}>
        <Save className="h-4 w-4 mr-2" />
        {isPending ? "保存中..." : "保存"}
      </Button>

      {/* メディアピッカーダイアログ */}
      <bgPicker.MediaPicker />
    </form>
  );
}
