"use client";

import type { ReactElement } from "react";
import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
import { useFormAction } from "@/admin/hooks";
import { createCustomer } from "@/admin/actions/customer";
import { customerFormSchema } from "@/shared/lib/validations/customer";
import {
  Button,
  Input,
  Label,
  Card,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  SubmitButton,
} from "@/admin/components/ui";
import { useKanaInput } from "@/admin/hooks";
import { CustomerType } from "@/shared/lib/validations/enums/prisma-types";
import { CUSTOMER_TYPE_LABELS } from "@/shared/lib/validations/enums/helpers";
import { entriesOf } from "@/shared/lib/serialize";
import { isValidCustomerType } from "@/shared/lib/validations/enums/guards";
import { PREFECTURES, isPrefecture } from "@/shared/lib/customer-address";

export function CustomerForm(): ReactElement {
  const router = useRouter();

  const { form, isPending, onSubmit } = useFormAction(
    customerFormSchema,
    (data) => createCustomer(data),
    {
      redirectTo: "/admin/customers",
      successMessage: "顧客を作成しました",
    },
  );

  const {
    register,
    setValue,
    formState: { errors },
  } = form;

  const customerType = useWatch({
    control: form.control,
    name: "customerType",
  });

  const watchedPrefecture = useWatch({
    control: form.control,
    name: "prefecture",
  });

  const watchedMarketingOptIn = useWatch({
    control: form.control,
    name: "marketingOptIn",
  });

  const watchedPhoneContactOptIn = useWatch({
    control: form.control,
    name: "phoneContactOptIn",
  });

  function handleCustomerTypeChange(value: string) {
    if (!isValidCustomerType(value)) return;
    setValue("customerType", value, { shouldDirty: true });
    if (value === CustomerType.PERSONAL) {
      setValue("companyName", "");
      form.clearErrors("companyName");
    }
  }

  function handlePrefectureChange(value: string) {
    if (!isPrefecture(value)) return;
    setValue("prefecture", value, { shouldDirty: true });
  }

  // IME 自動カナ入力
  const lastNameKanaInput = useKanaInput({
    onKanaChange: (kana) => setValue("lastNameKana", kana),
  });
  const firstNameKanaInput = useKanaInput({
    onKanaChange: (kana) => setValue("firstNameKana", kana),
  });

  return (
    <form onSubmit={onSubmit}>
      <Card className="p-6">
        <div className="space-y-6">
          {/* 区分 */}
          <div className="space-y-2">
            <Label htmlFor="customerType">区分</Label>
            <Select
              value={customerType ?? CustomerType.PERSONAL}
              onValueChange={handleCustomerTypeChange}
            >
              <SelectTrigger id="customerType">
                <SelectValue placeholder="区分を選択" />
              </SelectTrigger>
              <SelectContent>
                {entriesOf(CUSTOMER_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 氏名 */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="lastName">
                姓 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lastName"
                {...register("lastName")}
                placeholder="山田"
                aria-invalid={!!errors.lastName}
                aria-describedby={
                  errors.lastName ? "lastName-error" : undefined
                }
                onCompositionStart={
                  lastNameKanaInput.inputProps.onCompositionStart
                }
                onCompositionUpdate={
                  lastNameKanaInput.inputProps.onCompositionUpdate
                }
                onCompositionEnd={lastNameKanaInput.inputProps.onCompositionEnd}
                onInput={lastNameKanaInput.inputProps.onInput}
              />
              {errors.lastName && (
                <p id="lastName-error" className="text-xs text-destructive">
                  {errors.lastName.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="firstName">
                名 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="firstName"
                {...register("firstName")}
                placeholder="太郎"
                aria-invalid={!!errors.firstName}
                aria-describedby={
                  errors.firstName ? "firstName-error" : undefined
                }
                onCompositionStart={
                  firstNameKanaInput.inputProps.onCompositionStart
                }
                onCompositionUpdate={
                  firstNameKanaInput.inputProps.onCompositionUpdate
                }
                onCompositionEnd={
                  firstNameKanaInput.inputProps.onCompositionEnd
                }
                onInput={firstNameKanaInput.inputProps.onInput}
              />
              {errors.firstName && (
                <p id="firstName-error" className="text-xs text-destructive">
                  {errors.firstName.message}
                </p>
              )}
            </div>
          </div>

          {/* カナ（リアルタイム自動入力） */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="lastNameKana">
                セイ
                <span className="text-xs text-muted-foreground ml-2">
                  （自動入力）
                </span>
              </Label>
              <Input
                id="lastNameKana"
                name="lastNameKana"
                placeholder="ヤマダ"
                value={lastNameKanaInput.kana}
                onChange={(e) => lastNameKanaInput.setKana(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="firstNameKana">
                メイ
                <span className="text-xs text-muted-foreground ml-2">
                  （自動入力）
                </span>
              </Label>
              <Input
                id="firstNameKana"
                name="firstNameKana"
                placeholder="タロウ"
                value={firstNameKanaInput.kana}
                onChange={(e) => firstNameKanaInput.setKana(e.target.value)}
              />
            </div>
          </div>

          {/* 会社名・団体名（法人時のみ表示） */}
          {customerType === CustomerType.CORPORATE && (
            <div className="space-y-2">
              <Label htmlFor="companyName">
                会社名・団体名 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="companyName"
                {...register("companyName")}
                placeholder="株式会社〇〇"
                aria-invalid={!!errors.companyName}
                aria-describedby={
                  errors.companyName ? "companyName-error" : undefined
                }
              />
              {errors.companyName && (
                <p id="companyName-error" className="text-xs text-destructive">
                  {errors.companyName.message}
                </p>
              )}
            </div>
          )}

          {/* メールアドレス */}
          <div className="space-y-2">
            <Label htmlFor="email">
              メールアドレス <span className="text-destructive">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              {...register("email")}
              placeholder="example@example.com"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "email-error" : undefined}
            />
            {errors.email && (
              <p id="email-error" className="text-xs text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>

          {/* 電話番号 */}
          <div className="space-y-2">
            <Label htmlFor="phoneNumber">電話番号</Label>
            <Input
              id="phoneNumber"
              type="tel"
              {...register("phoneNumber")}
              placeholder="090-1234-5678"
              aria-invalid={!!errors.phoneNumber}
              aria-describedby={
                errors.phoneNumber ? "phoneNumber-error" : undefined
              }
            />
            {errors.phoneNumber && (
              <p id="phoneNumber-error" className="text-xs text-destructive">
                {errors.phoneNumber.message}
              </p>
            )}
          </div>

          {/* 住所 */}
          <fieldset className="space-y-4 rounded-lg border p-4">
            <legend className="px-1 text-sm font-medium">住所</legend>
            <div className="space-y-2">
              <Label htmlFor="postalCode">郵便番号</Label>
              <Input
                id="postalCode"
                {...register("postalCode")}
                placeholder="123-4567"
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={8}
                className="max-w-[10rem]"
                aria-invalid={!!errors.postalCode}
                aria-describedby={
                  errors.postalCode ? "postalCode-error" : undefined
                }
              />
              {errors.postalCode && (
                <p id="postalCode-error" className="text-xs text-destructive">
                  {errors.postalCode.message}
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
              <div className="space-y-2">
                <Label htmlFor="prefecture">都道府県</Label>
                <Select
                  {...(watchedPrefecture ? { value: watchedPrefecture } : {})}
                  onValueChange={handlePrefectureChange}
                >
                  <SelectTrigger id="prefecture">
                    <SelectValue placeholder="選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {PREFECTURES.map((prefecture) => (
                      <SelectItem key={prefecture} value={prefecture}>
                        {prefecture}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.prefecture && (
                  <p className="text-xs text-destructive">
                    {errors.prefecture.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">市区町村</Label>
                <Input
                  id="city"
                  {...register("city")}
                  placeholder="渋谷区"
                  autoComplete="address-level2"
                  aria-invalid={!!errors.city}
                  aria-describedby={errors.city ? "city-error" : undefined}
                />
                {errors.city && (
                  <p id="city-error" className="text-xs text-destructive">
                    {errors.city.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="streetAddress">町名・番地</Label>
              <Input
                id="streetAddress"
                {...register("streetAddress")}
                placeholder="神宮前1-1-1"
                autoComplete="address-line1"
                aria-invalid={!!errors.streetAddress}
                aria-describedby={
                  errors.streetAddress ? "streetAddress-error" : undefined
                }
              />
              {errors.streetAddress && (
                <p
                  id="streetAddress-error"
                  className="text-xs text-destructive"
                >
                  {errors.streetAddress.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="building">建物名・部屋番号</Label>
              <Input
                id="building"
                {...register("building")}
                placeholder="サンプルビル 2F"
                autoComplete="address-line2"
                aria-invalid={!!errors.building}
                aria-describedby={
                  errors.building ? "building-error" : undefined
                }
              />
              {errors.building && (
                <p id="building-error" className="text-xs text-destructive">
                  {errors.building.message}
                </p>
              )}
            </div>
          </fieldset>

          {/* 連絡可否 */}
          <fieldset className="space-y-3 rounded-lg border p-4">
            <legend className="px-1 text-sm font-medium">連絡可否</legend>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="marketingOptIn" className="cursor-pointer">
                  メルマガ・キャンペーン受信
                </Label>
                <p className="text-xs text-muted-foreground">
                  プロモーション・お知らせメールの送信を許可
                </p>
              </div>
              <Switch
                id="marketingOptIn"
                checked={watchedMarketingOptIn ?? false}
                onCheckedChange={(checked) =>
                  setValue("marketingOptIn", checked, { shouldDirty: true })
                }
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="phoneContactOptIn" className="cursor-pointer">
                  電話連絡
                </Label>
                <p className="text-xs text-muted-foreground">
                  予約確認・トラブル対応等の電話連絡を許可
                </p>
              </div>
              <Switch
                id="phoneContactOptIn"
                checked={watchedPhoneContactOptIn ?? true}
                onCheckedChange={(checked) =>
                  setValue("phoneContactOptIn", checked, { shouldDirty: true })
                }
              />
            </div>
          </fieldset>

          {/* メモ */}
          <div className="space-y-2">
            <Label htmlFor="notes">メモ</Label>
            <Textarea
              id="notes"
              {...register("notes")}
              placeholder="顧客に関するメモ..."
              rows={4}
              aria-invalid={!!errors.notes}
              aria-describedby={errors.notes ? "notes-error" : undefined}
            />
            {errors.notes && (
              <p id="notes-error" className="text-xs text-destructive">
                {errors.notes.message}
              </p>
            )}
          </div>

          {/* 送信ボタン */}
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              キャンセル
            </Button>
            <SubmitButton
              isPending={isPending}
              label="顧客を作成"
              pendingLabel="作成中..."
            />
          </div>
        </div>
      </Card>
    </form>
  );
}
