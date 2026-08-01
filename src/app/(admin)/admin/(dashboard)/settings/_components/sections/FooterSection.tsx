"use client";

/**
 * フッター設定セクション
 *
 * フッターの表示テキスト・SNSリンク表示・テーマカラーを設定
 */

import { useEffect, useActionState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  getFormProps,
  getInputProps,
  getTextareaProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  SubmitButton,
  Switch,
  Textarea,
} from "@/admin/components/ui";
import { updateFooterSettings } from "@/admin/actions/settings";
import { footerFormSchema } from "@/admin/actions/settings/schemas/form-schemas-privacy-appearance";
import {
  isSettingsFormDisabled,
  type SettingsReadOnlyProps,
} from "../shared/settings-read-only";
import { dispatchWithoutFormReset } from "@/shared/lib/forms/conform-submit";

interface FooterSectionProps extends SettingsReadOnlyProps {
  settings: {
    footerTagline: string | null;
    footerNavigationLabel: string;
    footerContactLabel: string;
    footerHoursLabel: string;
    footerShowSocialLinks: boolean;
    themeColor: string;
    layoutUpdatedAt: string;
  };
}

const DEFAULT_TAGLINE =
  "洗練された空間で、特別なひとときを。\n厳選されたレンタルスペースをご案内します。";

const DEFAULT_FOOTER_NAVIGATION_LABEL = "ナビゲーション";
const DEFAULT_FOOTER_CONTACT_LABEL = "お問い合わせ";
const DEFAULT_FOOTER_HOURS_LABEL = "営業時間";

const OPTIMISTIC_CONFLICT_HINT = "他のユーザーにより更新されています";

export function FooterSection({
  settings,
  readOnly = false,
}: FooterSectionProps) {
  const router = useRouter();
  const [lastResult, action, isPending] = useActionState(
    updateFooterSettings,
    undefined,
  );
  const isDisabled = isSettingsFormDisabled(isPending, readOnly);
  const [form, fields] = useForm({
    id: "footer-settings",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: footerFormSchema });
    },
    // React 19 の form auto-reset がサーバーの form-level エラーと入力値を
    // 消すのを防ぐ（理由と `action` prop を残す必要性は helper の JSDoc）。
    onSubmit: dispatchWithoutFormReset(action),
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      footerTagline: settings.footerTagline ?? "",
      footerNavigationLabel: settings.footerNavigationLabel,
      footerContactLabel: settings.footerContactLabel,
      footerHoursLabel: settings.footerHoursLabel,
      footerShowSocialLinks: settings.footerShowSocialLinks ? "on" : "",
      themeColor: settings.themeColor,
      expectedUpdatedAt: settings.layoutUpdatedAt,
    },
  });

  const showSocialLinks = useInputControl(fields.footerShowSocialLinks);
  const isSocialOn = showSocialLinks.value === "on";
  const themeColor = useInputControl(fields.themeColor);

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("フッター設定を保存しました");
      router.refresh();
      return;
    }
    if (lastResult?.status === "error") {
      const formLevelErrors = lastResult.error?.[""];
      const conflictMessage = formLevelErrors?.find((message) =>
        message.includes(OPTIMISTIC_CONFLICT_HINT),
      );
      if (conflictMessage) {
        toast.error(conflictMessage);
        router.refresh();
      }
    }
  }, [lastResult, router]);

  const formErrors = form.errors;

  return (
    <form {...getFormProps(form)} action={action}>
      <Card>
        <CardHeader>
          <CardTitle>フッター設定</CardTitle>
          <CardDescription>
            フッターの表示テキスト・SNS
            リンク表示・ブラウザテーマカラーを設定します。メニュー項目や SNS
            リンクは「ナビゲーション」タブで編集できます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <fieldset
            disabled={readOnly}
            className="space-y-6 border-0 p-0 m-0 min-w-0"
          >
            <input
              {...getInputProps(fields.expectedUpdatedAt, { type: "hidden" })}
            />
            <div className="space-y-1.5">
              <label
                className="block text-sm font-medium text-foreground"
                htmlFor={fields.footerTagline.id}
              >
                ブランド説明文
              </label>
              <Textarea
                {...getTextareaProps(fields.footerTagline)}
                placeholder={DEFAULT_TAGLINE}
                rows={3}
                maxLength={200}
                disabled={isDisabled}
              />
              <p className="text-xs text-muted-foreground">
                空欄の場合はデフォルトの説明文が表示されます
              </p>
              {fields.footerTagline.errors &&
                fields.footerTagline.errors.length > 0 && (
                  <p
                    id={fields.footerTagline.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.footerTagline.errors.join(", ")}
                  </p>
                )}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label
                  className="block text-sm font-medium text-foreground"
                  htmlFor={fields.footerNavigationLabel.id}
                >
                  ナビゲーション見出し
                </label>
                <Input
                  {...getInputProps(fields.footerNavigationLabel, {
                    type: "text",
                  })}
                  placeholder={DEFAULT_FOOTER_NAVIGATION_LABEL}
                  disabled={isDisabled}
                />
                {fields.footerNavigationLabel.errors &&
                  fields.footerNavigationLabel.errors.length > 0 && (
                    <p
                      id={fields.footerNavigationLabel.errorId}
                      className="text-sm text-destructive"
                    >
                      {fields.footerNavigationLabel.errors.join(", ")}
                    </p>
                  )}
              </div>
              <div className="space-y-1.5">
                <label
                  className="block text-sm font-medium text-foreground"
                  htmlFor={fields.footerContactLabel.id}
                >
                  連絡先見出し
                </label>
                <Input
                  {...getInputProps(fields.footerContactLabel, {
                    type: "text",
                  })}
                  placeholder={DEFAULT_FOOTER_CONTACT_LABEL}
                  disabled={isDisabled}
                />
                {fields.footerContactLabel.errors &&
                  fields.footerContactLabel.errors.length > 0 && (
                    <p
                      id={fields.footerContactLabel.errorId}
                      className="text-sm text-destructive"
                    >
                      {fields.footerContactLabel.errors.join(", ")}
                    </p>
                  )}
              </div>
              <div className="space-y-1.5">
                <label
                  className="block text-sm font-medium text-foreground"
                  htmlFor={fields.footerHoursLabel.id}
                >
                  営業時間見出し
                </label>
                <Input
                  {...getInputProps(fields.footerHoursLabel, { type: "text" })}
                  placeholder={DEFAULT_FOOTER_HOURS_LABEL}
                  disabled={isDisabled}
                />
                {fields.footerHoursLabel.errors &&
                  fields.footerHoursLabel.errors.length > 0 && (
                    <p
                      id={fields.footerHoursLabel.errorId}
                      className="text-sm text-destructive"
                    >
                      {fields.footerHoursLabel.errors.join(", ")}
                    </p>
                  )}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <label
                  className="text-sm font-medium"
                  htmlFor={fields.footerShowSocialLinks.id}
                >
                  SNSリンクを表示
                </label>
                <p className="text-xs text-muted-foreground">
                  ナビゲーション設定で登録したSNSリンクをフッターに表示します
                </p>
              </div>
              <Switch
                id={fields.footerShowSocialLinks.id}
                checked={isSocialOn}
                onCheckedChange={(checked) =>
                  showSocialLinks.change(checked ? "on" : "")
                }
                onBlur={showSocialLinks.blur}
                disabled={isDisabled}
              />
              <input
                type="hidden"
                name={fields.footerShowSocialLinks.name}
                value={isSocialOn ? "on" : ""}
              />
            </div>

            <div className="space-y-1.5">
              <label
                className="block text-sm font-medium text-foreground"
                htmlFor={fields.themeColor.id}
              >
                ブラウザテーマカラー
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={themeColor.value ?? ""}
                  onChange={(e) => themeColor.change(e.target.value)}
                  className="h-10 w-10 cursor-pointer rounded border border-input"
                />
                <Input
                  {...getInputProps(fields.themeColor, { type: "text" })}
                  placeholder="#fafafa"
                  className="max-w-[10rem]"
                  disabled={isDisabled}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                モバイルブラウザのアドレスバーの色に反映されます
              </p>
              {fields.themeColor.errors &&
                fields.themeColor.errors.length > 0 && (
                  <p
                    id={fields.themeColor.errorId}
                    className="text-sm text-destructive"
                  >
                    {fields.themeColor.errors.join(", ")}
                  </p>
                )}
            </div>

            {formErrors && formErrors.length > 0 && (
              <div
                id={form.errorId}
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              >
                {formErrors.join(", ")}
              </div>
            )}

            {!readOnly ? (
              <div className="flex justify-end pt-2">
                <SubmitButton
                  isPending={isPending}
                  label="保存"
                  pendingLabel="保存中..."
                />
              </div>
            ) : null}
          </fieldset>
        </CardContent>
      </Card>
    </form>
  );
}
