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
  postListConfigSchema,
  getPostListConfig,
  parsePostLayout,
  parsePostImageAspect,
  type PostListConfig,
  type PostListConfigInput,
} from "@/shared/lib/validations/section";
import {
  postLayoutLabels,
  postImageAspectLabels,
} from "@/shared/lib/validations/section-options";
import { keysOf } from "@/shared/lib/serialize";
import { FormActions, type ConfigFormProps } from "./shared";

export default function PostListConfigForm({
  section,
  onSave,
  isPending,
  onDirtyChange,
}: ConfigFormProps) {
  const config = getPostListConfig(section.config);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isDirty },
  } = useForm<PostListConfigInput, unknown, PostListConfig>({
    resolver: standardSchemaResolver(postListConfigSchema),
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
          <Label htmlFor="post-section-label">
            セクションラベル（英語装飾）
          </Label>
          <Input
            id="post-section-label"
            {...register("sectionLabel")}
            placeholder="例: Blog"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="post-title">タイトル</Label>
          <Input
            id="post-title"
            {...register("title")}
            placeholder="最新の記事"
            disabled={isPending}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="post-max">表示件数</Label>
            <Input
              id="post-max"
              type="number"
              min={1}
              max={20}
              {...register("maxItems", { valueAsNumber: true })}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="post-columns">カラム数</Label>
            <Input
              id="post-columns"
              type="number"
              min={1}
              max={4}
              {...register("columns", { valueAsNumber: true })}
              disabled={isPending}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="post-layout">レイアウト</Label>
          <Select
            defaultValue={config.layout}
            onValueChange={(v) => setValue("layout", parsePostLayout(v))}
            disabled={isPending}
          >
            <SelectTrigger id="post-layout">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {keysOf(postLayoutLabels).map((key) => (
                <SelectItem key={key} value={key}>
                  {postLayoutLabels[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="post-image-aspect">画像比率</Label>
          <Select
            defaultValue={config.imageAspect}
            onValueChange={(v) =>
              setValue("imageAspect", parsePostImageAspect(v))
            }
            disabled={isPending}
          >
            <SelectTrigger id="post-image-aspect">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {keysOf(postImageAspectLabels).map((key) => (
                <SelectItem key={key} value={key}>
                  {postImageAspectLabels[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="post-view-all"
            checked={config.showViewAllLink}
            onCheckedChange={(checked) => setValue("showViewAllLink", checked)}
            disabled={isPending}
          />
          <Label htmlFor="post-view-all">「すべて見る」リンクを表示</Label>
        </div>

        {showViewAllLink && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="post-view-all-text">「全て見る」テキスト</Label>
              <Input
                id="post-view-all-text"
                {...register("viewAllText")}
                placeholder="全ての記事"
                disabled={isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="post-view-all-url">「全て見る」リンク先</Label>
              <Input
                id="post-view-all-url"
                {...register("viewAllUrl")}
                placeholder="/posts"
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
