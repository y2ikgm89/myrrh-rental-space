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
        address: emptyToNull(data.address),
        postalCode: emptyToNull(data.postalCode),
        prefecture: emptyToNull(data.prefecture),
        city: emptyToNull(data.city),
        streetAddress: emptyToNull(data.streetAddress),
        buildingName: emptyToNull(data.buildingName),
        accessInfo: emptyToNull(data.accessInfo),
        parkingInfo: emptyToNull(data.parkingInfo),
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
        accessInfo: settings.accessInfo || "",
        parkingInfo: settings.parkingInfo || "",
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

            <FormField
              control={form.control}
              name="accessInfo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>交通案内</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder={
                        "○○線 △△駅 北口 徒歩3分\n○○線 □□駅 西口 徒歩5分"
                      }
                      rows={3}
                      disabled={isPending}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    最寄り駅・路線・徒歩分数など。アクセスページに表示されます
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="parkingInfo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>駐車場案内</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder={
                        "専用駐車場2台あり\n近隣コインパーキング: ○○パーキング（徒歩1分）"
                      }
                      rows={2}
                      disabled={isPending}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    駐車場の有無・台数・近隣パーキング情報。アクセスページに表示されます
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
