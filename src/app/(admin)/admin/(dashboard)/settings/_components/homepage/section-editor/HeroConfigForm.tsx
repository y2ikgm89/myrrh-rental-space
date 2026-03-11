"use client";

import { useState } from "react";
import Image from "next/image";
import { useForm, useWatch } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
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
  SubmitButton,
} from "@/admin/components/ui";
import { ImagePlus } from "lucide-react";
import { keysOf, omitUndefined } from "@/shared/lib/serialize";
import { useSingleMediaPicker } from "@/admin/hooks/use-media-picker";
import { CTAButtonEditor } from "@/admin/components/cta-button-editor";
import {
  heroConfigSchema,
  parseHeroVariant,
  parseHeroHeight,
  type HeroConfig,
  type HeroConfigInput,
  type CTAButtonItem,
} from "@/admin/lib/validations/homepage-section";
import {
  heroVariantLabels,
  heroHeightLabels,
} from "@/shared/lib/validations/section-options";

export function HeroConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: HeroConfig;
  onSave: (config: HeroConfig) => void;
  isPending: boolean;
}) {
  const [buttons, setButtons] = useState<CTAButtonItem[]>(
    config.buttons.map((b) => omitUndefined(b)),
  );

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<HeroConfigInput, unknown, HeroConfig>({
    resolver: standardSchemaResolver(heroConfigSchema),
    defaultValues: config,
  });

  const backgroundImageUrl = useWatch({ control, name: "backgroundImageUrl" });
  const variant = useWatch({ control, name: "variant" });
  const overlay = useWatch({ control, name: "overlay" });

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
          <Label htmlFor="hero-title">タイトル</Label>
          <Input
            id="hero-title"
            {...register("title")}
            placeholder="理想のスペースを、あなたに。"
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

        <div className="grid gap-4 sm:grid-cols-2">
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
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="hero-overlay"
            checked={overlay ?? false}
            onCheckedChange={(checked) => setValue("overlay", checked)}
            disabled={isPending}
          />
          <Label htmlFor="hero-overlay">オーバーレイ</Label>
        </div>

        <div className="space-y-2">
          <Label htmlFor="hero-overlay-opacity">
            オーバーレイ不透明度（%）
          </Label>
          <Input
            id="hero-overlay-opacity"
            type="number"
            min={0}
            max={100}
            {...register("overlayOpacity", { valueAsNumber: true })}
            disabled={isPending}
          />
        </div>

        {variant === "video" && (
          <div className="space-y-2">
            <Label htmlFor="hero-video-url">動画URL</Label>
            <Input
              id="hero-video-url"
              {...register("videoUrl")}
              placeholder="https://example.com/video.mp4"
              disabled={isPending}
            />
          </div>
        )}

        {variant === "parallax" && (
          <div className="space-y-2">
            <Label htmlFor="hero-parallax-speed-inline">パララックス速度</Label>
            <Input
              id="hero-parallax-speed-inline"
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

      <SubmitButton isPending={isPending} label="保存" />

      {/* メディアピッカーダイアログ */}
      <bgPicker.MediaPicker />
    </form>
  );
}
