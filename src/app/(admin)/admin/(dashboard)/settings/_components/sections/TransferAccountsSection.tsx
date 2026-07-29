"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { SubmissionResult } from "@conform-to/react";
import { getFormProps, getInputProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { Label, SubmitButton, Textarea } from "@/admin/components/ui";
import { transferGuidanceFormSchema } from "@/shared/lib/validations/transfer-account";
import type { TransferAccountRecord } from "@/shared/domain/settings/transfer-account-queries";
import type { Serialized } from "@/shared/lib/serialize";
import { updateTransferGuidance } from "@/admin/actions/settings/transfer-accounts";
import { TransferAccountRegistry } from "@/admin/components/TransferAccountRegistry";

type Props = {
  accounts: Serialized<TransferAccountRecord>[];
  transferGuidance: string | null;
  organizationUpdatedAt: string;
};

export function TransferAccountsSection({
  accounts,
  transferGuidance,
  organizationUpdatedAt,
}: Props) {
  const router = useRouter();
  const [lastResult, formAction, isPending] = useActionState<
    SubmissionResult | undefined,
    FormData
  >(updateTransferGuidance, undefined);

  const [form, fields] = useForm({
    lastResult,
    defaultValue: {
      transferGuidance: transferGuidance ?? "",
      expectedUpdatedAt: organizationUpdatedAt,
    },
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: transferGuidanceFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
  });

  useEffect(() => {
    if (lastResult?.status === "success") {
      toast.success("振込案内文を保存しました");
      router.refresh();
    }
  }, [lastResult, router]);

  return (
    <div className="space-y-8">
      <TransferAccountRegistry accounts={accounts} />

      <form {...getFormProps(form)} action={formAction} className="space-y-4">
        <input
          {...getInputProps(fields.expectedUpdatedAt, { type: "hidden" })}
        />
        <div className="space-y-2">
          <Label htmlFor={fields.transferGuidance.id}>振込案内文</Label>
          <p className="text-sm text-muted-foreground">
            振込期限・手数料負担など、全口座共通の案内文を入力します。
          </p>
          <Textarea
            {...getInputProps(fields.transferGuidance, { type: "text" })}
            rows={5}
          />
          {fields.transferGuidance.errors?.map((error) => (
            <p key={error} className="text-sm text-destructive">
              {error}
            </p>
          ))}
        </div>
        <SubmitButton
          form={form.id}
          isPending={isPending}
          label="案内文を保存"
        />
      </form>
    </div>
  );
}
