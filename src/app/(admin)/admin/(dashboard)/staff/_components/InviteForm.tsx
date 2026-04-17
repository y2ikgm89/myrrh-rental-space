"use client";

/**
 * スタッフ招待フォーム
 *
 * メールアドレスを入力して招待メールを送信
 * スタッフ自身がパスワードを設定するフロー
 *
 * ロール選択肢は `invitableRoles` prop（呼び出し側が現在ユーザーの階層から決定）に従う。
 * サーバー側でも `canInviteRole()` で defense-in-depth チェックを行う。
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
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
import { useFormAction } from "@/admin/hooks";
import { sendInvitation } from "@/admin/actions/staff-invitation";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/shared/lib/admin-roles";
import { createInvitationSchema } from "@/shared/lib/validations/staff-invitation";
import { Role } from "@/shared/lib/validations/enums/prisma-types";

/**
 * 招待フォームが受け付けるロール（createInvitationSchema の INVITABLE_ROLES と一致）。
 * `invitableRoles` prop はこのサブセットで渡される（actor 階層による更なるフィルタ）。
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
  const [success, setSuccess] = useState(false);

  // 安全側の狭窄: invitableRoles は既に actor 階層でフィルタされているが、schema の枠で絞る
  const safeRoles = invitableRoles.filter(isInvitableRole);

  const defaultRole: InvitableRole = safeRoles.includes("EDITOR")
    ? "EDITOR"
    : (safeRoles[0] ?? "VIEWER");

  const { form, isPending, onSubmit } = useFormAction(
    createInvitationSchema,
    async (data) =>
      sendInvitation({
        email: data.email,
        name: data.name || undefined,
        role: data.role,
      }),
    {
      successMessage: "招待メールを送信しました",
      defaultValues: {
        email: "",
        name: "",
        role: defaultRole,
      },
      onSuccess: () => {
        setSuccess(true);
        form.reset();
        setTimeout(() => {
          router.push("/admin/staff");
          router.refresh();
        }, 3000);
      },
    },
  );

  const {
    register,
    setValue,
    control,
    formState: { errors },
  } = form;

  const currentRole = useWatch({ control, name: "role" });

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

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="rounded-md bg-info/10 p-4 text-sm text-info">
        <p className="font-medium">招待フローについて</p>
        <p className="mt-1">
          メールアドレスを入力して招待を送信すると、スタッフ宛に招待メールが届きます。
          スタッフは自分でパスワードを設定してログインできるようになります。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="email">メールアドレス *</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            {...register("email")}
            placeholder="staff@example.com"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
          />
          {errors.email && (
            <p
              id="email-error"
              role="alert"
              className="text-xs text-destructive"
            >
              {errors.email.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">名前（任意）</Label>
          <Input
            id="name"
            autoComplete="name"
            {...register("name")}
            placeholder="山田 太郎"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "name-error" : "name-hint"}
          />
          <p id="name-hint" className="text-xs text-muted-foreground">
            未入力の場合、メールアドレスから自動生成されます
          </p>
          {errors.name && (
            <p
              id="name-error"
              role="alert"
              className="text-xs text-destructive"
            >
              {errors.name.message}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="role">ロール *</Label>
        <Select
          value={currentRole}
          onValueChange={(value) => {
            if (isInvitableRole(value)) {
              setValue("role", value);
            }
          }}
        >
          <SelectTrigger
            id="role"
            className="w-full md:w-1/2"
            aria-describedby="role-description"
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
        <p id="role-description" className="text-xs text-muted-foreground">
          {ROLE_DESCRIPTIONS[currentRole]}
        </p>
        {errors.role && (
          <p role="alert" className="text-xs text-destructive">
            {errors.role.message}
          </p>
        )}
      </div>

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
