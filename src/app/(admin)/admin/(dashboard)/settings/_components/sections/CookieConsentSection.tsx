"use client";

/**
 * Cookie同意バナー設定セクション (Phase 1 Task 5 conform 移行)
 *
 * GDPR対応のCookie同意バナーの表示設定
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
  Switch,
  SubmitButton,
  Textarea,
} from "@/admin/components/ui";
import { updateCookieConsentSettings } from "@/admin/actions/settings";
import { cookieConsentFormSchema } from "@/admin/actions/settings/schemas/form-schemas-privacy-appearance";
import type { SettingsData } from "@/admin/actions/settings";
import type { Serialized } from "@/shared/lib/serialize";

const DEFAULT_MESSAGE =
  "当サイトでは、サービス向上のためにCookieを使用しています。Cookieの使用に同意いただける場合は「同意する」をクリックしてください。";
const DEFAULT_ACCEPT_TEXT = "同意する";
const DEFAULT_REJECT_TEXT = "拒否する";
const DEFAULT_POLICY_URL = "/terms/privacy-policy";

interface CookieConsentSectionProps {
  settings: Serialized<SettingsData>;
}

export function CookieConsentSection({ settings }: CookieConsentSectionProps) {
  const router = useRouter();
  const [lastResult, action, isPending] = useActionState(
    updateCookieConsentSettings,
    undefined,
  );
  const [form, fields] = useForm({
    id: "cookie-consent-settings",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: cookieConsentFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      cookieConsentEnabled: settings.cookieConsentEnabled ? "on" : "",
      cookieConsentMessage: settings.cookieConsentMessage ?? "",
      cookieConsentAcceptText: settings.cookieConsentAcceptText ?? "",
      cookieConsentRejectText: settings.cookieConsentRejectText ?? "",
      cookieConsentPolicyUrl: settings.cookieConsentPolicyUrl ?? "",
    },
  });

  const cookieConsentEnabled = useInputControl(fields.cookieConsentEnabled);
  const isEnabled = cookieConsentEnabled.value === "on";

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("Cookie同意設定を保存しました");
      router.refresh();
    }
  }, [lastResult, router]);

  const formErrors = form.errors;

  return (
    <form {...getFormProps(form)} action={action}>
      <Card>
        <CardHeader>
          <CardTitle>Cookie同意バナー</CardTitle>
          <CardDescription>
            GDPR対応のCookie同意バナーを表示します。グローバル展開時に有効にしてください。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <label
                className="text-sm font-medium"
                htmlFor={fields.cookieConsentEnabled.id}
              >
                Cookie同意バナーを表示
              </label>
              <p className="text-xs text-muted-foreground">
                有効にすると、初回訪問時にCookie同意バナーが表示されます
              </p>
            </div>
            <Switch
              id={fields.cookieConsentEnabled.id}
              checked={isEnabled}
              onCheckedChange={(checked) =>
                cookieConsentEnabled.change(checked ? "on" : "")
              }
              onBlur={cookieConsentEnabled.blur}
              disabled={isPending}
            />
            <input
              type="hidden"
              name={fields.cookieConsentEnabled.name}
              value={isEnabled ? "on" : ""}
            />
          </div>

          {isEnabled && (
            <>
              <div className="space-y-1.5">
                <label
                  className="block text-sm font-medium text-foreground"
                  htmlFor={fields.cookieConsentMessage.id}
                >
                  バナーメッセージ
                </label>
                <Textarea
                  {...getTextareaProps(fields.cookieConsentMessage)}
                  placeholder={DEFAULT_MESSAGE}
                  rows={3}
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">
                  空欄の場合はデフォルトメッセージが表示されます
                </p>
                {fields.cookieConsentMessage.errors &&
                  fields.cookieConsentMessage.errors.length > 0 && (
                    <p
                      id={fields.cookieConsentMessage.errorId}
                      className="text-sm text-destructive"
                    >
                      {fields.cookieConsentMessage.errors.join(", ")}
                    </p>
                  )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label
                    className="block text-sm font-medium text-foreground"
                    htmlFor={fields.cookieConsentAcceptText.id}
                  >
                    同意ボタンテキスト
                  </label>
                  <Input
                    {...getInputProps(fields.cookieConsentAcceptText, {
                      type: "text",
                    })}
                    placeholder={DEFAULT_ACCEPT_TEXT}
                    disabled={isPending}
                  />
                  {fields.cookieConsentAcceptText.errors &&
                    fields.cookieConsentAcceptText.errors.length > 0 && (
                      <p
                        id={fields.cookieConsentAcceptText.errorId}
                        className="text-sm text-destructive"
                      >
                        {fields.cookieConsentAcceptText.errors.join(", ")}
                      </p>
                    )}
                </div>

                <div className="space-y-1.5">
                  <label
                    className="block text-sm font-medium text-foreground"
                    htmlFor={fields.cookieConsentRejectText.id}
                  >
                    拒否ボタンテキスト
                  </label>
                  <Input
                    {...getInputProps(fields.cookieConsentRejectText, {
                      type: "text",
                    })}
                    placeholder={DEFAULT_REJECT_TEXT}
                    disabled={isPending}
                  />
                  {fields.cookieConsentRejectText.errors &&
                    fields.cookieConsentRejectText.errors.length > 0 && (
                      <p
                        id={fields.cookieConsentRejectText.errorId}
                        className="text-sm text-destructive"
                      >
                        {fields.cookieConsentRejectText.errors.join(", ")}
                      </p>
                    )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  className="block text-sm font-medium text-foreground"
                  htmlFor={fields.cookieConsentPolicyUrl.id}
                >
                  プライバシーポリシーURL
                </label>
                <Input
                  {...getInputProps(fields.cookieConsentPolicyUrl, {
                    type: "text",
                  })}
                  placeholder={DEFAULT_POLICY_URL}
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">
                  「詳細」リンクのリンク先URL
                </p>
                {fields.cookieConsentPolicyUrl.errors &&
                  fields.cookieConsentPolicyUrl.errors.length > 0 && (
                    <p
                      id={fields.cookieConsentPolicyUrl.errorId}
                      className="text-sm text-destructive"
                    >
                      {fields.cookieConsentPolicyUrl.errors.join(", ")}
                    </p>
                  )}
              </div>
            </>
          )}

          {formErrors && formErrors.length > 0 && (
            <div
              id={form.errorId}
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {formErrors.join(", ")}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <SubmitButton
              isPending={isPending}
              label="Cookie同意設定を保存"
              pendingLabel="保存中..."
            />
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
