"use client";

/**
 * 連絡先情報セクション — Phase 1 Task 6 conform 移行
 *
 * 電話番号、メールアドレス、住所などの連絡先設定。
 * `useFormAction` (RHF) → `useActionState` + `useForm` (@conform-to/react)
 * への clean break 移行。
 */

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getFormProps, getInputProps, useForm } from "@conform-to/react";
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
} from "@/admin/components/ui";
import { updateContactInfo } from "@/admin/actions/settings";
import { contactInfoFormSchema } from "@/admin/actions/settings/schemas/form-schemas-brand-contact";
import type { SettingsData } from "@/admin/actions/settings";
import type { Serialized } from "@/shared/lib/serialize";

interface ContactInfoSectionProps {
  settings: Serialized<SettingsData>;
}

export function ContactInfoSection({ settings }: ContactInfoSectionProps) {
  const router = useRouter();
  const [lastResult, action, isPending] = useActionState(
    updateContactInfo,
    undefined,
  );

  const [form, fields] = useForm({
    id: "contact-info-settings",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: contactInfoFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      phoneNumber: settings.phoneNumber ?? "",
      faxNumber: settings.faxNumber ?? "",
      email: settings.email ?? "",
      postalCode: settings.postalCode ?? "",
      prefecture: settings.prefecture ?? "",
      city: settings.city ?? "",
      streetAddress: settings.streetAddress ?? "",
      buildingName: settings.buildingName ?? "",
    },
  });

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("連絡先情報を保存しました");
      router.refresh();
    }
  }, [lastResult, router]);

  const formErrors = form.errors;

  return (
    <form {...getFormProps(form)} action={action}>
      <Card>
        <CardHeader>
          <CardTitle>連絡先情報</CardTitle>
          <CardDescription>
            サイト全体の代表連絡先を設定します。拠点ごとの交通・駐車場案内は
            <Link
              href="/admin/spaces?tab=locations"
              className="underline underline-offset-2 hover:text-foreground"
            >
              拠点管理
            </Link>
            で個別に設定できます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor={fields.phoneNumber.id}>電話番号</Label>
              <Input
                {...getInputProps(fields.phoneNumber, { type: "text" })}
                placeholder="03-1234-5678"
                disabled={isPending}
              />
              {fields.phoneNumber.errors && (
                <p
                  id={fields.phoneNumber.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.phoneNumber.errors.join(", ")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor={fields.faxNumber.id}>FAX番号</Label>
              <Input
                {...getInputProps(fields.faxNumber, { type: "text" })}
                placeholder="03-1234-5679"
                disabled={isPending}
              />
              {fields.faxNumber.errors && (
                <p
                  id={fields.faxNumber.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.faxNumber.errors.join(", ")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor={fields.email.id}>メールアドレス</Label>
              <Input
                {...getInputProps(fields.email, { type: "email" })}
                placeholder="info@example.com"
                disabled={isPending}
              />
              {fields.email.errors && (
                <p
                  id={fields.email.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.email.errors.join(", ")}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor={fields.postalCode.id}>郵便番号</Label>
              <Input
                {...getInputProps(fields.postalCode, { type: "text" })}
                placeholder="123-4567"
                disabled={isPending}
              />
              {fields.postalCode.errors && (
                <p
                  id={fields.postalCode.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.postalCode.errors.join(", ")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor={fields.prefecture.id}>都道府県</Label>
              <Input
                {...getInputProps(fields.prefecture, { type: "text" })}
                placeholder="東京都"
                disabled={isPending}
              />
              {fields.prefecture.errors && (
                <p
                  id={fields.prefecture.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.prefecture.errors.join(", ")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor={fields.city.id}>市区町村</Label>
              <Input
                {...getInputProps(fields.city, { type: "text" })}
                placeholder="渋谷区"
                disabled={isPending}
              />
              {fields.city.errors && (
                <p
                  id={fields.city.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.city.errors.join(", ")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor={fields.streetAddress.id}>番地</Label>
              <Input
                {...getInputProps(fields.streetAddress, { type: "text" })}
                placeholder="1-2-3"
                disabled={isPending}
              />
              {fields.streetAddress.errors && (
                <p
                  id={fields.streetAddress.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.streetAddress.errors.join(", ")}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={fields.buildingName.id}>建物名</Label>
              <Input
                {...getInputProps(fields.buildingName, { type: "text" })}
                placeholder="○○ビル 3F"
                disabled={isPending}
              />
              {fields.buildingName.errors && (
                <p
                  id={fields.buildingName.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.buildingName.errors.join(", ")}
                </p>
              )}
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
              label="連絡先情報を保存"
              pendingLabel="保存中..."
            />
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
