"use client";

/**
 * レイアウト設定セクション — Phase 1 Task 6 conform 移行
 *
 * サイト全体の幅と記事コンテンツ幅を設定（比率プレビュー付き）。
 * `useFormAction` (RHF + shadcn Form/FormField) → `useActionState` + `useForm`
 * (@conform-to/react) clean break 移行。Select は `useInputControl` で
 * value 取得 + onValueChange 経由で双方向 sync、conditional Custom field
 * (LayoutWidth.CUSTOM 選択時のみ) はリアクティブ表示。
 */

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  getFormProps,
  getInputProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SubmitButton,
} from "@/admin/components/ui";
import { updateLayoutSettings } from "@/admin/actions/settings";
import { layoutFormSchema } from "@/admin/actions/settings/schemas/form-schemas-privacy-appearance";
import type { SettingsData } from "@/admin/actions/settings";
import type { Serialized } from "@/shared/lib/serialize";
import { LayoutWidth } from "@/shared/lib/validations/enums/prisma-types";
import { isValidLayoutWidth } from "@/shared/lib/validations/enums/guards";
import { getValidLayoutWidth } from "@/shared/lib/validations/enums/helpers";
import {
  SITE_WIDTH_PRESETS,
  CONTENT_WIDTH_PRESETS,
} from "@/shared/lib/styles/layout-mapper";
import type { WidthPreset } from "@/shared/lib/styles/layout-mapper";
import { keysOf } from "@/shared/lib/serialize";

interface LayoutSectionProps {
  settings: Serialized<SettingsData>;
}

function buildOptions(
  presets: Record<LayoutWidth, WidthPreset>,
  exclude: LayoutWidth,
) {
  return keysOf(presets)
    .filter((key) => key !== exclude)
    .map((key) => {
      const preset = presets[key];
      return {
        value: key,
        label: preset.px ? `${preset.label} (${preset.px}px)` : preset.label,
      };
    });
}

const siteWidthOptions = buildOptions(SITE_WIDTH_PRESETS, LayoutWidth.XS);
const contentWidthOptions = buildOptions(
  CONTENT_WIDTH_PRESETS,
  LayoutWidth.FULL,
);

function resolvePresetPx(
  width: LayoutWidth,
  customValue: string,
  presets: Record<LayoutWidth, WidthPreset>,
): number | null {
  if (width === LayoutWidth.FULL) return null;
  if (width === LayoutWidth.CUSTOM) {
    const parsed = customValue ? parseInt(customValue, 10) : null;
    return parsed !== null && !Number.isNaN(parsed) ? parsed : null;
  }
  return presets[width].px;
}

export function LayoutSection({ settings }: LayoutSectionProps) {
  const router = useRouter();
  const [lastResult, action, isPending] = useActionState(
    updateLayoutSettings,
    undefined,
  );

  const [form, fields] = useForm({
    id: "layout-settings",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: layoutFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      containerWidth: getValidLayoutWidth(
        settings.containerWidth,
        LayoutWidth.LG,
      ),
      containerWidthCustom: settings.containerWidthCustom?.toString() || "",
      contentWidth: getValidLayoutWidth(settings.contentWidth, LayoutWidth.MD),
      contentWidthCustom: settings.contentWidthCustom?.toString() || "",
    },
  });

  const containerWidthControl = useInputControl(fields.containerWidth);
  const contentWidthControl = useInputControl(fields.contentWidth);
  const containerWidthCustomControl = useInputControl(
    fields.containerWidthCustom,
  );
  const contentWidthCustomControl = useInputControl(fields.contentWidthCustom);

  const containerWidth = getValidLayoutWidth(
    containerWidthControl.value,
    LayoutWidth.LG,
  );
  const contentWidth = getValidLayoutWidth(
    contentWidthControl.value,
    LayoutWidth.MD,
  );
  const containerWidthCustom = containerWidthCustomControl.value ?? "";
  const contentWidthCustom = contentWidthCustomControl.value ?? "";

  const resolvedSitePx = resolvePresetPx(
    containerWidth,
    containerWidthCustom,
    SITE_WIDTH_PRESETS,
  );
  const resolvedContentPx = resolvePresetPx(
    contentWidth,
    contentWidthCustom,
    CONTENT_WIDTH_PRESETS,
  );

  const contentRatio =
    resolvedContentPx && resolvedSitePx
      ? Math.round((resolvedContentPx / resolvedSitePx) * 100)
      : null;

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("レイアウト設定を保存しました");
      router.refresh();
    }
  }, [lastResult, router]);

  const formErrors = form.errors;

  return (
    <form {...getFormProps(form)} action={action}>
      {/* Select の hidden input */}
      <input
        type="hidden"
        name={fields.containerWidth.name}
        value={containerWidth}
      />
      <input
        type="hidden"
        name={fields.contentWidth.name}
        value={contentWidth}
      />

      <Card>
        <CardHeader>
          <CardTitle>レイアウト設定</CardTitle>
          <CardDescription>
            サイト全体の幅と記事コンテンツの表示幅を設定します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4 rounded-lg border p-4">
              <div className="space-y-1">
                <h4 className="text-sm font-medium">サイト全体の幅</h4>
                <p className="text-xs text-muted-foreground">
                  ヘッダー、フッター、コンテンツ領域全体の最大幅
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor={fields.containerWidth.id}>サイト幅</Label>
                <Select
                  value={containerWidth}
                  onValueChange={(value) => {
                    if (isValidLayoutWidth(value))
                      containerWidthControl.change(value);
                  }}
                  disabled={isPending}
                >
                  <SelectTrigger id={fields.containerWidth.id}>
                    <SelectValue placeholder="幅を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {siteWidthOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fields.containerWidth.errors && (
                  <p
                    id={fields.containerWidth.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.containerWidth.errors.join(", ")}
                  </p>
                )}
              </div>

              {containerWidth === LayoutWidth.CUSTOM && (
                <div className="space-y-2">
                  <Label htmlFor={fields.containerWidthCustom.id}>
                    カスタム幅 (px)
                  </Label>
                  <Input
                    {...getInputProps(fields.containerWidthCustom, {
                      type: "number",
                    })}
                    min={320}
                    max={2560}
                    placeholder="例: 1400"
                    disabled={isPending}
                  />
                  <p className="text-xs text-muted-foreground">
                    320px〜2560pxの範囲で入力
                  </p>
                  {fields.containerWidthCustom.errors && (
                    <p
                      id={fields.containerWidthCustom.errorId}
                      className="text-sm text-destructive"
                    >
                      {fields.containerWidthCustom.errors.join(", ")}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-4 rounded-lg border p-4">
              <div className="space-y-1">
                <h4 className="text-sm font-medium">記事コンテンツの幅</h4>
                <p className="text-xs text-muted-foreground">
                  ブログ記事、お知らせ、静的ページの表示幅
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor={fields.contentWidth.id}>コンテンツ幅</Label>
                <Select
                  value={contentWidth}
                  onValueChange={(value) => {
                    if (isValidLayoutWidth(value))
                      contentWidthControl.change(value);
                  }}
                  disabled={isPending}
                >
                  <SelectTrigger id={fields.contentWidth.id}>
                    <SelectValue placeholder="幅を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {contentWidthOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fields.contentWidth.errors && (
                  <p
                    id={fields.contentWidth.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.contentWidth.errors.join(", ")}
                  </p>
                )}
              </div>

              {contentWidth === LayoutWidth.CUSTOM && (
                <div className="space-y-2">
                  <Label htmlFor={fields.contentWidthCustom.id}>
                    カスタム幅 (px)
                  </Label>
                  <Input
                    {...getInputProps(fields.contentWidthCustom, {
                      type: "number",
                    })}
                    min={320}
                    max={1920}
                    placeholder="例: 900"
                    disabled={isPending}
                  />
                  <p className="text-xs text-muted-foreground">
                    320px〜1920pxの範囲で入力
                  </p>
                  {fields.contentWidthCustom.errors && (
                    <p
                      id={fields.contentWidthCustom.errorId}
                      className="text-sm text-destructive"
                    >
                      {fields.contentWidthCustom.errors.join(", ")}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* レイアウトプレビュー（比率表示） */}
          <div className="space-y-2">
            <p className="text-sm font-medium">レイアウトプレビュー</p>
            <div className="rounded-lg border px-4 py-4">
              <div className="rounded border border-dashed border-foreground/20 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>サイト幅</span>
                  <span className="font-mono">
                    {resolvedSitePx ? `${resolvedSitePx}px` : "全幅"}
                  </span>
                </div>
                <div
                  className="mx-auto mt-2.5 rounded border border-dashed border-primary/40 bg-background px-3 py-2.5"
                  style={{
                    width: contentRatio ? `${contentRatio}%` : "100%",
                  }}
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>コンテンツ領域</span>
                    <span className="font-mono">
                      {resolvedContentPx ? `${resolvedContentPx}px` : "全幅"}
                      {contentRatio !== null && (
                        <span className="ml-1 opacity-60">
                          ({contentRatio}%)
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    <div className="h-2 rounded-full bg-muted" />
                    <div className="h-2 w-4/5 rounded-full bg-muted" />
                    <div className="h-2 w-3/5 rounded-full bg-muted" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {formErrors && formErrors.length > 0 && (
            <div
              id={form.errorId}
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {formErrors.join(", ")}
            </div>
          )}

          <div className="flex justify-end">
            <SubmitButton
              isPending={isPending}
              label="保存"
              pendingLabel="保存中..."
            />
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
