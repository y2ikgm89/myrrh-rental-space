"use client";

/**
 * 顧客編集フォーム
 *
 * への clean break 移行。`updateCustomer` Server Action は `customer.id` を
 * `Function.prototype.bind` で部分適用する。Switch / Select は
 * `useInputControl` で hidden input と sync する公式パターン。
 *
 * Edit 固有: ① email blur 時の重複候補チェック (`/api/admin/customers/check-email`)
 * ② ソーシャル連携済み顧客のメール変更時の警告 ③ カナ自動入力の既存値 hydration。
 */

import {
  useActionState,
  useEffect,
  useState,
  type FocusEvent,
  type ReactElement,
} from "react";
import { useRouter } from "next/navigation";
import {
  getFormProps,
  getInputProps,
  getTextareaProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { z } from "zod";
import { toast } from "sonner";
import { updateCustomer } from "@/admin/actions/customer";
import { useKanaInput } from "@/admin/hooks";
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
  SubmitButton,
  Switch,
  Textarea,
} from "@/admin/components/ui";
import type { CustomerWithReservations } from "@/shared/domain/customers/types";
import { CustomerType } from "@/shared/lib/validations/enums/prisma-types";
import { CUSTOMER_TYPE_LABELS } from "@/shared/lib/validations/enums/helpers";
import { entriesOf } from "@/shared/lib/serialize";
import { isValidCustomerType } from "@/shared/lib/validations/enums/guards";
import { PREFECTURES, isPrefecture } from "@/shared/lib/customer-address";

type CustomerEditFormProps = {
  customer: CustomerWithReservations;
};

const checkEmailResponseSchema = z.object({
  available: z.literal(true),
  duplicateCandidate: z.boolean(),
  unlinkedDuplicateCandidate: z.boolean(),
});

export function CustomerEditForm({
  customer,
}: CustomerEditFormProps): ReactElement {
  const router = useRouter();
  const [emailDuplicateCandidate, setEmailDuplicateCandidate] = useState(false);
  const [emailUnlinkedDuplicateCandidate, setEmailUnlinkedDuplicateCandidate] =
    useState(false);

  const boundAction = updateCustomer.bind(null, customer.id);
  const [lastResult, action, isPending] = useActionState(
    boundAction,
    undefined,
  );

  const [form, fields] = useForm({
    id: `customer-edit-${customer.id}`,
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: customerFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      customerType: customer.customerType,
      lastName: customer.lastName,
      firstName: customer.firstName,
      lastNameKana: customer.lastNameKana ?? "",
      firstNameKana: customer.firstNameKana ?? "",
      companyName: customer.companyName ?? "",
      email: customer.email,
      phoneNumber: customer.phoneNumber ?? "",
      postalCode: customer.postalCode ?? "",
      prefecture: customer.prefecture ?? "",
      city: customer.city ?? "",
      streetAddress: customer.streetAddress ?? "",
      building: customer.building ?? "",
      notes: customer.notes ?? "",
      marketingOptIn: customer.marketingOptIn ? "on" : "",
      phoneContactOptIn: customer.phoneContactOptIn ? "on" : "",
    },
  });

  const customerTypeControl = useInputControl(fields.customerType);
  const prefectureControl = useInputControl(fields.prefecture);
  const emailControl = useInputControl(fields.email);
  const marketingOptInControl = useInputControl(fields.marketingOptIn);
  const phoneContactOptInControl = useInputControl(fields.phoneContactOptIn);

  const customerType = customerTypeControl.value ?? customer.customerType;
  const prefecture = prefectureControl.value ?? customer.prefecture ?? "";
  const watchedEmail = emailControl.value ?? customer.email;
  const marketingOptIn = marketingOptInControl.value === "on";
  const phoneContactOptIn = phoneContactOptInControl.value === "on";

  const isEmailChanged = watchedEmail !== customer.email;
  const showSocialLinkWarning =
    isEmailChanged && customer.userId !== null && watchedEmail !== "";
  const emailBlockedByGuestDuplicate =
    customer.userId === null && emailUnlinkedDuplicateCandidate;
  const emailDuplicateWarningId = `${fields.email.id}-duplicate-candidate`;
  const emailDuplicateErrorId = `${fields.email.id}-duplicate-error`;
  const emailSocialWarningId = `${fields.email.id}-social-warning`;
  const emailDescribedBy = fields.email.errors
    ? fields.email.errorId
    : [
        emailBlockedByGuestDuplicate ? emailDuplicateErrorId : null,
        emailDuplicateCandidate ? emailDuplicateWarningId : null,
        showSocialLinkWarning ? emailSocialWarningId : null,
      ]
        .filter((id): id is string => id !== null)
        .join(" ") || undefined;

  function handleCustomerTypeChange(value: string) {
    if (!isValidCustomerType(value)) return;
    customerTypeControl.change(value);
    if (value === CustomerType.PERSONAL) {
      // 法人 → 個人切替時に会社名をクリア (conform は field の reset API がないため
      // hidden な form の re-render はしない、submit 時は schema で空文字許容)
    }
  }

  function handlePrefectureChange(value: string) {
    if (!isPrefecture(value)) return;
    prefectureControl.change(value);
  }

  async function handleEmailBlur(event: FocusEvent<HTMLInputElement>) {
    emailControl.blur();
    const email = event.target.value;
    if (!email || email === customer.email) {
      setEmailDuplicateCandidate(false);
      setEmailUnlinkedDuplicateCandidate(false);
      return;
    }
    try {
      const response = await fetch(
        `/api/admin/customers/check-email?email=${encodeURIComponent(email)}&excludeId=${customer.id}`,
      );
      if (!response.ok) {
        setEmailDuplicateCandidate(false);
        setEmailUnlinkedDuplicateCandidate(false);
        return;
      }
      const parsed = checkEmailResponseSchema.safeParse(await response.json());
      setEmailDuplicateCandidate(
        parsed.success && parsed.data.duplicateCandidate,
      );
      setEmailUnlinkedDuplicateCandidate(
        parsed.success && parsed.data.unlinkedDuplicateCandidate,
      );
    } catch {
      // 候補チェック失敗は silent。Customer.email は保存ブロック条件ではない。
      setEmailDuplicateCandidate(false);
      setEmailUnlinkedDuplicateCandidate(false);
    }
  }

  // IME 自動カナ入力（既存データで初期化）
  const lastNameKanaInput = useKanaInput({
    initialKana: customer.lastNameKana ?? "",
  });
  const firstNameKanaInput = useKanaInput({
    initialKana: customer.firstNameKana ?? "",
  });

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("顧客情報を更新しました");
      router.push(`/admin/customers/${customer.id}`);
    }
  }, [lastResult, router, customer.id]);

  const formErrors = form.errors;

  return (
    <form {...getFormProps(form)} action={action}>
      <Card className="p-6">
        <div className="space-y-6">
          {/* 区分 */}
          <div className="space-y-2">
            <Label htmlFor={fields.customerType.id}>区分</Label>
            <Select
              value={customerType}
              onValueChange={handleCustomerTypeChange}
            >
              <SelectTrigger
                id={fields.customerType.id}
                onBlur={customerTypeControl.blur}
              >
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
            <input
              type="hidden"
              name={fields.customerType.name}
              value={customerType}
            />
            {fields.customerType.errors && (
              <p
                id={fields.customerType.errorId}
                className="text-xs text-destructive"
              >
                {fields.customerType.errors.join(", ")}
              </p>
            )}
          </div>

          {/* 氏名 */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={fields.lastName.id}>
                姓 <span className="text-destructive">*</span>
              </Label>
              <Input
                {...getInputProps(fields.lastName, { type: "text" })}
                placeholder="山田"
                disabled={isPending}
                onCompositionStart={
                  lastNameKanaInput.inputProps.onCompositionStart
                }
                onCompositionUpdate={
                  lastNameKanaInput.inputProps.onCompositionUpdate
                }
                onCompositionEnd={lastNameKanaInput.inputProps.onCompositionEnd}
                onInput={lastNameKanaInput.inputProps.onInput}
              />
              {fields.lastName.errors && (
                <p
                  id={fields.lastName.errorId}
                  className="text-xs text-destructive"
                >
                  {fields.lastName.errors.join(", ")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor={fields.firstName.id}>
                名 <span className="text-destructive">*</span>
              </Label>
              <Input
                {...getInputProps(fields.firstName, { type: "text" })}
                placeholder="太郎"
                disabled={isPending}
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
              {fields.firstName.errors && (
                <p
                  id={fields.firstName.errorId}
                  className="text-xs text-destructive"
                >
                  {fields.firstName.errors.join(", ")}
                </p>
              )}
            </div>
          </div>

          {/* カナ（リアルタイム自動入力） */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={fields.lastNameKana.id}>
                セイ
                <span className="text-xs text-muted-foreground ml-2">
                  （自動入力）
                </span>
              </Label>
              <Input
                id={fields.lastNameKana.id}
                name={fields.lastNameKana.name}
                placeholder="ヤマダ"
                value={lastNameKanaInput.kana}
                onChange={(e) => lastNameKanaInput.setKana(e.target.value)}
                disabled={isPending}
              />
              {fields.lastNameKana.errors && (
                <p
                  id={fields.lastNameKana.errorId}
                  className="text-xs text-destructive"
                >
                  {fields.lastNameKana.errors.join(", ")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor={fields.firstNameKana.id}>
                メイ
                <span className="text-xs text-muted-foreground ml-2">
                  （自動入力）
                </span>
              </Label>
              <Input
                id={fields.firstNameKana.id}
                name={fields.firstNameKana.name}
                placeholder="タロウ"
                value={firstNameKanaInput.kana}
                onChange={(e) => firstNameKanaInput.setKana(e.target.value)}
                disabled={isPending}
              />
              {fields.firstNameKana.errors && (
                <p
                  id={fields.firstNameKana.errorId}
                  className="text-xs text-destructive"
                >
                  {fields.firstNameKana.errors.join(", ")}
                </p>
              )}
            </div>
          </div>

          {/* 会社名・団体名（法人時のみ表示） */}
          {customerType === CustomerType.CORPORATE && (
            <div className="space-y-2">
              <Label htmlFor={fields.companyName.id}>
                会社名・団体名 <span className="text-destructive">*</span>
              </Label>
              <Input
                {...getInputProps(fields.companyName, { type: "text" })}
                placeholder="株式会社〇〇"
                disabled={isPending}
              />
              {fields.companyName.errors && (
                <p
                  id={fields.companyName.errorId}
                  className="text-xs text-destructive"
                >
                  {fields.companyName.errors.join(", ")}
                </p>
              )}
            </div>
          )}

          {/* メールアドレス */}
          <div className="space-y-2">
            <Label htmlFor={fields.email.id}>
              メールアドレス <span className="text-destructive">*</span>
            </Label>
            <Input
              {...getInputProps(fields.email, { type: "email" })}
              autoComplete="email"
              placeholder="example@example.com"
              onBlur={handleEmailBlur}
              disabled={isPending}
              aria-invalid={
                fields.email.errors || emailBlockedByGuestDuplicate
                  ? true
                  : undefined
              }
              aria-describedby={emailDescribedBy}
            />
            {fields.email.errors && (
              <p id={fields.email.errorId} className="text-xs text-destructive">
                {fields.email.errors.join(", ")}
              </p>
            )}
            {!fields.email.errors && emailBlockedByGuestDuplicate && (
              <p
                id={emailDuplicateErrorId}
                className="text-xs text-destructive"
              >
                同じメールアドレスの未リンク顧客が既に存在します。既存顧客を編集するか、顧客マージを行ってください。
              </p>
            )}
            {!fields.email.errors &&
              !emailBlockedByGuestDuplicate &&
              emailDuplicateCandidate && (
                <p
                  id={emailDuplicateWarningId}
                  className="text-xs text-warning-strong"
                >
                  同じメールアドレスの顧客候補があります。必要に応じて顧客詳細から確認してください。
                </p>
              )}
            {!fields.email.errors && showSocialLinkWarning && (
              <p id={emailSocialWarningId} className="text-xs text-warning">
                ソーシャル連携済みの顧客のメールアドレスを変更すると、連携が解除される可能性があります。
              </p>
            )}
          </div>

          {/* 電話番号 */}
          <div className="space-y-2">
            <Label htmlFor={fields.phoneNumber.id}>電話番号</Label>
            <Input
              {...getInputProps(fields.phoneNumber, { type: "tel" })}
              placeholder="090-1234-5678"
              disabled={isPending}
            />
            {fields.phoneNumber.errors && (
              <p
                id={fields.phoneNumber.errorId}
                className="text-xs text-destructive"
              >
                {fields.phoneNumber.errors.join(", ")}
              </p>
            )}
          </div>

          {/* 住所 */}
          <fieldset className="space-y-4 rounded-lg border p-4">
            <legend className="px-1 text-sm font-medium">住所</legend>
            <div className="space-y-2">
              <Label htmlFor={fields.postalCode.id}>郵便番号</Label>
              <Input
                {...getInputProps(fields.postalCode, { type: "text" })}
                placeholder="123-4567"
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={8}
                className="max-w-[10rem]"
                disabled={isPending}
              />
              {fields.postalCode.errors && (
                <p
                  id={fields.postalCode.errorId}
                  className="text-xs text-destructive"
                >
                  {fields.postalCode.errors.join(", ")}
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
              <div className="space-y-2">
                <Label htmlFor={fields.prefecture.id}>都道府県</Label>
                <Select
                  {...(prefecture ? { value: prefecture } : {})}
                  onValueChange={handlePrefectureChange}
                >
                  <SelectTrigger
                    id={fields.prefecture.id}
                    onBlur={prefectureControl.blur}
                  >
                    <SelectValue placeholder="選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    {PREFECTURES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input
                  type="hidden"
                  name={fields.prefecture.name}
                  value={prefecture}
                />
                {fields.prefecture.errors && (
                  <p className="text-xs text-destructive">
                    {fields.prefecture.errors.join(", ")}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor={fields.city.id}>市区町村</Label>
                <Input
                  {...getInputProps(fields.city, { type: "text" })}
                  placeholder="渋谷区"
                  autoComplete="address-level2"
                  disabled={isPending}
                />
                {fields.city.errors && (
                  <p
                    id={fields.city.errorId}
                    className="text-xs text-destructive"
                  >
                    {fields.city.errors.join(", ")}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor={fields.streetAddress.id}>町名・番地</Label>
              <Input
                {...getInputProps(fields.streetAddress, { type: "text" })}
                placeholder="神宮前1-1-1"
                autoComplete="address-line1"
                disabled={isPending}
              />
              {fields.streetAddress.errors && (
                <p
                  id={fields.streetAddress.errorId}
                  className="text-xs text-destructive"
                >
                  {fields.streetAddress.errors.join(", ")}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor={fields.building.id}>建物名・部屋番号</Label>
              <Input
                {...getInputProps(fields.building, { type: "text" })}
                placeholder="サンプルビル 2F"
                autoComplete="address-line2"
                disabled={isPending}
              />
              {fields.building.errors && (
                <p
                  id={fields.building.errorId}
                  className="text-xs text-destructive"
                >
                  {fields.building.errors.join(", ")}
                </p>
              )}
            </div>
          </fieldset>

          {/* 連絡可否 */}
          <fieldset className="space-y-3 rounded-lg border p-4">
            <legend className="px-1 text-sm font-medium">連絡可否</legend>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label
                  htmlFor={fields.marketingOptIn.id}
                  className="cursor-pointer"
                >
                  メルマガ・キャンペーン受信
                </Label>
                <p className="text-xs text-muted-foreground">
                  プロモーション・お知らせメールの送信を許可
                </p>
              </div>
              <Switch
                id={fields.marketingOptIn.id}
                checked={marketingOptIn}
                onCheckedChange={(checked) =>
                  marketingOptInControl.change(checked ? "on" : "")
                }
                onBlur={marketingOptInControl.blur}
                disabled={isPending}
              />
              <input
                type="hidden"
                name={fields.marketingOptIn.name}
                value={marketingOptIn ? "on" : ""}
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label
                  htmlFor={fields.phoneContactOptIn.id}
                  className="cursor-pointer"
                >
                  電話連絡
                </Label>
                <p className="text-xs text-muted-foreground">
                  予約確認・トラブル対応等の電話連絡を許可
                </p>
              </div>
              <Switch
                id={fields.phoneContactOptIn.id}
                checked={phoneContactOptIn}
                onCheckedChange={(checked) =>
                  phoneContactOptInControl.change(checked ? "on" : "")
                }
                onBlur={phoneContactOptInControl.blur}
                disabled={isPending}
              />
              <input
                type="hidden"
                name={fields.phoneContactOptIn.name}
                value={phoneContactOptIn ? "on" : ""}
              />
            </div>
          </fieldset>

          {/* メモ */}
          <div className="space-y-2">
            <Label htmlFor={fields.notes.id}>メモ</Label>
            <Textarea
              {...getTextareaProps(fields.notes)}
              placeholder="顧客に関するメモ..."
              rows={4}
              disabled={isPending}
            />
            {fields.notes.errors && (
              <p id={fields.notes.errorId} className="text-xs text-destructive">
                {fields.notes.errors.join(", ")}
              </p>
            )}
          </div>

          {formErrors && formErrors.length > 0 && (
            <div
              id={form.errorId}
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {formErrors.join(", ")}
            </div>
          )}

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
              disabled={emailBlockedByGuestDuplicate}
            />
          </div>
        </div>
      </Card>
    </form>
  );
}
