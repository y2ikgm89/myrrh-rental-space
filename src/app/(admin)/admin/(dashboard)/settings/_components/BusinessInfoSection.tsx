"use client";

/**
 * 事業者情報セクション
 *
 * 会社名 / 屋号 / 屋号カナ / 代表者 / 設立日 /
 * 法人番号 / インボイス登録番号 / 事業概要 (textarea) を 1 保存単位で扱う。
 */

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  getFormProps,
  getInputProps,
  getTextareaProps,
  useForm,
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
  Textarea,
} from "@/admin/components/ui";
import { updateBusinessInfo } from "@/admin/actions/settings";
import { businessInfoFormSchema } from "@/admin/actions/settings/schemas/form-schemas-brand-contact";
import type { SettingsData } from "@/admin/actions/settings";
import type { Serialized } from "@/shared/lib/serialize";
import { dateInputValueFromSerialized } from "@/shared/lib/serialize";

interface BusinessInfoSectionProps {
  settings: Serialized<SettingsData>;
}

export function BusinessInfoSection({ settings }: BusinessInfoSectionProps) {
  const router = useRouter();
  const [lastResult, action, isPending] = useActionState(
    updateBusinessInfo,
    undefined,
  );

  const [form, fields] = useForm({
    id: "business-info-settings",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: businessInfoFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      businessName: settings.businessName ?? "",
      businessNameKana: settings.businessNameKana ?? "",
      representativeName: settings.representativeName ?? "",
      establishedDate: dateInputValueFromSerialized(settings.establishedDate),
      registrationNumber: settings.registrationNumber ?? "",
      invoiceNumber: settings.invoiceNumber ?? "",
      businessDescription: settings.businessDescription ?? "",
    },
  });

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("事業者情報を保存しました");
      router.refresh();
    }
  }, [lastResult, router]);

  const formErrors = form.errors;

  return (
    <form {...getFormProps(form)} action={action}>
      <Card>
        <CardHeader>
          <CardTitle>事業者情報</CardTitle>
          <CardDescription>
            事業者の基本情報を設定します（特定商取引法表示などに使用）。
            各項目は任意です。個人事業主などで法人番号・インボイス登録番号が
            無い場合は、空欄のまま保存できます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={fields.businessName.id}>会社名・屋号</Label>
              <Input
                {...getInputProps(fields.businessName, { type: "text" })}
                placeholder="株式会社サンプル"
                disabled={isPending}
              />
              {fields.businessName.errors && (
                <p
                  id={fields.businessName.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.businessName.errors.join(", ")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor={fields.businessNameKana.id}>
                会社名・屋号（カナ）
              </Label>
              <Input
                {...getInputProps(fields.businessNameKana, { type: "text" })}
                placeholder="カブシキガイシャサンプル"
                disabled={isPending}
              />
              {fields.businessNameKana.errors && (
                <p
                  id={fields.businessNameKana.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.businessNameKana.errors.join(", ")}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={fields.representativeName.id}>代表者名</Label>
              <Input
                {...getInputProps(fields.representativeName, { type: "text" })}
                placeholder="山田 太郎"
                disabled={isPending}
              />
              {fields.representativeName.errors && (
                <p
                  id={fields.representativeName.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.representativeName.errors.join(", ")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor={fields.establishedDate.id}>設立日</Label>
              <Input
                {...getInputProps(fields.establishedDate, { type: "date" })}
                disabled={isPending}
              />
              {fields.establishedDate.errors && (
                <p
                  id={fields.establishedDate.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.establishedDate.errors.join(", ")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor={fields.registrationNumber.id}>法人番号</Label>
              <Input
                {...getInputProps(fields.registrationNumber, { type: "text" })}
                placeholder="1234567890123"
                disabled={isPending}
              />
              {fields.registrationNumber.errors && (
                <p
                  id={fields.registrationNumber.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.registrationNumber.errors.join(", ")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor={fields.invoiceNumber.id}>
                インボイス登録番号
              </Label>
              <Input
                {...getInputProps(fields.invoiceNumber, { type: "text" })}
                placeholder="T1234567890123"
                disabled={isPending}
              />
              {fields.invoiceNumber.errors && (
                <p
                  id={fields.invoiceNumber.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.invoiceNumber.errors.join(", ")}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor={fields.businessDescription.id}>事業概要</Label>
            <Textarea
              {...getTextareaProps(fields.businessDescription)}
              placeholder="事業内容の説明..."
              rows={3}
              disabled={isPending}
            />
            {fields.businessDescription.errors && (
              <p
                id={fields.businessDescription.errorId}
                className="text-sm text-destructive"
              >
                {fields.businessDescription.errors.join(", ")}
              </p>
            )}
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
              label="事業者情報を保存"
              pendingLabel="保存中..."
            />
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
