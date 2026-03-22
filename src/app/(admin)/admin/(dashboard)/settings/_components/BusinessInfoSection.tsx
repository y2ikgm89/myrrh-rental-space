"use client";

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SubmitButton,
  Textarea,
} from "@/admin/components/ui";
import { useFormAction } from "@/admin/hooks/useFormAction";
import { updateBusinessInfo } from "@/admin/actions/settings";
import { emptyToNull } from "@/admin/actions/settings/schemas/form-schema-helpers";
import { businessInfoFormSchema } from "@/admin/actions/settings/schemas/form-schemas-brand-contact";
import type { SettingsData } from "@/admin/actions/settings";
import type { Serialized } from "@/shared/lib/serialize";
import { dateInputValueFromSerialized } from "@/shared/lib/serialize";

interface BusinessInfoSectionProps {
  settings: Serialized<SettingsData>;
}

const BUSINESS_TYPES = [
  { value: "individual", label: "個人事業主" },
  { value: "corporation", label: "法人" },
  { value: "llc", label: "合同会社" },
  { value: "npo", label: "NPO法人" },
  { value: "other", label: "その他" },
];

const INDUSTRY_TYPES = [
  { value: "rental_space", label: "レンタルスペース" },
  { value: "event_venue", label: "イベント会場" },
  { value: "coworking", label: "コワーキングスペース" },
  { value: "meeting_room", label: "貸会議室" },
  { value: "studio", label: "スタジオ" },
  { value: "other", label: "その他" },
];

export function BusinessInfoSection({ settings }: BusinessInfoSectionProps) {
  const { form, isPending, onSubmit } = useFormAction(
    businessInfoFormSchema,
    (data) =>
      updateBusinessInfo({
        businessName: emptyToNull(data.businessName),
        businessNameKana: emptyToNull(data.businessNameKana),
        representativeName: emptyToNull(data.representativeName),
        businessType: emptyToNull(data.businessType),
        industryType: emptyToNull(data.industryType),
        establishedDate: data.establishedDate || null,
        registrationNumber: emptyToNull(data.registrationNumber),
        invoiceNumber: emptyToNull(data.invoiceNumber),
        businessDescription: emptyToNull(data.businessDescription),
      }),
    {
      defaultValues: {
        businessName: settings.businessName || "",
        businessNameKana: settings.businessNameKana || "",
        representativeName: settings.representativeName || "",
        businessType: settings.businessType || "",
        industryType: settings.industryType || "",
        establishedDate: dateInputValueFromSerialized(settings.establishedDate),
        registrationNumber: settings.registrationNumber || "",
        invoiceNumber: settings.invoiceNumber || "",
        businessDescription: settings.businessDescription || "",
      },
      refresh: true,
      successMessage: "事業者情報を保存しました",
    },
  );

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>事業者情報</CardTitle>
            <CardDescription>
              事業者の基本情報を設定します（特定商取引法表示などに使用）
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="businessName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>会社名・屋号</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="株式会社サンプル"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="businessNameKana"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>会社名・屋号（カナ）</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="カブシキガイシャサンプル"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="representativeName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>代表者名</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="山田 太郎"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="businessType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>事業形態</FormLabel>
                    <FormControl>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={isPending}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="選択してください" />
                        </SelectTrigger>
                        <SelectContent>
                          {BUSINESS_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="industryType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>業種</FormLabel>
                    <FormControl>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={isPending}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="選択してください" />
                        </SelectTrigger>
                        <SelectContent>
                          {INDUSTRY_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="establishedDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>設立日</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" disabled={isPending} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="registrationNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>法人番号</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="1234567890123"
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="invoiceNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>インボイス登録番号</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="T1234567890123"
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
              name="businessDescription"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>事業概要</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="事業内容の説明..."
                      rows={3}
                      disabled={isPending}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end pt-2">
              <SubmitButton
                isPending={isPending}
                label="事業者情報を保存"
                disabled={!form.formState.isDirty}
              />
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}
