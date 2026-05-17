"use client";

/**
 * スタッフ招待フォーム
 *
 * への clean break 移行。`sendInvitation` Server Action は
 * `(prev, formData)` SubmissionResult signature。
 *
 * ロール選択肢は `invitableRoles` prop（呼び出し側が現在ユーザーの階層から決定）。
 * サーバー側でも `canInviteRole()` で defense-in-depth チェックを行う。
 */

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  getFormProps,
  getInputProps,
  useForm,
  useInputControl,
} from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { Button } from "@/admin/components/ui/button";
import { SubmitButton } from "@/admin/components/ui";
import { Input } from "@/admin/components/ui/input";
import { Label } from "@/admin/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui/select";
import { sendInvitation } from "@/admin/actions/staff-invitation";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/shared/lib/admin-roles";
import { createInvitationSchema } from "@/shared/lib/validations/staff-invitation";
import { Role } from "@/shared/lib/validations/enums/prisma-types";

/**
 * 招待フォームが受け付けるロール（createInvitationSchema の INVITABLE_ROLES と一致）。
 */
type InvitableRole = "ADMIN" | "EDITOR" | "VIEWER";

const INVITABLE_ROLE_SET = new Set<string>([
  Role.ADMIN,
  Role.EDITOR,
  Role.VIEWER,
]);

function isInvitableRole(value: string): value is InvitableRole {
  return INVITABLE_ROLE_SET.has(value);
}

type Props = {
  /** 現在ユーザーが付与可能なロール（`getInvitableRoles(currentUser.role)` で取得） */
  invitableRoles: readonly Role[];
};

export function InviteForm({ invitableRoles }: Props) {
  const router = useRouter();

  // 安全側の狭窄: invitableRoles は既に actor 階層でフィルタされているが、schema の枠で絞る
  const safeRoles = invitableRoles.filter(isInvitableRole);

  const defaultRole: InvitableRole = safeRoles.includes("EDITOR")
    ? "EDITOR"
    : (safeRoles[0] ?? "VIEWER");

  const [lastResult, action, isPending] = useActionState(
    sendInvitation,
    undefined,
  );

  const [form, fields] = useForm({
    id: "staff-invite",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: createInvitationSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      email: "",
      name: "",
      role: defaultRole,
    },
  });

  const roleControl = useInputControl(fields.role);
  const currentRole =
    roleControl.value && isInvitableRole(roleControl.value)
      ? roleControl.value
      : defaultRole;

  // `lastResult.initialValue === null` が conform v1 の resetForm: true 成功 signal。
  // success state を局所 useState で複製せず、render 中に直接 derive する
  // (eslint-react/set-state-in-effect 違反回避)。
  const success = lastResult?.initialValue === null;

  useEffect(() => {
    if (!success) return undefined;
    const timeout = setTimeout(() => {
      router.push("/admin/staff");
      router.refresh();
    }, 3000);
    return () => clearTimeout(timeout);
  }, [success, router]);

  if (success) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-md bg-success/10 p-6 text-center"
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success/20">
          <svg
            className="h-6 w-6 text-success"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-success">
          招待メールを送信しました
        </h3>
        <p className="mt-2 text-sm text-success/80">
          スタッフにメールが届き、パスワードを設定するとログインできるようになります。
        </p>
        <p className="mt-4 text-xs text-success">スタッフ一覧に戻ります...</p>
      </div>
    );
  }

  const formErrors = form.errors;

  return (
    <form {...getFormProps(form)} action={action} className="space-y-6">
      <div className="rounded-md bg-info/10 p-4 text-sm text-info">
        <p className="font-medium">招待フローについて</p>
        <p className="mt-1">
          メールアドレスを入力して招待を送信すると、スタッフ宛に招待メールが届きます。
          スタッフは自分でパスワードを設定してログインできるようになります。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={fields.email.id}>メールアドレス *</Label>
          <Input
            {...getInputProps(fields.email, { type: "email" })}
            autoComplete="email"
            placeholder="staff@example.com"
            disabled={isPending}
          />
          {fields.email.errors && (
            <p
              id={fields.email.errorId}
              role="alert"
              className="text-xs text-destructive"
            >
              {fields.email.errors.join(", ")}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor={fields.name.id}>名前（任意）</Label>
          <Input
            {...getInputProps(fields.name, { type: "text" })}
            autoComplete="name"
            placeholder="山田 太郎"
            disabled={isPending}
            aria-describedby={
              fields.name.errors
                ? fields.name.errorId
                : `${fields.name.id}-hint`
            }
          />
          <p
            id={`${fields.name.id}-hint`}
            className="text-xs text-muted-foreground"
          >
            未入力の場合、メールアドレスから自動生成されます
          </p>
          {fields.name.errors && (
            <p
              id={fields.name.errorId}
              role="alert"
              className="text-xs text-destructive"
            >
              {fields.name.errors.join(", ")}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={fields.role.id}>ロール *</Label>
        <Select
          value={currentRole}
          onValueChange={(value) => {
            if (isInvitableRole(value)) {
              roleControl.change(value);
            }
          }}
          disabled={isPending}
        >
          <SelectTrigger
            id={fields.role.id}
            className="w-full md:w-1/2"
            aria-describedby={`${fields.role.id}-description`}
            onBlur={roleControl.blur}
          >
            <SelectValue placeholder="ロールを選択" />
          </SelectTrigger>
          <SelectContent>
            {safeRoles.map((role) => (
              <SelectItem key={role} value={role}>
                {ROLE_LABELS[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input type="hidden" name={fields.role.name} value={currentRole} />
        <p
          id={`${fields.role.id}-description`}
          className="text-xs text-muted-foreground"
        >
          {ROLE_DESCRIPTIONS[currentRole]}
        </p>
        {fields.role.errors && (
          <p role="alert" className="text-xs text-destructive">
            {fields.role.errors.join(", ")}
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

      <div className="flex gap-4">
        <SubmitButton
          isPending={isPending}
          label="招待メールを送信"
          pendingLabel="送信中..."
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isPending}
        >
          キャンセル
        </Button>
      </div>
    </form>
  );
}
