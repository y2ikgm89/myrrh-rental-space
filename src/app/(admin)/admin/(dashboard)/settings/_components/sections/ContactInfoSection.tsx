"use client";

/**
 * 連絡先情報セクション
 *
 * 電話番号、メールアドレス、住所などの連絡先設定
 */

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
  Textarea,
} from "@/admin/components/ui";
import { useFormAction } from "@/admin/hooks/useFormAction";
import { updateContactInfo } from "@/admin/actions/settings";
import {
  contactInfoFormSchema,
  emptyToNull,
} from "@/admin/actions/settings/schemas";
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
        address: emptyToNull(data.address),
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
        address: settings.address || "",
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
              サイトに表示する連絡先を設定します
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

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>住所（表示用）</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="東京都渋谷区..."
                      rows={2}
                      disabled={isPending}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    フッターなどに表示する住所形式（上記の項目から自動生成されません）
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

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
