"use client";

/**
 * 顧客新規作成フォーム
 *
 * への clean break 移行。Switch / Select は `useInputControl` で hidden input
 * と sync する公式パターン (https://conform.guide/api/react/useInputControl)。
 * カナ自動入力は `useKanaInput` 互換 (内部 state → 同 name の controlled input)。
 */

import {
  startTransition,
  useActionState,
  useEffect,
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
import { createCustomer } from "@/admin/actions/customer";
import { useKanaInput } from "@/admin/hooks";
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
import { CustomerType } from "@/shared/lib/validations/enums/prisma-types";
import { CUSTOMER_TYPE_LABELS } from "@/shared/lib/validations/enums/helpers";
import { entriesOf } from "@/shared/lib/serialize";
import { isValidCustomerType } from "@/shared/lib/validations/enums/guards";
import { PREFECTURES, isPrefecture } from "@/shared/lib/customer-address";
import { toast } from "sonner";
import { useCustomerEmailDuplicateCheck } from "./customer-email-duplicate-check";

export function CustomerForm(): ReactElement {
  const router = useRouter();
  const [lastResult, action, isPending] = useActionState(
    createCustomer,
    undefined,
  );
  const [form, fields] = useForm({
    id: "customer-create",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: customerFormSchema });
    },
    // **hydration 後の submit は React に渡さず、ここから自分で action を呼ぶ。**
    //
    // React 19 は `action` prop に渡した関数が resolve した時点でフォームを
    // 自動リセットする（公式 Server Functions:「React handles the submission and
    // automatically resets the form upon success」）。`useActionState` の action は
    // throw せず `SubmissionResult` を返すため、**サーバーが form-level エラーを
    // 返した応答もリセット対象**になる。
    //
    // リセットで input が空になると conform は空の FormData で再検証し、
    // その結果（全必須項目が `Invalid input: expected string, received undefined`）
    // が **サーバーの form-level エラーを上書きして消す**。実測
    // (CI run 30695870083 の trace): VIEWER が顧客作成を submit すると
    // サーバーは `customerのcreate権限がありません` を返し +76ms で
    // `aria-describedby="customer-create-error"` まで付いているのに、+236ms で
    // その表示が消え、空欄由来の field error だけが残っていた。
    // ユーザーには **拒否理由が伝わらず入力も全消失**する。
    //
    // conform の `onSubmit` は「client 検証を通過 **かつ** intent submission
    // ではない」ときだけ呼ばれる公式の拡張点（`createFormContext` が
    // `formData.has(INTENT)` で除外する）。ここで `preventDefault()` してから
    // `startTransition` で action を呼べば auto-reset は起きず、`lastResult` の
    // 値とエラーがそのまま残る。react-dom の form action listener は
    // `nativeEvent.defaultPrevented` を見て `startHostTransition(…, null, formData)`
    // （action = null）で抜けるため、**preventDefault 済みの submit で action が
    // 二重に走ることはない**。conform の onSubmit は React の listener より先に
    // 走る（client 検証が落ちた submit が Server Action に到達しないのと同じ順序）。
    //
    // **`action` prop は外さないこと。** `getFormProps` が返すのは
    // id / onSubmit / noValidate / aria 属性だけで **`method` を含まない**。
    // `action` を外すと SSR された form は action も method も持たず、hydration 前に
    // submit したユーザーはネイティブ **GET** で現在の URL に飛ばされ、
    // 氏名・メール・電話番号・住所が **クエリ文字列に載って履歴とアクセスログに残る**。
    // `action` を残せば React が SSR 時に action / `method="POST"` / `$ACTION_ID`
    // hidden を出力するので、hydration 前は POST fallback として正しく動く。
    //
    // @see https://react.dev/reference/rsc/server-functions
    onSubmit(event, { formData }) {
      event.preventDefault();
      startTransition(() => {
        action(formData);
      });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      customerType: CustomerType.PERSONAL,
      marketingOptIn: "",
      phoneContactOptIn: "on",
    },
  });

  const customerTypeControl = useInputControl(fields.customerType);
  const prefectureControl = useInputControl(fields.prefecture);
  const emailControl = useInputControl(fields.email);
  const marketingOptInControl = useInputControl(fields.marketingOptIn);
  const phoneContactOptInControl = useInputControl(fields.phoneContactOptIn);
  const {
    duplicateCandidate: emailDuplicateCandidate,
    unlinkedDuplicateCandidate: emailUnlinkedDuplicateCandidate,
    checkEmail,
    resetEmailDuplicateCheck,
  } = useCustomerEmailDuplicateCheck();

  const customerType = customerTypeControl.value ?? CustomerType.PERSONAL;
  const prefecture = prefectureControl.value ?? "";
  const marketingOptIn = marketingOptInControl.value === "on";
  const phoneContactOptIn = phoneContactOptInControl.value === "on";
  const emailBlockedByGuestDuplicate = emailUnlinkedDuplicateCandidate;
  const emailDuplicateWarningId = `${fields.email.id}-duplicate-candidate`;
  const emailDuplicateErrorId = `${fields.email.id}-duplicate-error`;
  const emailDescribedBy = fields.email.errors
    ? fields.email.errorId
    : [
        emailBlockedByGuestDuplicate ? emailDuplicateErrorId : null,
        emailDuplicateCandidate ? emailDuplicateWarningId : null,
      ]
        .filter((id): id is string => id !== null)
        .join(" ") || undefined;

  function handleCustomerTypeChange(value: string) {
    if (!isValidCustomerType(value)) return;
    customerTypeControl.change(value);
  }

  function handlePrefectureChange(value: string) {
    if (!isPrefecture(value)) return;
    prefectureControl.change(value);
  }

  async function handleEmailBlur(event: FocusEvent<HTMLInputElement>) {
    emailControl.blur();
    const email = event.target.value;
    if (!email) {
      resetEmailDuplicateCheck();
      return;
    }
    await checkEmail(email);
  }

  // IME 自動カナ入力 — `useKanaInput` 内部 state を kana input の value に bind し、
  // conform field の name を hidden input ではなく直接 visible input に付与する。
  const lastNameKanaInput = useKanaInput({});
  const firstNameKanaInput = useKanaInput({});

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("顧客を作成しました");
      router.push("/admin/customers");
    }
  }, [lastResult, router]);

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
                aria-invalid={fields.customerType.errors ? true : undefined}
                aria-describedby={
                  fields.customerType.errors
                    ? fields.customerType.errorId
                    : undefined
                }
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
                aria-invalid={fields.lastNameKana.errors ? true : undefined}
                aria-describedby={
                  fields.lastNameKana.errors
                    ? fields.lastNameKana.errorId
                    : undefined
                }
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
                aria-invalid={fields.firstNameKana.errors ? true : undefined}
                aria-describedby={
                  fields.firstNameKana.errors
                    ? fields.firstNameKana.errorId
                    : undefined
                }
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
              onBlur={(event) => void handleEmailBlur(event)}
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
                    aria-invalid={fields.prefecture.errors ? true : undefined}
                    aria-describedby={
                      fields.prefecture.errors
                        ? fields.prefecture.errorId
                        : undefined
                    }
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
                  <p
                    id={fields.prefecture.errorId}
                    className="text-xs text-destructive"
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
              onClick={() => router.back()}
            >
              キャンセル
            </Button>
            <SubmitButton
              isPending={isPending}
              label="顧客を作成"
              pendingLabel="作成中..."
              disabled={emailBlockedByGuestDuplicate}
            />
          </div>
        </div>
      </Card>
    </form>
  );
}
