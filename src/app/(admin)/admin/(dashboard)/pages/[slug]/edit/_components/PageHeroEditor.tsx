"use client";

/**
 * ホーム Page.pageHero 編集（content fields only）
 */

import { type ReactElement, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Input, Label, SubmitButton, Textarea } from "@/admin/components/ui";
import { updatePageHero } from "@/admin/actions/page";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  pageHeroSchema,
  parsePageHero,
  type PageHero,
} from "@/shared/lib/sections/page-hero/schema";
import { defaultPageHeroHome } from "@/shared/lib/sections/page-hero/defaults";

interface PageHeroEditorProps {
  readonly pageSlug: string;
  readonly initial: unknown;
  readonly onSaved?: () => void;
}

export function PageHeroEditor({
  pageSlug,
  initial,
  onSaved,
}: PageHeroEditorProps): ReactElement {
  const [isPending, startTransition] = useTransition();

  const form = useForm<PageHero>({
    defaultValues: parsePageHero(initial) ?? defaultPageHeroHome,
  });

  const { control, handleSubmit, register } = form;
  const variant = useWatch({ control, name: "variant" });

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
        </>
      ) : null}

      {variant === "compact" ? (
        <>
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
