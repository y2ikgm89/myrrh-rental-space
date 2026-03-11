"use client";

import { useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
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
  spaceShowcaseConfigSchema,
  parseCardStyle,
  parseShowcaseImageAspect,
  type SpaceShowcaseConfig,
  type SpaceShowcaseConfigInput,
} from "@/admin/lib/validations/homepage-section";
import {
  cardStyleLabels,
  showcaseImageAspectLabels,
} from "@/shared/lib/validations/section-options";

export function SpaceShowcaseConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: SpaceShowcaseConfig;
  onSave: (config: SpaceShowcaseConfig) => void;
  isPending: boolean;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<SpaceShowcaseConfigInput, unknown, SpaceShowcaseConfig>({
    resolver: standardSchemaResolver(spaceShowcaseConfigSchema),
    defaultValues: config,
  });

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="showcase-section-label">
            セクションラベル（英語装飾）
          </Label>
          <Input
            id="showcase-section-label"
            {...register("sectionLabel")}
            placeholder="Spaces"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="showcase-title">タイトル</Label>
          <Input
            id="showcase-title"
            {...register("title")}
            placeholder="Our Spaces"
            disabled={isPending}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="showcase-max">最大表示件数</Label>
          <Input
            id="showcase-max"
            type="number"
            min={1}
            max={12}
            {...register("maxItems", { valueAsNumber: true })}
            disabled={isPending}
          />
          {errors.maxItems && (
            <p className="text-sm text-destructive">
              {errors.maxItems.message}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="showcase-published"
            {...register("showOnlyPublished")}
            disabled={isPending}
          />
          <Label htmlFor="showcase-published">公開済みスペースのみ表示</Label>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="showcase-columns">カラム数</Label>
            <Input
              id="showcase-columns"
              type="number"
              min={2}
              max={4}
              {...register("columns", { valueAsNumber: true })}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="showcase-card-style">カードスタイル</Label>
            <Select
              defaultValue={config.cardStyle}
              onValueChange={(v) => setValue("cardStyle", parseCardStyle(v))}
              disabled={isPending}
            >
              <SelectTrigger id="showcase-card-style">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(cardStyleLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {cardStyleLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="showcase-image-aspect">画像アスペクト比</Label>
            <Select
              defaultValue={config.imageAspect}
              onValueChange={(v) =>
                setValue("imageAspect", parseShowcaseImageAspect(v))
              }
              disabled={isPending}
            >
              <SelectTrigger id="showcase-image-aspect">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(showcaseImageAspectLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {showcaseImageAspectLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <SubmitButton isPending={isPending} label="保存" />
    </form>
  );
}
