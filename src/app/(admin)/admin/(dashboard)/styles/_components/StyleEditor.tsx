"use client";

/**
 * Style エディタ（Client Component）。
 * 5 groups（spacing / background / container / typography / animation）の fieldset +
 * 右 pane に StylePreview をリアルタイム反映する。
 *
 * 作成モード: createSectionStyleAction を呼ぶ
 * 編集モード: updateSectionStyleAction を呼ぶ
 * 派生モード: deriveSectionStyleAction を呼ぶ（overrides のみ送る）
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch, Controller } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
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
  ToggleGroup,
  ToggleGroupItem,
} from "@/admin/components/ui";
import { cn } from "@/shared/lib/cn";
import {
  createSectionStyleAction,
  deriveSectionStyleAction,
  updateSectionStyleAction,
} from "@/app/(admin)/admin/(dashboard)/_shared/actions/section-styles/mutations";
import {
  createSectionStyleInputSchema,
  type CreateSectionStyleInput,
} from "@/shared/lib/validations/section-style";
import {
  DEFAULT_SECTION_STYLE,
  type SectionStylePayload,
} from "@/shared/domain/section-styles/types";
import { isMutationError } from "@/shared/lib/mutation-result";
import { StylePreview } from "./StylePreview";

type StyleEditorMode =
  | { type: "create" }
  | { type: "edit"; id: string }
  | { type: "derive"; baseId: string };

type StyleEditorProps = {
  mode: StyleEditorMode;
  defaultValues?: Partial<CreateSectionStyleInput>;
};

const SPACING_VALUES = ["none", "sm", "md", "lg", "xl"] as const;
const MAX_WIDTH_VALUES = ["sm", "md", "editorial", "lg", "xl", "full"] as const;
const TITLE_SIZE_VALUES = ["sm", "md", "lg", "xl"] as const;
const TEXT_ALIGN_VALUES = ["left", "center", "right"] as const;
const BG_TYPE_VALUES = [
  "default",
  "surface",
  "muted",
  "image",
  "gradient",
] as const;
const ANIMATION_VALUES = ["none", "fade", "slide-up", "scale"] as const;

function buildDefaultValues(
  base?: Partial<CreateSectionStyleInput>,
): CreateSectionStyleInput {
  return {
    name: base?.name ?? "",
    scope: base?.scope ?? "section",
    applicableTypes: base?.applicableTypes ?? [],
    payload: base?.payload ?? DEFAULT_SECTION_STYLE,
  };
}

export function StyleEditor({ mode, defaultValues }: StyleEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<CreateSectionStyleInput>({
    resolver: standardSchemaResolver(createSectionStyleInputSchema),
    defaultValues: buildDefaultValues(defaultValues),
  });

  const watchedPayload = useWatch({
    control: form.control,
    name: "payload",
  });

  // watchedPayload は RHF の Zod input 型由来で optional フィールドが `T | undefined`。
  // SectionStylePayload は exactOptionalPropertyTypes 下で `undefined` を受け付けないため、
  // 実値の変換は parse ヘルパーに寄せる。ここでは preview 用に緩い型で展開する。
  const livePayload: SectionStylePayload = watchedPayload
    ? {
        spacing: {
          paddingTop: watchedPayload.spacing.paddingTop,
          paddingBottom: watchedPayload.spacing.paddingBottom,
        },
        background: {
          type: watchedPayload.background.type,
          overlayOpacity: watchedPayload.background.overlayOpacity,
          ...(watchedPayload.background.value !== undefined && {
            value: watchedPayload.background.value,
          }),
          ...(watchedPayload.background.imageUrl !== undefined && {
            imageUrl: watchedPayload.background.imageUrl,
          }),
        },
        container: { maxWidth: watchedPayload.container.maxWidth },
        typography: {
          titleSize: watchedPayload.typography.titleSize,
          textAlign: watchedPayload.typography.textAlign,
          ...(watchedPayload.typography.titleColor !== undefined && {
            titleColor: watchedPayload.typography.titleColor,
          }),
          ...(watchedPayload.typography.textColor !== undefined && {
            textColor: watchedPayload.typography.textColor,
          }),
        },
        animation: { preset: watchedPayload.animation.preset },
        ...(watchedPayload.customClass !== undefined && {
          customClass: watchedPayload.customClass,
        }),
      }
    : DEFAULT_SECTION_STYLE;

  const onSubmit = form.handleSubmit((data) => {
    setSubmitError(null);
    startTransition(async () => {
      if (mode.type === "create") {
        const result = await createSectionStyleAction(data);
        if (isMutationError(result)) {
          setSubmitError(result.error);
          toast.error(result.error);
          return;
        }
        toast.success("Style を作成しました");
        router.push(`/admin/styles/${result.id}`);
      } else if (mode.type === "edit") {
        const result = await updateSectionStyleAction(mode.id, {
          name: data.name,
          applicableTypes: data.applicableTypes,
          payload: data.payload,
        });
        if (isMutationError(result)) {
          setSubmitError(result.error);
          toast.error(result.error);
          return;
        }
        toast.success("Style を更新しました");
        router.push(`/admin/styles/${mode.id}`);
        router.refresh();
      } else {
        const result = await deriveSectionStyleAction(mode.baseId, {
          name: data.name,
          overrides: data.payload,
        });
        if (isMutationError(result)) {
          setSubmitError(result.error);
          toast.error(result.error);
          return;
        }
        toast.success("派生 Style を作成しました");
        router.push(`/admin/styles/${result.id}`);
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {submitError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {submitError}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,1.2fr)]">
        <div className="space-y-6">
          {/* 基本情報 */}
          <fieldset className="rounded-lg border bg-card p-4 space-y-4">
            <legend className="px-1 text-sm font-semibold">基本情報</legend>
            <div className="space-y-2">
              <Label htmlFor="style-name">名前</Label>
              <Input
                id="style-name"
                {...form.register("name")}
                disabled={isPending}
                aria-invalid={Boolean(form.formState.errors.name)}
              />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>
            {mode.type !== "derive" && (
              <div className="space-y-2">
                <Label>スコープ</Label>
                <Controller
                  control={form.control}
                  name="scope"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        if (v === "global" || v === "page" || v === "section") {
                          field.onChange(v);
                        }
                      }}
                      disabled={isPending || mode.type === "edit"}
                    >
                      <SelectTrigger aria-label="スコープ">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="global">
                          グローバル（全ページの default）
                        </SelectItem>
                        <SelectItem value="page">
                          ページ（ページ単位の default）
                        </SelectItem>
                        <SelectItem value="section">
                          セクション（個別セクションに適用）
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            )}
          </fieldset>

          {/* Spacing */}
          <fieldset className="rounded-lg border bg-card p-4 space-y-4">
            <legend className="px-1 text-sm font-semibold">余白</legend>
            <SpacingToggleField
              label="上余白"
              name="payload.spacing.paddingTop"
              control={form.control}
              values={SPACING_VALUES}
              disabled={isPending}
            />
            <SpacingToggleField
              label="下余白"
              name="payload.spacing.paddingBottom"
              control={form.control}
              values={SPACING_VALUES}
              disabled={isPending}
            />
          </fieldset>

          {/* Background */}
          <fieldset className="rounded-lg border bg-card p-4 space-y-4">
            <legend className="px-1 text-sm font-semibold">背景</legend>
            <div className="space-y-2">
              <Label>種類</Label>
              <Controller
                control={form.control}
                name="payload.background.type"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(v) => {
                      if ((BG_TYPE_VALUES as readonly string[]).includes(v)) {
                        field.onChange(v);
                      }
                    }}
                    disabled={isPending}
                  >
                    <SelectTrigger aria-label="背景種類">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">デフォルト</SelectItem>
                      <SelectItem value="surface">サーフェス</SelectItem>
                      <SelectItem value="muted">ミュート</SelectItem>
                      <SelectItem value="image">画像</SelectItem>
                      <SelectItem value="gradient">グラデーション</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </fieldset>

          {/* Container */}
          <fieldset className="rounded-lg border bg-card p-4 space-y-4">
            <legend className="px-1 text-sm font-semibold">コンテナ幅</legend>
            <Controller
              control={form.control}
              name="payload.container.maxWidth"
              render={({ field }) => (
                <ToggleGroup
                  type="single"
                  value={field.value}
                  onValueChange={(v) => {
                    if (!v) return;
                    if ((MAX_WIDTH_VALUES as readonly string[]).includes(v)) {
                      field.onChange(v);
                    }
                  }}
                  disabled={isPending}
                >
                  {MAX_WIDTH_VALUES.map((v) => (
                    <ToggleGroupItem key={v} value={v}>
                      {v}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              )}
            />
          </fieldset>

          {/* Typography */}
          <fieldset className="rounded-lg border bg-card p-4 space-y-4">
            <legend className="px-1 text-sm font-semibold">
              タイポグラフィ
            </legend>
            <div className="space-y-2">
              <Label>見出しサイズ</Label>
              <Controller
                control={form.control}
                name="payload.typography.titleSize"
                render={({ field }) => (
                  <ToggleGroup
                    type="single"
                    value={field.value}
                    onValueChange={(v) => {
                      if (!v) return;
                      if (
                        (TITLE_SIZE_VALUES as readonly string[]).includes(v)
                      ) {
                        field.onChange(v);
                      }
                    }}
                    disabled={isPending}
                  >
                    {TITLE_SIZE_VALUES.map((v) => (
                      <ToggleGroupItem key={v} value={v}>
                        {v}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label>テキスト配置</Label>
              <Controller
                control={form.control}
                name="payload.typography.textAlign"
                render={({ field }) => (
                  <ToggleGroup
                    type="single"
                    value={field.value}
                    onValueChange={(v) => {
                      if (!v) return;
                      if (
                        (TEXT_ALIGN_VALUES as readonly string[]).includes(v)
                      ) {
                        field.onChange(v);
                      }
                    }}
                    disabled={isPending}
                  >
                    <ToggleGroupItem value="left">左寄せ</ToggleGroupItem>
                    <ToggleGroupItem value="center">中央</ToggleGroupItem>
                    <ToggleGroupItem value="right">右寄せ</ToggleGroupItem>
                  </ToggleGroup>
                )}
              />
            </div>
          </fieldset>

          {/* Animation */}
          <fieldset className="rounded-lg border bg-card p-4 space-y-4">
            <legend className="px-1 text-sm font-semibold">
              アニメーション
            </legend>
            <Controller
              control={form.control}
              name="payload.animation.preset"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(v) => {
                    if ((ANIMATION_VALUES as readonly string[]).includes(v)) {
                      field.onChange(v);
                    }
                  }}
                  disabled={isPending}
                >
                  <SelectTrigger aria-label="アニメーションプリセット">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">なし</SelectItem>
                    <SelectItem value="fade">フェード</SelectItem>
                    <SelectItem value="slide-up">スライドアップ</SelectItem>
                    <SelectItem value="scale">スケール</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </fieldset>
        </div>

        {/* プレビューパネル */}
        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <StylePreview payload={livePayload} />
        </div>
      </div>

      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isPending}
        >
          キャンセル
        </Button>
        <SubmitButton
          isPending={isPending}
          label={
            mode.type === "edit"
              ? "保存"
              : mode.type === "derive"
                ? "派生 Style を作成"
                : "作成"
          }
          pendingLabel={
            mode.type === "edit"
              ? "保存中..."
              : mode.type === "derive"
                ? "作成中..."
                : "作成中..."
          }
        />
      </div>
    </form>
  );
}

type SpacingToggleFieldProps = {
  label: string;
  name: "payload.spacing.paddingTop" | "payload.spacing.paddingBottom";
  control: ReturnType<typeof useForm<CreateSectionStyleInput>>["control"];
  values: readonly string[];
  disabled?: boolean;
};

function SpacingToggleField({
  label,
  name,
  control,
  values,
  disabled,
}: SpacingToggleFieldProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <ToggleGroup
            type="single"
            value={field.value}
            onValueChange={(v) => {
              if (!v) return;
              if (values.includes(v)) {
                field.onChange(v);
              }
            }}
            {...(disabled !== undefined && { disabled })}
            className={cn("justify-start")}
          >
            {values.map((v) => (
              <ToggleGroupItem key={v} value={v}>
                {v}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      />
    </div>
  );
}
