"use client";

import { useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SubmitButton,
} from "@/admin/components/ui";

import { keysOf } from "@/shared/lib/serialize";
import {
  testimonialConfigSchema,
  parseTestimonialVariant,
  parseTestimonialLayout,
  type TestimonialConfig,
  type TestimonialConfigInput,
} from "@/admin/lib/validations/homepage-section";
import {
  testimonialVariantLabels,
  testimonialLayoutLabels,
} from "@/shared/lib/validations/section-options";

export function TestimonialConfigForm({
  config,
  onSave,
  isPending,
}: {
  config: TestimonialConfig;
  onSave: (config: TestimonialConfig) => void;
  isPending: boolean;
}) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<TestimonialConfigInput, unknown, TestimonialConfig>({
    resolver: standardSchemaResolver(testimonialConfigSchema),
    defaultValues: config,
  });

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="testimonial-section-label">
            セクションラベル（英語装飾）
          </Label>
          <Input
            id="testimonial-section-label"
            {...register("sectionLabel")}
            placeholder="Testimonials"
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
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
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
        </div>
      </div>

      <SubmitButton isPending={isPending} label="保存" />
    </form>
  );
}
