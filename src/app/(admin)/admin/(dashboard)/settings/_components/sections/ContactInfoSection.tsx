"use client";

/**
 * 連絡先情報セクション
 *
 * 電話番号、メールアドレス、住所などの連絡先設定
 */

import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
import { updateContactInfo } from "@/admin/actions/settings";
import { emptyToNull } from "@/admin/actions/settings/schemas/form-schema-helpers";
import { contactInfoFormSchema } from "@/admin/actions/settings/schemas/form-schemas-brand-contact";
import type { SettingsData } from "@/admin/actions/settings";
import type { Serialized } from "@/shared/lib/serialize";

interface ContactInfoSectionProps {
  settings: Serialized<SettingsData>;
}

export function ContactInfoSection({ settings }: ContactInfoSectionProps) {
  const { form, isPending, onSubmit } = useFormAction(
    contactInfoFormSchema,
    (data) =>
      updateContactInfo({
        phoneNumber: emptyToNull(data.phoneNumber),
        faxNumber: emptyToNull(data.faxNumber),
        email: emptyToNull(data.email),
        postalCode: emptyToNull(data.postalCode),
        prefecture: emptyToNull(data.prefecture),
        city: emptyToNull(data.city),
        streetAddress: emptyToNull(data.streetAddress),
        buildingName: emptyToNull(data.buildingName),
      }),
    {
      defaultValues: {
        phoneNumber: settings.phoneNumber || "",
        faxNumber: settings.faxNumber || "",
        email: settings.email || "",
        postalCode: settings.postalCode || "",
        prefecture: settings.prefecture || "",
        city: settings.city || "",
        streetAddress: settings.streetAddress || "",
        buildingName: settings.buildingName || "",
      },
      refresh: true,
      successMessage: "連絡先情報を保存しました",
    },
  );

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
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
              <FormField
                control={form.control}
                name="phoneNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>電話番号</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="03-1234-5678"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="faxNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>FAX番号</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="03-1234-5679"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>メールアドレス</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        placeholder="info@example.com"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-4">
              <FormField
                control={form.control}
                name="postalCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>郵便番号</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="123-4567"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="prefecture"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>都道府県</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="東京都"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>市区町村</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="渋谷区"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="streetAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>番地</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="1-2-3"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="buildingName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>建物名</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="○○ビル 3F"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end pt-2">
              <SubmitButton
                isPending={isPending}
                label="連絡先情報を保存"
                disabled={!form.formState.isDirty}
              />
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}
