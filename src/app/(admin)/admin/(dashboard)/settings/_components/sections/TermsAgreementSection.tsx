"use client";

/**
 * 規約同意設定セクション
 *
 * 予約フォームでの規約同意チェックボックスの設定
 */

import { useWatch } from "react-hook-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  SubmitButton,
} from "@/admin/components/ui";
import { useFormAction } from "@/admin/hooks/useFormAction";
import { updateTermsAgreementSettings } from "@/admin/actions/settings";
import {
  termsAgreementFormSchema,
  emptyToNull,
} from "@/admin/actions/settings/schemas";
import type { SettingsData } from "@/admin/actions/settings";
import type { Serialized } from "@/shared/lib/serialize";

interface TermsAgreementSectionProps {
  settings: Serialized<SettingsData>;
}

export function TermsAgreementSection({
  settings,
}: TermsAgreementSectionProps) {
  const { form, isPending, onSubmit } = useFormAction(
    termsAgreementFormSchema,
    (data) =>
      updateTermsAgreementSettings({
        termsAgreementEnabled: data.termsAgreementEnabled,
        termsAgreementText: emptyToNull(data.termsAgreementText),
        requireTermsAgreement: data.requireTermsAgreement,
        requirePrivacyAgreement: data.requirePrivacyAgreement,
      }),
    {
      defaultValues: {
        termsAgreementEnabled: settings.termsAgreementEnabled,
        termsAgreementText: settings.termsAgreementText || "",
        requireTermsAgreement: settings.requireTermsAgreement,
        requirePrivacyAgreement: settings.requirePrivacyAgreement,
      },
      refresh: true,
      successMessage: "規約同意設定を保存しました",
    },
  );

  const [
    termsAgreementEnabled,
    requireTermsAgreement,
    requirePrivacyAgreement,
  ] = useWatch({
    control: form.control,
    name: [
      "termsAgreementEnabled",
      "requireTermsAgreement",
      "requirePrivacyAgreement",
    ],
  });

  // デフォルト文言を生成
  const getDefaultText = () => {
    const items = [];
    if (requireTermsAgreement) items.push("利用規約");
    if (requirePrivacyAgreement) items.push("プライバシーポリシー");
    return items.length > 0
      ? `${items.join("と")}に同意します`
      : "規約に同意します";
  };

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>規約同意設定</CardTitle>
            <CardDescription>
              予約フォームでの利用規約・プライバシーポリシーへの同意確認を設定します
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="termsAgreementEnabled"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center space-x-2">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormLabel className="cursor-pointer">
                      予約時に規約同意を求める
                    </FormLabel>
                  </div>
                </FormItem>
              )}
            />

            {termsAgreementEnabled && (
              <>
                <FormField
                  control={form.control}
                  name="termsAgreementText"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>同意文言（カスタム）</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder={getDefaultText()}
                          disabled={isPending}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        空欄の場合は「{getDefaultText()}」が表示されます
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-3">
                  <FormLabel>対象規約</FormLabel>
                  <div className="space-y-2">
                    <FormField
                      control={form.control}
                      name="requireTermsAgreement"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center space-x-2">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                disabled={isPending}
                              />
                            </FormControl>
                            <FormLabel className="cursor-pointer font-normal">
                              利用規約への同意を必須にする
                            </FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="requirePrivacyAgreement"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center space-x-2">
                            <FormControl>
                              <Checkbox
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                disabled={isPending}
                              />
                            </FormControl>
                            <FormLabel className="cursor-pointer font-normal">
                              プライバシーポリシーへの同意を必須にする
                            </FormLabel>
                          </div>
                        </FormItem>
                      )}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    選択した規約へのリンクがチェックボックスと共に表示されます
                  </p>
                </div>
              </>
            )}

            <div className="flex justify-end pt-2">
              <SubmitButton
                isPending={isPending}
                label="規約同意設定を保存"
                disabled={!form.formState.isDirty}
              />
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}
