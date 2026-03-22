"use client";

import { useForm, useWatch } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
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
  spaceListConfigSchema,
  parseSpaceLayout,
  parseCardStyle,
  parseSpaceImageAspect,
  type SpaceListConfig,
  type SpaceListConfigInput,
} from "@/shared/lib/validations/section";
import {
  getSpaceListConfig,
} from "@/shared/lib/validations/section-defaults";
import {
  cardStyleLabels,
  spaceLayoutLabels,
  spaceImageAspectLabels,
} from "@/shared/lib/validations/section-options";
import { keysOf } from "@/shared/lib/serialize";
import { FormActions, type ConfigFormProps } from "./shared";

export default function SpaceListConfigForm({
  section,
  onSave,
  isPending,
  onDirtyChange,
}: ConfigFormProps) {
  const config = getSpaceListConfig(section.config);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isDirty },
  } = useForm<SpaceListConfigInput, unknown, SpaceListConfig>({
    resolver: standardSchemaResolver(spaceListConfigSchema),
    defaultValues: config,
  });

  const showViewAllLink = useWatch({ control, name: "showViewAllLink" });

  return (
    <form
      onSubmit={handleSubmit((data) => onSave({ config: data }))}
      className="space-y-6"
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="space-section-label">
            セクションラベル（英語装飾）
          </Label>
          <Input
            id="space-section-label"
            {...register("sectionLabel")}
            placeholder="例: Spaces"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="space-title">タイトル</Label>
          <Input
            id="space-title"
            {...register("title")}
            placeholder="スペース一覧"
            disabled={isPending}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="space-max">最大表示件数</Label>
            <Input
              id="space-max"
              type="number"
              min={1}
              max={24}
              {...register("maxItems", { valueAsNumber: true })}
              disabled={isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="space-columns">カラム数</Label>
            <Input
              id="space-columns"
              type="number"
              min={1}
              max={4}
              {...register("columns", { valueAsNumber: true })}
              disabled={isPending}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="space-layout">レイアウト</Label>
          <Select
            defaultValue={config.layout}
            onValueChange={(v) => setValue("layout", parseSpaceLayout(v))}
            disabled={isPending}
          >
            <SelectTrigger id="space-layout">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {keysOf(spaceLayoutLabels).map((key) => (
                <SelectItem key={key} value={key}>
                  {spaceLayoutLabels[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="space-card-style">カードスタイル</Label>
            <Select
              defaultValue={config.cardStyle}
              onValueChange={(v) => setValue("cardStyle", parseCardStyle(v))}
              disabled={isPending}
            >
              <SelectTrigger id="space-card-style">
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
            <Label htmlFor="space-image-aspect">画像比率</Label>
            <Select
              defaultValue={config.imageAspect}
              onValueChange={(v) =>
                setValue("imageAspect", parseSpaceImageAspect(v))
              }
              disabled={isPending}
            >
              <SelectTrigger id="space-image-aspect">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(spaceImageAspectLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {spaceImageAspectLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Switch
              id="space-published"
              checked={config.showOnlyPublished}
              onCheckedChange={(checked) =>
                setValue("showOnlyPublished", checked)
              }
              disabled={isPending}
            />
            <Label htmlFor="space-published">公開済みのみ表示</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="space-view-all"
              checked={config.showViewAllLink}
              onCheckedChange={(checked) =>
                setValue("showViewAllLink", checked)
              }
              disabled={isPending}
            />
            <Label htmlFor="space-view-all">「すべて見る」リンクを表示</Label>
          </div>
        </div>

        {showViewAllLink && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="space-view-all-text">「全て見る」テキスト</Label>
              <Input
                id="space-view-all-text"
                {...register("viewAllText")}
                placeholder="全てのスペースを見る"
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="space-view-all-url">「全て見る」リンク先</Label>
              <Input
                id="space-view-all-url"
                {...register("viewAllUrl")}
                placeholder="/spaces"
                disabled={isPending}
              />
            </div>
          </div>
        )}
      </div>

      <FormActions
        isDirty={isDirty}
        isPending={isPending}
        onDirtyChange={onDirtyChange}
      />
    </form>
  );
}
