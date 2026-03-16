"use client";

import Image from "next/image";
import { useState } from "react";
import { useForm, useWatch, useFieldArray } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import {
  Button,
  Card,
  CardContent,
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
import { ImagePlus, Plus, Trash2, Star } from "lucide-react";
import { useSingleMediaPicker } from "@/admin/hooks/use-media-picker";
import {
  testimonialConfigSchema,
  getTestimonialConfig,
  parseTestimonialLayout,
  parseTestimonialVariant,
  type TestimonialConfig,
  type TestimonialConfigInput,
} from "@/shared/lib/validations/section";
import {
  testimonialLayoutLabels,
  testimonialVariantLabels,
} from "@/shared/lib/validations/section-options";
import { keysOf } from "@/shared/lib/serialize";
import { FormActions, type ConfigFormProps } from "./shared";

export default function TestimonialConfigForm({
  section,
  onSave,
  isPending,
  onDirtyChange,
}: ConfigFormProps) {
  const config = getTestimonialConfig(section.config);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { isDirty },
  } = useForm<TestimonialConfigInput, unknown, TestimonialConfig>({
    resolver: standardSchemaResolver(testimonialConfigSchema),
    defaultValues: config,
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items",
  });

  const watchedItems = useWatch({ control, name: "items" });

  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null);

  const authorImagePicker = useSingleMediaPicker({
    defaultUsage: "GENERAL",
    onSelect: (media) => {
      const selected = media[0];
      if (activeImageIndex !== null && selected) {
        setValue(`items.${activeImageIndex}.authorImageUrl`, selected.url);
      }
      setActiveImageIndex(null);
    },
  });

  const handleFormSave = handleSubmit((data) => {
    onSave({ config: data });
  });

  return (
    <form onSubmit={handleFormSave} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="testimonial-section-label">
            セクションラベル（英語装飾）
          </Label>
          <Input
            id="testimonial-section-label"
            {...register("sectionLabel")}
            placeholder="例: Testimonials"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="testimonial-title">タイトル</Label>
          <Input
            id="testimonial-title"
            {...register("title")}
            placeholder="お客様の声"
            disabled={isPending}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="testimonial-layout">レイアウト</Label>
            <Select
              defaultValue={config.layout}
              onValueChange={(v) =>
                setValue("layout", parseTestimonialLayout(v))
              }
              disabled={isPending}
            >
              <SelectTrigger id="testimonial-layout">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(testimonialLayoutLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {testimonialLayoutLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="testimonial-variant">バリエーション</Label>
            <Select
              defaultValue={config.variant}
              onValueChange={(v) =>
                setValue("variant", parseTestimonialVariant(v))
              }
              disabled={isPending}
            >
              <SelectTrigger id="testimonial-variant">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {keysOf(testimonialVariantLabels).map((key) => (
                  <SelectItem key={key} value={key}>
                    {testimonialVariantLabels[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="testimonial-rating"
            checked={config.showRating}
            onCheckedChange={(checked) => setValue("showRating", checked)}
            disabled={isPending}
          />
          <Label htmlFor="testimonial-rating">評価（星）を表示</Label>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>お客様の声</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                append({
                  content: "",
                  authorName: "",
                  authorTitle: "",
                  authorImageUrl: "",
                  rating: 5,
                })
              }
              disabled={isPending}
            >
              <Plus className="h-3 w-3 mr-1" />
              追加
            </Button>
          </div>
          {fields.length === 0 && (
            <div className="flex items-center justify-center py-8 border border-dashed rounded-lg">
              <p className="text-sm text-muted-foreground">
                お客様の声が追加されていません
              </p>
            </div>
          )}
          {fields.map((field, index) => (
            <Card key={field.id}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">#{index + 1}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(index)}
                    disabled={isPending}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>内容</Label>
                  <Textarea
                    {...register(`items.${index}.content`)}
                    placeholder="お客様の声を入力..."
                    rows={3}
                    disabled={isPending}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>お名前</Label>
                    <Input
                      {...register(`items.${index}.authorName`)}
                      placeholder="山田 太郎"
                      disabled={isPending}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>肩書き（任意）</Label>
                    <Input
                      {...register(`items.${index}.authorTitle`)}
                      placeholder="株式会社〇〇 代表"
                      disabled={isPending}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>プロフィール画像（任意）</Label>
                  <div className="flex items-center gap-3">
                    {watchedItems?.[index]?.authorImageUrl ? (
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border">
                        <Image
                          src={watchedItems[index]?.authorImageUrl ?? ""}
                          alt=""
                          fill
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed bg-muted">
                        <ImagePlus className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setActiveImageIndex(index);
                        authorImagePicker.openPicker();
                      }}
                      disabled={isPending}
                    >
                      <ImagePlus className="h-3 w-3 mr-1" />
                      画像を選択
                    </Button>
                    {watchedItems?.[index]?.authorImageUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setValue(`items.${index}.authorImageUrl`, "")
                        }
                        disabled={isPending}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>評価（1-5）</Label>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setValue(`items.${index}.rating`, star)}
                        disabled={isPending}
                        className="p-0.5"
                      >
                        <Star
                          className={`h-5 w-5 ${
                            star <= (field.rating ?? 0)
                              ? "fill-warning text-warning"
                              : "text-muted-foreground"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <FormActions
        isDirty={isDirty}
        isPending={isPending}
        onDirtyChange={onDirtyChange}
      />

      {authorImagePicker.mediaPickerDialog}
    </form>
  );
}
