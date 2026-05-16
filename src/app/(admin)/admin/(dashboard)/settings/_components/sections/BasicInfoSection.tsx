"use client";

/**
 * 基本情報セクション — Phase 1 Task 6 conform 移行
 *
 * サイト名、フッターコピーライト、サイト説明（テキスト情報）と、
 * ロゴ・ファビコン・OGP画像（ブランド画像）を 1 つの保存単位で管理する。
 *
 * `useFormAction` (RHF + shadcn Form/FormField) → `useActionState` + `useForm`
 * (@conform-to/react) clean break 移行。MediaPickerField は `useInputControl`
 * で value / onChange を bridge、Switch も `useInputControl` + hidden input
 * 経由で "on" / "" sync。
 *
 * UI 構造:
 * - テキスト情報 grid（siteName / footerCopyright + siteDescription）
 * - 横線で区切り「ブランド画像」サブセクション
 *   - 4 画像すべて `<fieldset>` + `<legend>` で視覚・semantic 的にグルーピング
 *   - ヘッダー / フッターロゴ: 画像 + 使用 Switch + 補足の複合グループ
 *   - ファビコン / OGP画像: 画像のみの単一グループ（FormLabel は sr-only で legend と冗長性回避）
 */

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  getFormProps,
  getInputProps,
  getTextareaProps,
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
  SubmitButton,
  Switch,
  Textarea,
} from "@/admin/components/ui";
import { MediaPickerField } from "@/admin/components/media-picker";
import { updateBasicInfo } from "@/admin/actions/settings";
import { basicInfoFormSchema } from "@/admin/actions/settings/schemas/form-schemas-brand-contact";
import type { SettingsData } from "@/admin/actions/settings";
import type { Serialized } from "@/shared/lib/serialize";

interface BasicInfoSectionProps {
  settings: Serialized<SettingsData>;
}

export function BasicInfoSection({ settings }: BasicInfoSectionProps) {
  const router = useRouter();
  const [lastResult, action, isPending] = useActionState(
    updateBasicInfo,
    undefined,
  );

  const [form, fields] = useForm({
    id: "basic-info-settings",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: basicInfoFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      siteName: settings.siteName ?? "",
      siteDescription: settings.siteDescription ?? "",
      faviconUrl: settings.faviconUrl ?? "",
      defaultOgpImageUrl: settings.defaultOgpImageUrl ?? "",
      headerLogoUrl: settings.headerLogoUrl ?? "",
      footerLogoUrl: settings.footerLogoUrl ?? "",
      footerCopyright: settings.footerCopyright ?? "",
      useHeaderLogo: settings.useHeaderLogo ? "on" : "",
      useFooterLogo: settings.useFooterLogo ? "on" : "",
    },
  });

  const faviconUrlControl = useInputControl(fields.faviconUrl);
  const defaultOgpImageUrlControl = useInputControl(fields.defaultOgpImageUrl);
  const headerLogoUrlControl = useInputControl(fields.headerLogoUrl);
  const footerLogoUrlControl = useInputControl(fields.footerLogoUrl);
  const useHeaderLogoControl = useInputControl(fields.useHeaderLogo);
  const useFooterLogoControl = useInputControl(fields.useFooterLogo);

  const faviconUrl = faviconUrlControl.value ?? "";
  const defaultOgpImageUrl = defaultOgpImageUrlControl.value ?? "";
  const headerLogoUrl = headerLogoUrlControl.value ?? "";
  const footerLogoUrl = footerLogoUrlControl.value ?? "";
  const useHeaderLogo = useHeaderLogoControl.value === "on";
  const useFooterLogo = useFooterLogoControl.value === "on";

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("基本情報を保存しました");
      router.refresh();
    }
  }, [lastResult, router]);

  const formErrors = form.errors;

  return (
    <form {...getFormProps(form)} action={action}>
      {/* MediaPicker / Switch の hidden input 群 */}
      <input type="hidden" name={fields.faviconUrl.name} value={faviconUrl} />
      <input
        type="hidden"
        name={fields.defaultOgpImageUrl.name}
        value={defaultOgpImageUrl}
      />
      <input
        type="hidden"
        name={fields.headerLogoUrl.name}
        value={headerLogoUrl}
      />
      <input
        type="hidden"
        name={fields.footerLogoUrl.name}
        value={footerLogoUrl}
      />
      <input
        type="hidden"
        name={fields.useHeaderLogo.name}
        value={useHeaderLogoControl.value ?? ""}
      />
      <input
        type="hidden"
        name={fields.useFooterLogo.name}
        value={useFooterLogoControl.value ?? ""}
      />

      <Card>
        <CardHeader>
          <CardTitle>基本情報</CardTitle>
          <CardDescription>サイトの基本的な情報を設定します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={fields.siteName.id}>サイト名</Label>
              <Input
                {...getInputProps(fields.siteName, { type: "text" })}
                placeholder="Myrrh Rental Space"
                disabled={isPending}
              />
              {fields.siteName.errors && (
                <p
                  id={fields.siteName.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.siteName.errors.join(", ")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor={fields.footerCopyright.id}>
                フッターコピーライト
              </Label>
              <Input
                {...getInputProps(fields.footerCopyright, { type: "text" })}
                placeholder="2024 Myrrh Rental Space"
                disabled={isPending}
              />
              {fields.footerCopyright.errors && (
                <p
                  id={fields.footerCopyright.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.footerCopyright.errors.join(", ")}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={fields.siteDescription.id}>サイト説明</Label>
            <Textarea
              {...getTextareaProps(fields.siteDescription)}
              placeholder="サイトの説明文"
              rows={2}
              disabled={isPending}
            />
            {fields.siteDescription.errors && (
              <p
                id={fields.siteDescription.errorId}
                className="text-sm text-destructive"
              >
                {fields.siteDescription.errors.join(", ")}
              </p>
            )}
          </div>

          <div className="space-y-4 border-t pt-6">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                ブランド画像
              </h3>
              <p className="text-xs text-muted-foreground">
                サイトのロゴ・ファビコン・OGP画像を設定します
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <fieldset className="space-y-4 rounded-lg border p-4">
                <legend className="px-1 text-sm font-medium">
                  ヘッダーロゴ
                </legend>
                <MediaPickerField
                  value={headerLogoUrl}
                  onChange={(url) => headerLogoUrlControl.change(url)}
                  disabled={isPending}
                  aspectRatio="logo"
                  defaultUsage="SITE"
                  alt="ヘッダーロゴ"
                  recommendedSize="横長 3:1 / 高さ 64px 程度の透過 PNG・SVG"
                />
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor={fields.useHeaderLogo.id}
                    className="text-sm font-normal"
                  >
                    ヘッダーで使用
                  </Label>
                  <Switch
                    id={fields.useHeaderLogo.id}
                    checked={useHeaderLogo}
                    onCheckedChange={(checked) =>
                      useHeaderLogoControl.change(checked ? "on" : "")
                    }
                    disabled={isPending}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  OFF時またはロゴ未設定時はサイト名をテキスト表示
                </p>
              </fieldset>

              <fieldset className="space-y-4 rounded-lg border p-4">
                <legend className="px-1 text-sm font-medium">
                  フッターロゴ
                </legend>
                <MediaPickerField
                  value={footerLogoUrl}
                  onChange={(url) => footerLogoUrlControl.change(url)}
                  disabled={isPending}
                  aspectRatio="logo"
                  defaultUsage="SITE"
                  alt="フッターロゴ"
                  recommendedSize="横長 3:1 / 高さ 64px 程度の透過 PNG・SVG"
                />
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor={fields.useFooterLogo.id}
                    className="text-sm font-normal"
                  >
                    フッターで使用
                  </Label>
                  <Switch
                    id={fields.useFooterLogo.id}
                    checked={useFooterLogo}
                    onCheckedChange={(checked) =>
                      useFooterLogoControl.change(checked ? "on" : "")
                    }
                    disabled={isPending}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  OFF時またはロゴ未設定時はサイト名をテキスト表示
                </p>
              </fieldset>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <fieldset className="space-y-2 rounded-lg border p-4">
                <legend className="px-1 text-sm font-medium">ファビコン</legend>
                <MediaPickerField
                  value={faviconUrl}
                  onChange={(url) => faviconUrlControl.change(url)}
                  disabled={isPending}
                  aspectRatio="square"
                  defaultUsage="SITE"
                  alt="ファビコン"
                  recommendedSize="正方形 192×192 以上（.ico .png .svg）"
                />
              </fieldset>

              <fieldset className="space-y-2 rounded-lg border p-4">
                <legend className="px-1 text-sm font-medium">
                  OGP画像（デフォルト）
                </legend>
                <MediaPickerField
                  value={defaultOgpImageUrl}
                  onChange={(url) => defaultOgpImageUrlControl.change(url)}
                  disabled={isPending}
                  aspectRatio="wide"
                  defaultUsage="SITE"
                  alt="OGP画像"
                  recommendedSize="1200×630px（横長 1.91:1）"
                />
              </fieldset>
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

          <div className="flex justify-end pt-2">
            <SubmitButton
              isPending={isPending}
              label="基本情報を保存"
              pendingLabel="保存中..."
            />
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
