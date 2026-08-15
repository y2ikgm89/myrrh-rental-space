"use client";

/**
 * データ保持ポリシー（保持月数）設定フォーム
 *
 * SettingsDataRetention.dataRetention JSON を編集する。
 * `0` は該当テーブルの opt-out。実 purge は feature module `data-retention` が
 * ON かつ月数 > 0 の field のみ cron から実行される。
 */

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getFormProps, getInputProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { toast } from "sonner";
import { updateDataRetentionSettings } from "@/admin/actions/settings";
import { dataRetentionSettingsSchema } from "@/admin/actions/settings/schemas/basic";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  SubmitButton,
} from "@/admin/components/ui";
import type { DataRetentionConfig } from "@/shared/lib/json-validators";
import { dispatchWithoutFormReset } from "@/shared/lib/forms/conform-submit";

const RETENTION_FIELDS = [
  {
    key: "sessionMonths",
    label: "セッション",
    hint: "認証セッション（Session テーブル）",
  },
  {
    key: "verificationMonths",
    label: "認証トークン",
    hint: "Better Auth の Verification トークン",
  },
  {
    key: "reservationGuestMonths",
    label: "予約ゲスト情報",
    hint: "予約終了後に guest フィールドを NULL 化",
  },
  {
    key: "inquiryMonths",
    label: "問い合わせ",
    hint: "Inquiry の hard delete（添付 R2 含む）",
  },
  {
    key: "customerInactiveMonths",
    label: "非アクティブ顧客",
    hint: "status=INACTIVE かつ dormant な Customer の PII 匿名化",
  },
] as const satisfies ReadonlyArray<{
  readonly key: keyof DataRetentionConfig;
  readonly label: string;
  readonly hint: string;
}>;

interface DataRetentionSettingsFormProps {
  readonly initialValues: DataRetentionConfig;
  readonly dataRetentionUpdatedAt: string | Date;
}

const OPTIMISTIC_CONFLICT_HINT = "他のユーザーにより更新されています";

export function DataRetentionSettingsForm({
  initialValues,
  dataRetentionUpdatedAt,
}: DataRetentionSettingsFormProps) {
  const router = useRouter();
  const [lastResult, action, isPending] = useActionState(
    updateDataRetentionSettings,
    undefined,
  );

  const [form, fields] = useForm({
    id: "data-retention-settings",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: dataRetentionSettingsSchema });
    },
    // React 19 の form auto-reset がサーバーの form-level エラーと入力値を
    // 消すのを防ぐ（理由と `action` prop を残す必要性は helper の JSDoc）。
    onSubmit: dispatchWithoutFormReset(action),
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      ...Object.fromEntries(
        RETENTION_FIELDS.map(({ key }) => [key, String(initialValues[key])]),
      ),
      expectedUpdatedAt: dataRetentionUpdatedAt,
    },
  });

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success("データ保持ポリシーを保存しました");
      router.refresh();
      return;
    }
    if (lastResult?.status === "error") {
      const formLevelErrors = lastResult.error?.[""];
      const conflictMessage = formLevelErrors?.find((message) =>
        message.includes(OPTIMISTIC_CONFLICT_HINT),
      );
      if (conflictMessage) {
        toast.error(conflictMessage);
        router.refresh();
      }
    }
  }, [lastResult, router]);

  const formErrors = form.errors;

  return (
    <form {...getFormProps(form)} action={action} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>データ保持ポリシー（保持月数）</CardTitle>
          <CardDescription>
            保持期間を過ぎた個人情報の削除・匿名化に使う月数を設定します。{" "}
            <span className="font-medium">0</span>{" "}
            を指定した項目は自動削除の対象外（opt-out）です。実際の purge は上記
            「データ保持ポリシーの自動適用」モジュールが ON のときのみ、毎日の
            cron から実行されます。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            {...getInputProps(fields.expectedUpdatedAt, { type: "hidden" })}
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {RETENTION_FIELDS.map(({ key, label, hint }) => {
              const field = (() => {
                switch (key) {
                  case "sessionMonths":
                    return fields.sessionMonths;
                  case "verificationMonths":
                    return fields.verificationMonths;
                  case "reservationGuestMonths":
                    return fields.reservationGuestMonths;
                  case "inquiryMonths":
                    return fields.inquiryMonths;
                  case "customerInactiveMonths":
                    return fields.customerInactiveMonths;
                  default: {
                    const _exhaustive: never = key;
                    return _exhaustive;
                  }
                }
              })();
              return (
                <div key={key} className="space-y-1.5">
                  <label
                    className="block text-sm font-medium text-foreground"
                    htmlFor={field.id}
                  >
                    {label}（月）
                  </label>
                  <Input
                    {...getInputProps(field, { type: "number" })}
                    min={0}
                    step={1}
                    disabled={isPending}
                  />
                  <p className="text-xs text-muted-foreground">{hint}</p>
                  {field.errors && field.errors.length > 0 && (
                    <p id={field.errorId} className="text-sm text-destructive">
                      {field.errors.join(", ")}
                    </p>
                  )}
                </div>
              );
            })}
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
          <div className="flex justify-end pt-2">
            <SubmitButton
              isPending={isPending}
              label="保存"
              pendingLabel="保存中..."
            />
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
