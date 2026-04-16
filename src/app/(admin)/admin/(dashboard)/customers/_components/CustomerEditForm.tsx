"use client";

import type { ReactElement } from "react";
import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
import { useFormAction } from "@/admin/hooks";
import { updateCustomer } from "@/admin/actions/customer";
import { customerFormSchema } from "@/shared/lib/validations/customer";
import {
  Button,
  Card,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  SubmitButton,
} from "@/admin/components/ui";
import type { CustomerWithReservations } from "@/shared/domain/customers/types";
import { useKanaInput } from "@/admin/hooks";
import { CustomerType } from "@/shared/lib/validations/enums/prisma-types";
import { CUSTOMER_TYPE_LABELS } from "@/shared/lib/validations/enums/helpers";
import { entriesOf } from "@/shared/lib/serialize";
import { isValidCustomerType } from "@/shared/lib/validations/enums/guards";

type CustomerEditFormProps = {
  customer: CustomerWithReservations;
};

export function CustomerEditForm({
  customer,
}: CustomerEditFormProps): ReactElement {
  const router = useRouter();

  const { form, isPending, onSubmit } = useFormAction(
    customerFormSchema,
    (data) => updateCustomer(customer.id, data),
    {
      redirectTo: `/admin/customers/${customer.id}`,
      successMessage: "顧客情報を更新しました",
      defaultValues: {
        customerType: customer.customerType,
        lastName: customer.lastName,
        firstName: customer.firstName,
        lastNameKana: customer.lastNameKana ?? "",
        firstNameKana: customer.firstNameKana ?? "",
        companyName: customer.companyName ?? "",
        email: customer.email,
        phoneNumber: customer.phoneNumber ?? "",
        address: customer.address ?? "",
        notes: customer.notes ?? "",
      },
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

  function handleCustomerTypeChange(value: string) {
    if (!isValidCustomerType(value)) return;
    setValue("customerType", value, { shouldDirty: true });
    if (value === CustomerType.PERSONAL) {
      setValue("companyName", "");
      form.clearErrors("companyName");
    }
  }

  // IME 自動カナ入力（既存データで初期化）
  const lastNameKanaInput = useKanaInput({
    initialKana: customer.lastNameKana ?? "",
    onKanaChange: (kana) => setValue("lastNameKana", kana),
  });
  const firstNameKanaInput = useKanaInput({
    initialKana: customer.firstNameKana ?? "",
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
          <div className="space-y-2">
            <Label htmlFor="address">住所</Label>
            <Input
              id="address"
              {...register("address")}
              placeholder="東京都渋谷区..."
              aria-invalid={!!errors.address}
              aria-describedby={errors.address ? "address-error" : undefined}
            />
            {errors.address && (
              <p id="address-error" className="text-xs text-destructive">
                {errors.address.message}
              </p>
            )}
          </div>

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
              onClick={() => router.push(`/admin/customers/${customer.id}`)}
            >
              キャンセル
            </Button>
            <SubmitButton
              isPending={isPending}
              label="顧客情報を更新"
              pendingLabel="更新中..."
              disabled={!form.formState.isDirty}
            />
          </div>
        </div>
      </Card>
    </form>
  );
}
