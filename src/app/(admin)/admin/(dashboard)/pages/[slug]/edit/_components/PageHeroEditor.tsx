"use client";

/**
 * ホーム Page.pageHero 編集（variant 別フィールド）
 */

import { type ReactElement, useTransition } from "react";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { toast } from "sonner";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SubmitButton,
  Textarea,
} from "@/admin/components/ui";
import { updatePageHero } from "@/admin/actions/page";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  HERO_TRANSITIONS,
  pageHeroSchema,
  parsePageHero,
  type PageHero,
} from "@/shared/lib/sections/page-hero/schema";
import { defaultPageHeroHome } from "@/shared/lib/sections/page-hero/defaults";

const VARIANT_OPTIONS = [
  { value: "editorial-split", label: "Editorial split（標準）" },
  { value: "compact", label: "Compact" },
  { value: "minimal", label: "Minimal" },
] as const;

interface PageHeroEditorProps {
  readonly pageSlug: string;
  readonly initial: unknown;
  readonly onSaved?: () => void;
  readonly onDirtyChange?: (dirty: boolean) => void;
}

const TRANSITION_SET = new Set<string>(HERO_TRANSITIONS);

export function PageHeroEditor({
  pageSlug,
  initial,
  onSaved,
  onDirtyChange,
}: PageHeroEditorProps): ReactElement {
  const [isPending, startTransition] = useTransition();

  const form = useForm<PageHero>({
    defaultValues: parsePageHero(initial) ?? defaultPageHeroHome,
  });

  const { control, handleSubmit, register, setValue } = form;
  const variant = useWatch({ control, name: "variant" });
  const transitionMode = useWatch({ control, name: "transition" });

  const imagesArray = useFieldArray({
    control,
    name: "images",
    shouldUnregister: true,
  });

  function applyVariant(next: PageHero["variant"]) {
    if (next === "editorial-split") {
      form.reset(parsePageHero(initial) ?? defaultPageHeroHome);
      return;
    }
    if (next === "compact") {
      const img = defaultPageHeroHome.images[0];
      if (!img) {
        return;
      }
      form.reset({
        variant: "compact",
        image: { url: img.url, alt: img.alt },
        label: "",
        title: "",
        description: "",
      });
      return;
    }
    form.reset({
      variant: "minimal",
      eyebrow: undefined,
      title: "",
      description: "",
    });
  }

  return (
    <form
      className="max-w-2xl space-y-6"
      onSubmit={handleSubmit((raw) => {
        const parsed = pageHeroSchema.safeParse(raw);
        if (!parsed.success) {
          const msg = parsed.error.issues.map((i) => i.message).join(" / ");
          toast.error(msg || "入力内容を確認してください");
          return;
        }
        onDirtyChange?.(false);
        startTransition(async () => {
          const result = await updatePageHero(pageSlug, parsed.data);
          if (isMutationError(result)) {
            toast.error(result.error);
            return;
          }
          toast.success("ヒーローを保存しました");
          onSaved?.();
        });
      })}
    >
      <div className="space-y-2">
        <Label htmlFor="hero-variant">バリアント</Label>
        <Select
          value={variant}
          onValueChange={(v) => {
            if (v === "editorial-split" || v === "compact" || v === "minimal") {
              applyVariant(v);
              onDirtyChange?.(true);
            }
          }}
        >
          <SelectTrigger id="hero-variant">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VARIANT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {variant === "editorial-split" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="hero-label">ラベル</Label>
              <Input id="hero-label" {...register("label")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hero-title">タイトル</Label>
              <Input id="hero-title" {...register("title")} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="hero-desc">説明</Label>
            <Textarea id="hero-desc" rows={4} {...register("description")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="hero-btn-text">ボタン文言</Label>
              <Input id="hero-btn-text" {...register("buttonText")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hero-btn-url">ボタン URL</Label>
              <Input id="hero-btn-url" {...register("buttonUrl")} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="hero-transition">切替アニメーション</Label>
            <Select
              value={transitionMode}
              onValueChange={(v) => {
                if (TRANSITION_SET.has(v)) {
                  setValue(
                    "transition",
                    v as (typeof HERO_TRANSITIONS)[number],
                    {
                      shouldDirty: true,
                    },
                  );
                  onDirtyChange?.(true);
                }
              }}
            >
              <SelectTrigger id="hero-transition">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HERO_TRANSITIONS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label>スライド画像</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  imagesArray.append({ url: "", alt: "" });
                  onDirtyChange?.(true);
                }}
              >
                画像を追加
              </Button>
            </div>
            {imagesArray.fields.map((field, index) => (
              <div
                key={field.id}
                className="grid gap-2 rounded-md border p-3 sm:grid-cols-2"
              >
                <div className="space-y-1">
                  <Label>URL {index + 1}</Label>
                  <Input {...register(`images.${index}.url`)} />
                </div>
                <div className="space-y-1">
                  <Label>alt</Label>
                  <Input {...register(`images.${index}.alt`)} />
                </div>
                <div className="sm:col-span-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => {
                      imagesArray.remove(index);
                      onDirtyChange?.(true);
                    }}
                  >
                    削除
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {variant === "compact" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>画像 URL</Label>
              <Input {...register("image.url")} />
            </div>
            <div className="space-y-2">
              <Label>alt</Label>
              <Input {...register("image.alt")} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>ラベル</Label>
              <Input {...register("label")} />
            </div>
            <div className="space-y-2">
              <Label>タイトル</Label>
              <Input {...register("title")} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>説明</Label>
            <Textarea rows={4} {...register("description")} />
          </div>
        </>
      ) : null}

      {variant === "minimal" ? (
        <>
          <div className="space-y-2">
            <Label>アイブロー（任意）</Label>
            <Input {...register("eyebrow")} />
          </div>
          <div className="space-y-2">
            <Label>タイトル</Label>
            <Input {...register("title")} />
          </div>
          <div className="space-y-2">
            <Label>説明</Label>
            <Textarea rows={4} {...register("description")} />
          </div>
        </>
      ) : null}

      <SubmitButton isPending={isPending} label="保存" />
    </form>
  );
}
