"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@/admin/components/ui";
import {
  spaceShowcaseConfigSchema,
  getSpaceShowcaseConfig,
  parseCardStyle,
  parseShowcaseImageAspect,
  type SpaceShowcaseConfig,
  type SpaceShowcaseConfigInput,
} from "@/shared/lib/validations/section";
import {
  cardStyleLabels,
  showcaseImageAspectLabels,
} from "@/shared/lib/validations/section-options";
import { keysOf } from "@/shared/lib/serialize";
import { FormActions, type ConfigFormProps } from "./shared";

export default function SpaceShowcaseConfigForm({
  section,
  onSave,
  isPending,
  onDirtyChange,
}: ConfigFormProps) {
  const config = getSpaceShowcaseConfig(section.config);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isDirty },
  } = useForm<SpaceShowcaseConfigInput, unknown, SpaceShowcaseConfig>({
    resolver: zodResolver(spaceShowcaseConfigSchema),
    defaultValues: config,
  });

  return (
    <form
      onSubmit={handleSubmit((data) => onSave({ config: data }))}
      className="space-y-6"
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="showcase-section-label">
            セクションラベル（英語装飾）
          </Label>
          <Input
            id="showcase-section-label"
            {...register("sectionLabel")}
            placeholder="例: Spaces"
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

        <div className="grid gap-4 sm:grid-cols-2">
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
          </div>

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
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
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

        <div className="flex items-center gap-2">
          <Switch
            id="showcase-published"
            checked={config.showOnlyPublished}
            onCheckedChange={(checked) =>
              setValue("showOnlyPublished", checked)
            }
            disabled={isPending}
          />
          <Label htmlFor="showcase-published">公開済みのみ表示</Label>
        </div>
      </div>

      <FormActions
        isDirty={isDirty}
        isPending={isPending}
        onDirtyChange={onDirtyChange}
      />
    </form>
  );
}
